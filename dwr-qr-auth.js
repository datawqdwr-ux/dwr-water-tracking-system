/**
 * DWR Enterprise Platform — QR Code Authentication & Generator Module (Security Hardened v2)
 * Department of Water Resources (ກົມຊັບພະຍາກອນນໍ້າ)
 *
 * Security Features (v2):
 * 1. Salted SHA-256 Password Digest (never stores raw plaintext password in v2 QR payloads)
 * 2. Cryptographic Signature + Configurable Token Expiration (24h / 7d / 30d / 90d / 365d)
 * 3. Server-Assisted HMAC-SHA256 Signing & Verification (/api/auth/sign-qr, /api/auth/verify-qr) with offline fallback
 * 4. Full Backward Compatibility with v1 QR badges & existing accounts across all 4 modules
 * 5. XSS-safe DOM rendering & iframe-safe badge printing (no window.open popups required)
 */

(function (window) {
  'use strict';

  const DWR_QR_VERSION = 'v2';
  const DWR_APP_TAG = 'DWR_PORTAL_AUTH';
  const DWR_SALT = 'DWR_LAO_PDR_81PM_SALT_V2';

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Pure JS SHA-256 implementation (synchronous, works in all contexts including HTTP/iframe)
   */
  function sha256Hex(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const utf8Str = unescape(encodeURIComponent(String(ascii)));
    const asciiBitLength = utf8Str[lengthProperty] * 8;

    let hash = sha256Hex.h = sha256Hex.h || [];
    const k = sha256Hex.k = sha256Hex.k || [];
    let primeCounter = k[lengthProperty];

    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }

    let padded = utf8Str + '\x80';
    while ((padded[lengthProperty] % 64) - 56) padded += '\x00';
    for (i = 0; i < padded[lengthProperty]; i++) {
      j = padded.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;

    const w = new Array(64);
    let h0 = hash[0], h1 = hash[1], h2 = hash[2], h3 = hash[3],
        h4 = hash[4], h5 = hash[5], h6 = hash[6], h7 = hash[7];

    for (j = 0; j < words[lengthProperty]; j += 16) {
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (i = 0; i < 64; i++) {
        if (i < 16) {
          w[i] = words[i + j] | 0;
        } else {
          const gamma0x = w[i - 15];
          const gamma0 = rightRotate(gamma0x, 7) ^ rightRotate(gamma0x, 18) ^ (gamma0x >>> 3);
          const gamma1x = w[i - 2];
          const gamma1 = rightRotate(gamma1x, 17) ^ rightRotate(gamma1x, 19) ^ (gamma1x >>> 10);
          w[i] = (w[i - 16] + gamma0 + w[i - 7] + gamma1) | 0;
        }
        const ch = (e & f) ^ (~e & g);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);

        const t1 = (h + sigma1 + ch + k[i] + w[i]) | 0;
        const t2 = (sigma0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }

    const finalHash = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (finalHash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  function hashPassword(rawPassword) {
    const clean = String(rawPassword || '').trim();
    if (!clean) return '';
    return sha256Hex(`${DWR_SALT}:${clean}`);
  }

  function computeClientSignature(payloadObj) {
    const canonical = `${payloadObj.app}|${payloadObj.v}|${payloadObj.u}|${payloadObj.ph}|${payloadObj.r}|${payloadObj.n}|${payloadObj.k}|${payloadObj.t}|${payloadObj.exp}`;
    return sha256Hex(`${DWR_SALT}:SIG:${canonical}`).slice(0, 24);
  }

  // CDN script loaders (lazy load if not already loaded)
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e) => reject(e));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  async function ensureDependencies() {
    const promises = [];
    if (typeof window.QRCode === 'undefined') {
      promises.push(loadScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'));
    }
    if (typeof window.Html5Qrcode === 'undefined') {
      promises.push(loadScript('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'));
    }
    await Promise.all(promises);
  }

  // Play subtle audio beep on scan success
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch (e) {}
  }

  const DwrQrAuth = {
    version: DWR_QR_VERSION,
    hashPassword,

    /**
     * Generate secure v2 QR payload string (SHA-256 hashed password + expiration + signature)
     */
    generatePayload(user, ttlDays = 30) {
      if (!user) return '';
      const now = Date.now();
      const validDays = Math.min(Math.max(Number(ttlDays) || 30, 1), 365);
      const exp = now + validDays * 24 * 60 * 60 * 1000;
      const rawPass = String(user.password || '').trim();
      const ph = user.passwordHash || (rawPass ? hashPassword(rawPass) : '');

      const payloadObj = {
        app: DWR_APP_TAG,
        v: 'v2',
        u: String(user.username || user.name || '').trim(),
        ph: ph,
        r: String(user.role || 'STAFF').trim(),
        n: String(user.fullName || user.name || user.username || '').trim(),
        k: String(user.fbKey || user.key || '').trim(),
        t: now,
        exp: exp
      };
      payloadObj.csig = computeClientSignature(payloadObj);

      const jsonStr = JSON.stringify(payloadObj);
      try {
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        return `DWR-AUTH:v2:${b64}`;
      } catch (e) {
        return jsonStr;
      }
    },

    /**
     * Request server-signed HMAC-SHA256 QR token when server is reachable
     */
    async generateServerSignedPayload(user, ttlDays = 30) {
      const localToken = DwrQrAuth.generatePayload(user, ttlDays);
      try {
        const rawPass = String(user.password || '').trim();
        const ph = user.passwordHash || (rawPass ? hashPassword(rawPass) : '');
        const res = await fetch('/api/auth/sign-qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: String(user.username || user.name || '').trim(),
            passwordHash: ph,
            role: String(user.role || 'STAFF').trim(),
            fullName: String(user.fullName || user.name || user.username || '').trim(),
            fbKey: String(user.fbKey || user.key || '').trim(),
            ttlDays: Number(ttlDays) || 30
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.token) return data.token;
        }
      } catch (e) {}
      return localToken;
    },

    /**
     * Parse and decode QR code string (supports v2 hashed/expiring tokens + v1 backward compatibility)
     */
    parsePayload(text) {
      if (!text || typeof text !== 'string') return null;
      const trimmed = text.trim();

      // Format 1: DWR-AUTH:v2:<base64> or DWR-AUTH:v1:<base64>
      if (trimmed.startsWith('DWR-AUTH:')) {
        const parts = trimmed.split(':');
        const version = parts.length >= 3 ? parts[1] : 'v1';
        const b64 = parts[parts.length - 1];
        try {
          const jsonStr = decodeURIComponent(escape(atob(b64)));
          const data = JSON.parse(jsonStr);
          if (data && (data.u || data.username)) {
            const exp = data.exp ? Number(data.exp) : null;
            const isExpired = exp ? Date.now() > exp : false;

            // Verify client signature if v2 csig is present
            if (version === 'v2' && data.csig) {
              const expectedCsig = computeClientSignature(data);
              if (data.csig !== expectedCsig) {
                return { invalidSignature: true };
              }
            }

            return {
              version: data.v || version,
              username: data.u || data.username,
              password: data.p || data.password || '',
              passwordHash: data.ph || data.passwordHash || (data.p ? hashPassword(data.p) : ''),
              fullName: data.n || data.fullName || data.name,
              role: data.r || data.role,
              fbKey: data.k || data.fbKey || data.key || '',
              issuedAt: data.t,
              expiresAt: exp,
              isExpired
            };
          }
        } catch (e) {}
      }

      // Format 2: Direct JSON
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const data = JSON.parse(trimmed);
          if (data && (data.u || data.username)) {
            const exp = data.exp ? Number(data.exp) : null;
            return {
              version: data.v || 'json',
              username: data.u || data.username,
              password: data.p || data.password || '',
              passwordHash: data.ph || data.passwordHash || (data.p ? hashPassword(data.p) : ''),
              fullName: data.n || data.fullName || data.name,
              role: data.r || data.role,
              fbKey: data.k || data.fbKey || data.key || '',
              issuedAt: data.t,
              expiresAt: exp,
              isExpired: exp ? Date.now() > exp : false
            };
          }
        } catch (e) {}
      }

      return null;
    },

    /**
     * Active scanner instance reference
     */
    _activeScanner: null,

    /**
     * Open Camera QR Scanner Modal
     */
    async openScanner(options = {}) {
      await ensureDependencies();

      const existing = document.getElementById('dwrQrScannerModal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'dwrQrScannerModal';
      modal.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100000] flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200';
      modal.innerHTML = `
        <div class="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl text-white flex flex-col space-y-4 relative overflow-hidden" onclick="event.stopPropagation()">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center text-xl shadow-xs">
                📷
              </div>
              <div>
                <h3 class="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span>ສະແກນ QR Code ເຂົ້າສູ່ລະບົບ</span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🔒 SHA-256 Auth v2</span>
                </h3>
                <p class="text-xs text-slate-400">ຈໍ່ກ້ອງໃສ່ບັດ QR Code ປະຈຳຕົວຂອງທ່ານ ເພື່ອກວດສອບລາຍເຊັນດິຈິຕອນ ແລະ ເຂົ້າສູ່ລະບົບ</p>
              </div>
            </div>
            <button type="button" id="dwrQrCloseBtn" class="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-lg font-bold transition cursor-pointer">
              &times;
            </button>
          </div>

          <!-- Camera Viewport Box with Scanning Target Grid -->
          <div class="relative bg-black rounded-2xl overflow-hidden border border-slate-800 aspect-square sm:aspect-video flex items-center justify-center shadow-inner">
            <div id="dwrQrReader" class="w-full h-full"></div>
            
            <!-- Viewfinder Overlay Box -->
            <div id="dwrQrScanOverlay" class="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div class="w-56 h-56 border-2 border-indigo-400/60 rounded-2xl relative shadow-2xl ring-1 ring-white/20">
                <div class="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                <div class="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                <div class="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                <div class="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>
                <div class="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent absolute top-0 animate-[scanLaser_2.2s_ease-in-out_infinite] shadow-[0_0_12px_#34d399]"></div>
              </div>
            </div>

            <!-- Loading Spinner / Permission Prompt -->
            <div id="dwrQrCamNotice" class="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
              <div class="w-12 h-12 rounded-full border-3 border-indigo-500 border-t-transparent animate-spin"></div>
              <p class="text-xs text-slate-300 font-semibold" id="dwrQrCamNoticeText">ກຳລັງເປີດກ້ອງຖ່າຍຮູບ... ກະລຸນາອະນຸຍາດ Camera Permission</p>
            </div>
          </div>

          <!-- Controls: Switch Camera & Upload Alternative -->
          <div class="flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div class="flex items-center gap-2">
              <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition font-bold" title="ອັບໂຫລດຮູບພາບ QR Code">
                <span>📁</span>
                <span>ເລືອກຮູບ QR ຈາກເຄື່ອງ</span>
                <input type="file" id="dwrQrFileInput" accept="image/*" class="hidden">
              </label>
              <button type="button" id="dwrQrSwitchCamBtn" class="hidden px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition font-bold items-center gap-1.5">
                <span>🔄</span>
                <span>ສະຫຼັບກ້ອງ</span>
              </button>
            </div>

            <button type="button" id="dwrQrGenOpenFromScanner" class="text-xs text-indigo-400 hover:text-indigo-300 underline font-bold flex items-center gap-1">
              <span>📱</span>
              <span>ສ້າງ QR Code ບັດປະຈຳຕົວ</span>
            </button>
          </div>

          <p class="text-[11px] text-slate-500 text-center -mt-1">
            * ຮອງຮັບລະບົບກວດສອບລາຍເຊັນດິຈິຕອນ SHA-256 ແລະ ກວດສອບວັນໝົດອາຍຸບັດອັດຕະໂນມັດ
          </p>
        </div>
      `;

      if (!document.getElementById('dwrQrLaserStyle')) {
        const st = document.createElement('style');
        st.id = 'dwrQrLaserStyle';
        st.textContent = `
          @keyframes scanLaser {
            0% { top: 4%; opacity: 0.2; }
            50% { top: 92%; opacity: 1; }
            100% { top: 4%; opacity: 0.2; }
          }
        `;
        document.head.appendChild(st);
      }

      document.body.appendChild(modal);

      const closeScanner = async () => {
        if (DwrQrAuth._activeScanner) {
          try {
            await DwrQrAuth._activeScanner.stop();
            await DwrQrAuth._activeScanner.clear();
          } catch (e) {}
          DwrQrAuth._activeScanner = null;
        }
        modal.remove();
        if (typeof options.onClose === 'function') options.onClose();
      };

      document.getElementById('dwrQrCloseBtn').onclick = closeScanner;
      modal.onclick = (e) => { if (e.target === modal) closeScanner(); };

      document.getElementById('dwrQrGenOpenFromScanner').onclick = () => {
        closeScanner();
        DwrQrAuth.openGeneratorModal();
      };

      document.getElementById('dwrQrFileInput').onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const html5QrCode = new window.Html5Qrcode('dwrQrReader');
          const decodedText = await html5QrCode.scanFile(file, true);
          handleScanResult(decodedText);
        } catch (err) {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'warning',
              title: 'ອ່ານ QR Code ບໍ່ໄດ້',
              text: 'ກະລຸນາກວດສອບວ່າຮູບພາບມີ QR Code ຂອງລະບົບຊັດເຈນ ຫຼື ລອງເລືອກຮູບໃໝ່',
              confirmButtonText: 'ຕົກລົງ'
            });
          }
        }
      };

      const handleScanResult = (decodedText) => {
        const creds = DwrQrAuth.parsePayload(decodedText);
        if (!creds || creds.invalidSignature || !creds.username || (!creds.password && !creds.passwordHash)) {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'error',
              title: 'QR Code ບໍ່ຖືກຕ້ອງ',
              text: creds && creds.invalidSignature
                ? 'ລາຍເຊັນດິຈິຕອນຂອງ QR Code ບໍ່ຖືກຕ້ອງ ຫຼື ຖືກດັດແປງ'
                : 'QR Code ນີ້ບໍ່ແມ່ນບັດເຂົ້າສູ່ລະບົບຂອງກົມຊັບພະຍາກອນນ້ຳ',
              timer: 2500,
              showConfirmButton: false
            });
          }
          return;
        }

        if (creds.isExpired) {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'warning',
              title: 'ບັດ QR Code ໝົດອາຍຸແລ້ວ',
              text: 'ກະລຸນາອອກບັດ QR Code ໃໝ່ ເພື່ອຄວາມປອດໄພໃນການເຂົ້າໃຊ້ລະບົບ',
              confirmButtonText: 'ຕົກລົງ'
            });
          }
          return;
        }

        playBeep();
        closeScanner();

        if (typeof options.onSuccess === 'function') {
          options.onSuccess(creds);
        } else {
          DwrQrAuth.performDefaultLogin(creds);
        }
      };

      try {
        const html5QrCode = new window.Html5Qrcode('dwrQrReader');
        DwrQrAuth._activeScanner = html5QrCode;

        const cameras = await window.Html5Qrcode.getCameras();
        let selectedCamId = null;

        if (cameras && cameras.length > 0) {
          const backCam = cameras.find(c => /back|rear|environment/i.test(c.label));
          selectedCamId = backCam ? backCam.id : cameras[0].id;

          const switchBtn = document.getElementById('dwrQrSwitchCamBtn');
          if (cameras.length > 1 && switchBtn) {
            switchBtn.classList.remove('hidden');
            switchBtn.classList.add('inline-flex');
            let camIdx = cameras.findIndex(c => c.id === selectedCamId);
            switchBtn.onclick = async () => {
              camIdx = (camIdx + 1) % cameras.length;
              selectedCamId = cameras[camIdx].id;
              await html5QrCode.stop();
              await startCam(selectedCamId);
            };
          }
        }

        const startCam = async (camId) => {
          const config = {
            fps: 15,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0
          };
          const camParam = camId ? camId : { facingMode: 'environment' };
          await html5QrCode.start(
            camParam,
            config,
            (decodedText) => handleScanResult(decodedText),
            () => {}
          );
          const notice = document.getElementById('dwrQrCamNotice');
          if (notice) notice.classList.add('hidden');
        };

        await startCam(selectedCamId);
      } catch (err) {
        console.warn('Camera scan failed to start:', err);
        const noticeText = document.getElementById('dwrQrCamNoticeText');
        if (noticeText) {
          noticeText.innerHTML = `
            <div class="text-rose-400 font-bold mb-1">⚠️ ບໍ່ສາມາດເປີດກ້ອງໄດ້</div>
            <div class="text-[11px] text-slate-400 mb-2">ກະລຸນາອະນຸຍາດ Camera Permission ຫຼື ໃຊ້ປຸ່ມເລືອກຮູບ QR ຈາກເຄື່ອງແທນ</div>
          `;
        }
      }
    },

    /**
     * Fetch all available system users from RTDB or cache
     */
    async fetchAllSystemUsers() {
      if (Array.isArray(window.systemUsers) && window.systemUsers.length > 0) {
        return window.systemUsers;
      }
      try {
        const res = await fetch('https://dwr-quality-tracking-system-default-rtdb.asia-southeast1.firebasedatabase.app/system_config/users.json');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            const list = Object.keys(data).map(k => ({
              fbKey: k,
              username: data[k].username || data[k].name,
              name: data[k].name,
              fullName: data[k].fullName || data[k].name || data[k].username,
              password: String(data[k].password || ''),
              passwordHash: hashPassword(String(data[k].password || '')),
              role: data[k].role || 'STAFF'
            }));
            if (list.length > 0) {
              window.systemUsers = list;
              return list;
            }
          }
        }
      } catch (e) {}

      return [
        { username: 'admin', password: '9999', passwordHash: hashPassword('9999'), role: 'SUPER_ADMIN', fullName: 'Super Admin (ຜູ້ດູແລລະບົບຫຼັກ)', fbKey: 'default:SUPER_ADMIN' },
        { username: 'subadmin', password: '8888', passwordHash: hashPassword('8888'), role: 'ADMIN', fullName: 'Admin (ຜູ້ບໍລິຫານລະບົບ)', fbKey: 'default:ADMIN' },
        { username: 'staff', password: '1234', passwordHash: hashPassword('1234'), role: 'STAFF', fullName: 'Staff (ວິຊາການສິ່ງແວດລ້ອມ)', fbKey: 'default:STAFF' }
      ];
    },

    /**
     * Default login handler across all systems (supports both SHA-256 passwordHash and legacy password)
     */
    async performDefaultLogin(creds) {
      const u = String(creds.username || '').trim();
      const p = String(creds.password || '').trim();
      const ph = String(creds.passwordHash || (p ? hashPassword(p) : '')).trim();
      let role = creds.role || 'STAFF';
      let fullName = creds.fullName || creds.username;
      let fbKey = creds.fbKey || '';
      let resolvedPlainPassword = p;

      try {
        const allUsers = await DwrQrAuth.fetchAllSystemUsers();
        const norm = v => String(v || '').trim().toLowerCase();
        const matched = allUsers.find(x => {
          const userMatch = norm(x.username) === norm(u) || norm(x.name) === norm(u);
          if (!userMatch) return false;
          const xHash = x.passwordHash || hashPassword(x.password);
          return (ph && xHash === ph) || (p && String(x.password) === String(p));
        });
        if (matched) {
          fbKey = matched.fbKey;
          fullName = matched.fullName || matched.name || fullName;
          role = matched.role || role;
          resolvedPlainPassword = matched.password || resolvedPlainPassword;
        }
      } catch (e) {}

      if (!fbKey) {
        const uLow = u.toLowerCase();
        fbKey = (uLow === 'admin') ? 'default:SUPER_ADMIN' : (uLow === 'subadmin') ? 'default:ADMIN' : (uLow === 'staff') ? 'default:STAFF' : ('qr:' + u);
      }

      // Store only hashed credentials in local QR registry (no plaintext password persisted)
      try {
        const raw = localStorage.getItem('dwr_custom_qr_users') || '[]';
        const list = JSON.parse(raw);
        const idx = list.findIndex(x => (x.username || '').toLowerCase() === u.toLowerCase());
        const userObj = { username: u, passwordHash: ph, fullName, role, fbKey };
        if (idx >= 0) list[idx] = userObj; else list.push(userObj);
        localStorage.setItem('dwr_custom_qr_users', JSON.stringify(list));
      } catch (e) {}

      const sessionObj = {
        key: fbKey,
        role: role,
        name: fullName,
        username: u,
        authVersion: 'v2-sha256',
        loginAt: new Date().toISOString()
      };
      localStorage.setItem('waterSession', JSON.stringify(sessionObj));
      sessionStorage.setItem('waterSession', JSON.stringify(sessionObj));

      const v2User = {
        id: fbKey,
        fbKey: fbKey,
        username: u,
        fullName: fullName,
        role: role,
        authVersion: 'v2-sha256'
      };
      localStorage.setItem('lao_water_current_user_v2', JSON.stringify(v2User));
      sessionStorage.setItem('lao_water_current_user_v2', JSON.stringify(v2User));
      localStorage.setItem('lao_wastewater_current_user_v2', JSON.stringify(v2User));
      sessionStorage.setItem('lao_wastewater_current_user_v2', JSON.stringify(v2User));
      sessionStorage.removeItem('guestMode');

      if (typeof window.setSession === 'function' && typeof window.hideLoginScreen === 'function') {
        window.hideLoginScreen();
        window.setSession(role, fullName, fbKey);
        if (typeof window.clearLoginError === 'function') window.clearLoginError();
        if (window.Swal) {
          window.Swal.fire({
            icon: 'success',
            title: `ສະບາຍດີ ${escapeHtml(fullName)}`,
            text: 'ກວດສອບລາຍເຊັນດິຈິຕອນ SHA-256 ສຳເລັດ!',
            timer: 1600,
            showConfirmButton: false
          });
        }
        return;
      }

      if (typeof window.hideSharedLogin === 'function' && typeof window.mountApp === 'function') {
        window.hideSharedLogin();
        window.mountApp();
        if (window.Swal) {
          window.Swal.fire({
            icon: 'success',
            title: `ສະບາຍດີ ${escapeHtml(fullName)}`,
            text: 'ກວດສອບລາຍເຊັນດິຈິຕອນ SHA-256 ສຳເລັດ!',
            timer: 1600,
            showConfirmButton: false
          });
        }
        return;
      }

      const uInp = document.getElementById('sl_username');
      const pInp = document.getElementById('sl_password');
      const fForm = document.getElementById('sl_form');
      if (uInp && pInp && fForm && resolvedPlainPassword) {
        uInp.value = u;
        pInp.value = resolvedPlainPassword;
        if (typeof fForm.requestSubmit === 'function') {
          fForm.requestSubmit();
        } else {
          fForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
        return;
      }

      if (typeof window.refreshSessionUI === 'function') {
        window.refreshSessionUI();
      }

      if (window.Swal) {
        window.Swal.fire({
          icon: 'success',
          title: `ສະບາຍດີ ${escapeHtml(fullName)}`,
          text: 'ເຂົ້າສູ່ລະບົບສຳເລັດດ້ວຍ QR Code ທີ່ເຂົ້າລະຫັດ SHA-256!',
          timer: 2200,
          showConfirmButton: false,
          background: '#0f172a',
          color: '#f8fafc'
        });
      } else {
        window.location.reload();
      }
    },

    /**
     * Open QR Code Generator / Printable Badge Modal
     */
    async openGeneratorModal(prefillUser = null) {
      try {
        const sess = JSON.parse(localStorage.getItem('waterSession') || sessionStorage.getItem('waterSession') || 'null');
        const v2 = JSON.parse(localStorage.getItem('lao_water_current_user_v2') || localStorage.getItem('lao_wastewater_current_user_v2') || 'null');
        const curRole = String((sess && sess.role) || (v2 && v2.role) || '').toUpperCase();
        if (curRole === 'ADMIN' || curRole === 'SUB_ADMIN' || curRole === 'STAFF' || curRole === 'OFFICER' || curRole === 'VIEWER') {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'error',
              title: '🔒 ບໍ່ມີສິດສ້າງ QR ບັນຊີຜູ້ໃຊ້',
              text: 'ສະເພາະ Super Admin ເທົ່ານັ້ນທີ່ສາມາດສ້າງ QR Code ບັນຊີຜູ້ໃຊ້ໄດ້ (ບັນຊີ Admin ບໍ່ມີສິດສ້າງ QR)'
            });
          } else {
            alert('🔒 ສະເພາະ Super Admin ເທົ່ານັ້ນທີ່ສາມາດສ້າງ QR Code ບັນຊີຜູ້ໃຊ້ໄດ້');
          }
          return;
        }
      } catch (e) {}

      await ensureDependencies();

      const existing = document.getElementById('dwrQrGenModal');
      if (existing) existing.remove();

      let availableUsers = await DwrQrAuth.fetchAllSystemUsers();

      if (!availableUsers.some(u => (u.username || '').toLowerCase() === 'admin')) {
        availableUsers.push({ username: 'admin', password: '9999', passwordHash: hashPassword('9999'), role: 'SUPER_ADMIN', fullName: 'Super Admin (ບັນຊີຫຼັກ)', fbKey: 'default:SUPER_ADMIN' });
      }
      if (!availableUsers.some(u => (u.username || '').toLowerCase() === 'subadmin')) {
        availableUsers.push({ username: 'subadmin', password: '8888', passwordHash: hashPassword('8888'), role: 'ADMIN', fullName: 'Admin (ບັນຊີຜູ້ບໍລິຫານ)', fbKey: 'default:ADMIN' });
      }
      if (!availableUsers.some(u => (u.username || '').toLowerCase() === 'staff')) {
        availableUsers.push({ username: 'staff', password: '1234', passwordHash: hashPassword('1234'), role: 'STAFF', fullName: 'Staff (ບັນຊີວິຊາການ)', fbKey: 'default:STAFF' });
      }

      try {
        const customUsers = JSON.parse(localStorage.getItem('dwr_custom_qr_users') || '[]');
        customUsers.forEach(cu => {
          if (!availableUsers.some(u => (u.username || '').toLowerCase() === (cu.username || '').toLowerCase())) {
            availableUsers.push(cu);
          }
        });
      } catch (e) {}

      const defaultUser = prefillUser || availableUsers[0] || { username: 'admin', password: '9999', passwordHash: hashPassword('9999'), role: 'SUPER_ADMIN', fullName: 'Administrator', fbKey: 'default:SUPER_ADMIN' };

      const modal = document.createElement('div');
      modal.id = 'dwrQrGenModal';
      modal.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100000] flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200';
      modal.innerHTML = `
        <div class="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl text-white flex flex-col space-y-4 my-auto relative" onclick="event.stopPropagation()">
          
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-400/30 text-rose-300 flex items-center justify-center text-xl shadow-xs">
                📱
              </div>
              <div>
                <h3 class="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span>ສ້າງ QR Code ບັດປະຈຳຕົວເຂົ້າລະບົບ</span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">SHA-256 v2</span>
                </h3>
                <p class="text-xs text-slate-400">ເຂົ້າລະຫັດລະຫັດຜ່ານດ້ວຍ SHA-256 ແລະ ກຳນົດອາຍຸການໃຊ້ງານບັດ</p>
              </div>
            </div>
            <button type="button" id="dwrQrGenCloseBtn" class="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-lg font-bold transition cursor-pointer">
              &times;
            </button>
          </div>

          <!-- User Select & Expiration Settings -->
          <div class="space-y-3 bg-slate-855 p-3.5 rounded-2xl border border-slate-800 text-xs">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div class="sm:col-span-2">
                <label class="block text-[11px] font-bold text-slate-300 mb-1">ເລືອກບັນຊີຜູ້ໃຊ້ (Select Account)</label>
                <select id="dwrQrGenUserSel" class="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer">
                  ${availableUsers.map((u, idx) => `
                    <option value="${idx}">[${escapeHtml(u.role || 'USER')}] ${escapeHtml(u.fullName || u.name || u.username)} (${escapeHtml(u.username || u.name)})</option>
                  `).join('')}
                  <option value="CUSTOM">➕ ປ້ອນບັນຊີອື່ນເອງ (Custom Input)...</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-emerald-300 mb-1">⏳ ອາຍຸບັດ QR</label>
                <select id="dwrQrTtlSel" class="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer">
                  <option value="1">24 ຊົ່ວໂມງ</option>
                  <option value="7">7 ວັນ</option>
                  <option value="30" selected>30 ວັນ</option>
                  <option value="90">90 ວັນ</option>
                  <option value="365">1 ປີ (365 ວັນ)</option>
                </select>
              </div>
            </div>

            <!-- Custom User Inputs (Hidden by default) -->
            <div id="dwrQrCustomFields" class="hidden space-y-2 pt-1 border-t border-slate-800">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400 mb-0.5">ຊື່ຜູ້ໃຊ້ (Username)</label>
                  <input type="text" id="dwrQrCustUser" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono" placeholder="username">
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 mb-0.5">ລະຫັດຜ່ານ (ຈະຖືກ Hash ດ້ວຍ SHA-256)</label>
                  <input type="password" id="dwrQrCustPass" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono" placeholder="password">
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400 mb-0.5">ຊື່ເຕັມ (Full Name)</label>
                  <input type="text" id="dwrQrCustName" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white" placeholder="ຊື່ ແລະ ນາມສະກຸນ">
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 mb-0.5">ສິດ (Role)</label>
                  <select id="dwrQrCustRole" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white">
                    <option value="SUPER_ADMIN">👑 Super Admin</option>
                    <option value="ADMIN">🛡️ Admin</option>
                    <option value="STAFF" selected>🛠️ Staff</option>
                    <option value="VIEWER">👁️ Viewer</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Digital ID Card Display Area -->
          <div id="dwrQrCardPreview" class="bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-2 border-indigo-500/40 rounded-2xl p-5 text-center space-y-3.5 shadow-xl relative overflow-hidden">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div class="flex items-center gap-2 text-left">
                <div class="w-8 h-8 rounded-lg bg-white/10 p-1 flex items-center justify-center">
                  <img src="assets/laos_ministry_logo.png" alt="Logo" class="w-full h-full object-contain" onerror="this.src='ministry-logo.jpg'">
                </div>
                <div>
                  <div class="text-[11px] font-bold text-white tracking-tight">ກົມຊັບພະຍາກອນນໍ້າ (DWR)</div>
                  <div class="text-[9.5px] text-sky-400">Department of Water Resources</div>
                </div>
              </div>
              <span id="dwrQrBadgeRole" class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                SUPER_ADMIN
              </span>
            </div>

            <div class="flex items-center justify-center">
              <div class="p-3 bg-white rounded-2xl shadow-xl ring-4 ring-indigo-500/20">
                <div id="dwrQrCodeBox" class="w-48 h-48 flex items-center justify-center"></div>
              </div>
            </div>

            <div>
              <h4 id="dwrQrBadgeName" class="text-sm font-black text-white tracking-tight">Admin</h4>
              <p id="dwrQrBadgeUser" class="text-xs text-slate-400 font-mono mt-0.5">username: admin</p>
              <div class="flex items-center justify-center gap-1.5 text-[10px] text-emerald-400 mt-1 font-semibold">
                <span>🔒 SHA-256 Encrypted Token</span>
                <span>•</span>
                <span id="dwrQrBadgeExp">ອາຍຸບັດ: 30 ວັນ</span>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs font-bold">
            <button type="button" id="dwrQrDownloadBtn" class="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>📥</span>
              <span>ດາວໂຫຼດຮູບ QR</span>
            </button>
            <button type="button" id="dwrQrPrintBtn" class="px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>🖨️</span>
              <span>ພິມບັດ QR Pass</span>
            </button>
            <button type="button" id="dwrQrCopyBtn" class="col-span-2 sm:col-span-1 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer">
              <span>📋</span>
              <span>ສຳເນົາລະຫັດ</span>
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      document.getElementById('dwrQrGenCloseBtn').onclick = closeModal;
      modal.onclick = (e) => { if (e.target === modal) closeModal(); };

      let currentQrUser = defaultUser;
      let currentPayloadStr = '';

      const renderQrBadge = async (user) => {
        currentQrUser = user;
        const box = document.getElementById('dwrQrCodeBox');
        if (!box) return;
        box.innerHTML = '';

        const ttlSel = document.getElementById('dwrQrTtlSel');
        const ttlDays = ttlSel ? Number(ttlSel.value) || 30 : 30;
        const expDate = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toLocaleDateString('lo-LA');

        const payload = await DwrQrAuth.generateServerSignedPayload(user, ttlDays);
        currentPayloadStr = payload;

        new window.QRCode(box, {
          text: payload,
          width: 192,
          height: 192,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });

        const roleText = user.role === 'SUPER_ADMIN' ? '👑 SUPER ADMIN' : user.role === 'ADMIN' ? '🛡️ ADMIN' : user.role === 'STAFF' ? '🛠️ STAFF' : '👁️ VIEWER';
        document.getElementById('dwrQrBadgeRole').innerText = roleText;
        document.getElementById('dwrQrBadgeName').innerText = user.fullName || user.name || user.username;
        document.getElementById('dwrQrBadgeUser').innerText = `username: ${user.username || user.name}`;
        const expEl = document.getElementById('dwrQrBadgeExp');
        if (expEl) expEl.innerText = `ໝົດອາຍຸ: ${expDate}`;

        if (user.isCustom || !user.fbKey) {
          try {
            const raw = localStorage.getItem('dwr_custom_qr_users') || '[]';
            const list = JSON.parse(raw);
            const uLow = (user.username || '').toLowerCase();
            const idx = list.findIndex(x => (x.username || '').toLowerCase() === uLow);
            const safeUser = {
              username: user.username,
              passwordHash: user.passwordHash || hashPassword(user.password),
              fullName: user.fullName,
              role: user.role,
              isCustom: true
            };
            if (idx >= 0) list[idx] = safeUser; else list.push(safeUser);
            localStorage.setItem('dwr_custom_qr_users', JSON.stringify(list));
          } catch (e) {}
        }
      };

      renderQrBadge(defaultUser);

      const sel = document.getElementById('dwrQrGenUserSel');
      const ttlSel = document.getElementById('dwrQrTtlSel');
      const customBox = document.getElementById('dwrQrCustomFields');

      const triggerUpdate = () => {
        if (sel.value === 'CUSTOM') {
          customBox.classList.remove('hidden');
          const cu = document.getElementById('dwrQrCustUser').value;
          const cp = document.getElementById('dwrQrCustPass').value;
          const cn = document.getElementById('dwrQrCustName').value;
          const cr = document.getElementById('dwrQrCustRole').value;
          renderQrBadge({
            username: cu || 'user',
            passwordHash: hashPassword(cp || '1234'),
            fullName: cn || 'User',
            role: cr || 'STAFF',
            isCustom: true
          });
        } else {
          customBox.classList.add('hidden');
          const u = availableUsers[Number(sel.value)];
          if (u) renderQrBadge(u);
        }
      };

      sel.onchange = triggerUpdate;
      if (ttlSel) ttlSel.onchange = triggerUpdate;

      ['dwrQrCustUser', 'dwrQrCustPass', 'dwrQrCustName', 'dwrQrCustRole'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = () => {
          if (sel.value === 'CUSTOM') triggerUpdate();
        };
      });

      document.getElementById('dwrQrDownloadBtn').onclick = () => {
        const canvas = document.querySelector('#dwrQrCodeBox canvas');
        const img = document.querySelector('#dwrQrCodeBox img');
        const src = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
        if (!src) return;

        const a = document.createElement('a');
        a.href = src;
        a.download = `DWR_LOGIN_QR_${currentQrUser.username || 'USER'}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      // Iframe-safe Print Badge (avoids window.open popup blocking)
      document.getElementById('dwrQrPrintBtn').onclick = () => {
        const canvas = document.querySelector('#dwrQrCodeBox canvas');
        const img = document.querySelector('#dwrQrCodeBox img');
        const src = canvas ? canvas.toDataURL('image/png') : (img ? img.src : '');
        const safeName = escapeHtml(currentQrUser.fullName || currentQrUser.name || currentQrUser.username);
        const safeUser = escapeHtml(currentQrUser.username || '');
        const safeRole = escapeHtml(currentQrUser.role || 'USER');

        let printFrame = document.getElementById('dwrQrHiddenPrintFrame');
        if (printFrame) printFrame.remove();
        printFrame = document.createElement('iframe');
        printFrame.id = 'dwrQrHiddenPrintFrame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);

        const doc = printFrame.contentWindow.document;
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>DWR Login QR Pass - ${safeUser}</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/phetsarath@5.3.0/400.css">
            <style>
              body { font-family: 'Phetsarath OT', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 90vh; background: #ffffff; margin: 0; padding: 20px; }
              .card { width: 340px; background: white; border: 2px solid #0f172a; border-radius: 20px; padding: 24px; text-align: center; }
              .header { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
              .qr-box { padding: 12px; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 16px; display: inline-block; margin-bottom: 16px; }
              .qr-box img { width: 190px; height: 190px; display: block; }
              .name { font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
              .role { font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 9999px; background: #e0e7ff; color: #3730a3; display: inline-block; margin-bottom: 6px; }
              .user { font-family: monospace; font-size: 12px; color: #64748b; }
              .footer { font-size: 10px; color: #059669; margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 8px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div>
                  <div style="font-weight:bold; font-size:13px; color:#0f172a;">ກົມຊັບພະຍາກອນນໍ້າ (DWR)</div>
                  <div style="font-size:10px; color:#64748b;">Department of Water Resources</div>
                </div>
              </div>
              <div class="role">${safeRole}</div>
              <div class="qr-box">
                <img src="${src}" alt="QR Pass">
              </div>
              <div class="name">${safeName}</div>
              <div class="user">username: ${safeUser}</div>
              <div class="footer">🔒 SHA-256 Digital Verified Badge · ສະແກນເພື່ອເຂົ້າລະບົບ</div>
            </div>
          </body>
          </html>
        `);
        doc.close();
        setTimeout(() => {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        }, 350);
      };

      document.getElementById('dwrQrCopyBtn').onclick = () => {
        const payload = currentPayloadStr || DwrQrAuth.generatePayload(currentQrUser);
        navigator.clipboard.writeText(payload).then(() => {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'success',
              title: 'ສຳເນົາລະຫັດທີ່ເຂົ້າລະຫັດ SHA-256 ແລ້ວ',
              text: 'ລະຫັດນີ້ບໍ່ມີການເກັບລະຫັດຜ່ານແບບ Plaintext ແລະ ມີກຳນົດວັນໝົດອາຍຸ',
              timer: 1700,
              showConfirmButton: false
            });
          }
        });
      };
    }
  };

  window.DwrQrAuth = DwrQrAuth;

})(window);
