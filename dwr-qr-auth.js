/**
 * DWR Enterprise Platform — QR Code Authentication & Generator Module
 * Department of Water Resources (ກົມຊັບພະຍາກອນນໍ້າ)
 * 
 * Supports:
 * 1. Instant Camera QR Scanning (with camera switch, torch, & file upload fallback)
 * 2. QR Code Pass Generator (printable & downloadable digital access badges)
 * 3. Unified cross-system authentication (Water Quality, Water Usage, Wastewater, & Portal)
 */

(function (window) {
  'use strict';

  const DWR_QR_VERSION = 'v1';
  const DWR_APP_TAG = 'DWR_PORTAL_AUTH';

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
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
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

    /**
     * Generate secure QR payload string
     */
    generatePayload(user) {
      if (!user) return '';
      const payloadObj = {
        app: DWR_APP_TAG,
        v: DWR_QR_VERSION,
        u: String(user.username || user.name || '').trim(),
        p: String(user.password || '').trim(),
        r: String(user.role || 'STAFF').trim(),
        n: String(user.fullName || user.name || user.username || '').trim(),
        k: String(user.fbKey || user.key || '').trim(),
        t: Date.now()
      };
      const jsonStr = JSON.stringify(payloadObj);
      try {
        const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
        return `DWR-AUTH:v1:${b64}`;
      } catch (e) {
        return jsonStr;
      }
    },

    /**
     * Parse and decode QR code string
     */
    parsePayload(text) {
      if (!text || typeof text !== 'string') return null;
      let trimmed = text.trim();

      // Format 1: DWR-AUTH:v1:<base64>
      if (trimmed.startsWith('DWR-AUTH:')) {
        const parts = trimmed.split(':');
        const b64 = parts[parts.length - 1];
        try {
          const jsonStr = decodeURIComponent(escape(atob(b64)));
          const data = JSON.parse(jsonStr);
          if (data && (data.u || data.username)) {
            return {
              username: data.u || data.username,
              password: data.p || data.password,
              fullName: data.n || data.fullName || data.name,
              role: data.r || data.role,
              fbKey: data.k || data.fbKey || data.key || '',
              issuedAt: data.t
            };
          }
        } catch (e) {}
      }

      // Format 2: Direct JSON
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const data = JSON.parse(trimmed);
          if (data && (data.u || data.username)) {
            return {
              username: data.u || data.username,
              password: data.p || data.password,
              fullName: data.n || data.fullName || data.name,
              role: data.r || data.role,
              fbKey: data.k || data.fbKey || data.key || '',
              issuedAt: data.t
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
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Instant Auth</span>
                </h3>
                <p class="text-xs text-slate-400">ຈໍ່ກ້ອງໃສ່ບັດ QR Code ປະຈຳຕົວຂອງທ່ານ ເພື່ອເຂົ້າສູ່ລະບົບທັນທີ</p>
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
                <!-- Corner Accents -->
                <div class="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                <div class="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                <div class="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                <div class="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>
                
                <!-- Animated Red/Emerald Scan Laser Bar -->
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
            * ຮອງຮັບການສະແກນຜ່ານກ້ອງໂທລະສັບ, ແທັບເລັດ ຫຼື ຄອມພິວເຕີ ພ້ອມເຂົ້າລະບົບອັດຕະໂນມັດ
          </p>
        </div>
      `;

      // CSS keyframes for laser animation if not present
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

      // File upload fallback
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
        if (!creds || !creds.username || !creds.password) {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'error',
              title: 'QR Code ບໍ່ຖືກຕ້ອງ',
              text: 'QR Code ນີ້ບໍ່ແມ່ນບັດເຂົ້າສູ່ລະບົບຂອງກົມຊັບພະຍາກອນນ້ຳ',
              timer: 2500,
              showConfirmButton: false
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

      // Initialize HTML5-QRCode Camera
      try {
        const html5QrCode = new window.Html5Qrcode('dwrQrReader');
        DwrQrAuth._activeScanner = html5QrCode;

        const cameras = await window.Html5Qrcode.getCameras();
        let selectedCamId = null;

        if (cameras && cameras.length > 0) {
          // Prefer back/environment camera on phones
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
            () => {} // frame ignored
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
      // 1. From global memory if already populated
      if (Array.isArray(window.systemUsers) && window.systemUsers.length > 0) {
        return window.systemUsers;
      }
      // 2. Fetch directly from Firebase Realtime Database
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
              role: data[k].role || 'STAFF'
            }));
            if (list.length > 0) {
              window.systemUsers = list;
              return list;
            }
          }
        }
      } catch (e) {}

      // 3. Fallback defaults
      return [
        { username: 'admin', password: '9999', role: 'SUPER_ADMIN', fullName: 'Admin (ຜູ້ດູແລລະບົບຫຼັກ)', fbKey: 'default:SUPER_ADMIN' },
        { username: 'staff', password: '1234', role: 'STAFF', fullName: 'Staff (ວິຊາການສິ່ງແວດລ້ອມ)', fbKey: 'default:STAFF' }
      ];
    },

    /**
     * Default login handler across all systems
     */
    async performDefaultLogin(creds) {
      const u = String(creds.username || '').trim();
      const p = String(creds.password || '').trim();
      let role = creds.role || 'STAFF';
      let fullName = creds.fullName || creds.username;
      let fbKey = creds.fbKey || '';

      // Match against official accounts to guarantee correct session key
      try {
        const allUsers = await DwrQrAuth.fetchAllSystemUsers();
        const norm = v => String(v || '').trim().toLowerCase();
        const matched = allUsers.find(x => (norm(x.username) === norm(u) || norm(x.name) === norm(u)) && (!p || String(x.password) === String(p)));
        if (matched) {
          fbKey = matched.fbKey;
          fullName = matched.fullName || matched.name || fullName;
          role = matched.role || role;
        }
      } catch (e) {}

      if (!fbKey) {
        fbKey = (u.toLowerCase() === 'admin') ? 'default:SUPER_ADMIN' : ((u.toLowerCase() === 'staff') ? 'default:STAFF' : ('qr:' + u));
      }

      // Remember in custom QR accounts registry so subsequent requests know about this user
      try {
        const raw = localStorage.getItem('dwr_custom_qr_users') || '[]';
        const list = JSON.parse(raw);
        const idx = list.findIndex(x => (x.username || '').toLowerCase() === u.toLowerCase());
        const userObj = { username: u, password: p, fullName, role, fbKey };
        if (idx >= 0) list[idx] = userObj; else list.push(userObj);
        localStorage.setItem('dwr_custom_qr_users', JSON.stringify(list));
      } catch (e) {}

      // 1. Unified Shared Session for all 3 apps and portal
      const sessionObj = {
        key: fbKey,
        role: role,
        name: fullName,
        username: u
      };
      localStorage.setItem('waterSession', JSON.stringify(sessionObj));
      sessionStorage.setItem('waterSession', JSON.stringify(sessionObj));

      const v2User = {
        id: fbKey,
        fbKey: fbKey,
        username: u,
        fullName: fullName,
        role: role
      };
      localStorage.setItem('lao_water_current_user_v2', JSON.stringify(v2User));
      sessionStorage.setItem('lao_water_current_user_v2', JSON.stringify(v2User));
      localStorage.setItem('lao_wastewater_current_user_v2', JSON.stringify(v2User));
      sessionStorage.setItem('lao_wastewater_current_user_v2', JSON.stringify(v2User));
      sessionStorage.removeItem('guestMode');

      // 2. If already inside Water Quality System (water-quality.html)
      if (typeof window.setSession === 'function' && typeof window.hideLoginScreen === 'function') {
        window.hideLoginScreen();
        window.setSession(role, fullName, fbKey);
        if (typeof window.clearLoginError === 'function') window.clearLoginError();
        if (window.Swal) {
          window.Swal.fire({
            icon: 'success',
            title: `ສະບາຍດີ ${fullName}`,
            text: 'ເຂົ້າສູ່ລະບົບສຳເລັດດ້ວຍ QR Code!',
            timer: 1600,
            showConfirmButton: false
          });
        }
        return;
      }

      // 3. If already inside Water Usage or Wastewater System (water-usage.html & wastewater.html)
      if (typeof window.hideSharedLogin === 'function' && typeof window.mountApp === 'function') {
        window.hideSharedLogin();
        window.mountApp();
        if (window.Swal) {
          window.Swal.fire({
            icon: 'success',
            title: `ສະບາຍດີ ${fullName}`,
            text: 'ເຂົ້າສູ່ລະບົບສຳເລັດດ້ວຍ QR Code!',
            timer: 1600,
            showConfirmButton: false
          });
        }
        return;
      }

      const uInp = document.getElementById('sl_username');
      const pInp = document.getElementById('sl_password');
      const fForm = document.getElementById('sl_form');
      if (uInp && pInp && fForm) {
        uInp.value = u;
        pInp.value = p;
        if (typeof fForm.requestSubmit === 'function') {
          fForm.requestSubmit();
        } else {
          fForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
        return;
      }

      // 4. On Home / Portal Landing Page:
      if (typeof window.refreshSessionUI === 'function') {
        window.refreshSessionUI();
      }

      if (window.Swal) {
        window.Swal.fire({
          icon: 'success',
          title: `ສະບາຍດີ ${fullName}`,
          text: 'ເຂົ້າສູ່ລະບົບສຳເລັດດ້ວຍ QR Code! ທ່ານສາມາດກົດເຂົ້າໃຊ້ງານລະບົບໃດກໍ່ໄດ້ທັນທີ',
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
      await ensureDependencies();

      const existing = document.getElementById('dwrQrGenModal');
      if (existing) existing.remove();

      // Retrieve registered official accounts
      let availableUsers = await DwrQrAuth.fetchAllSystemUsers();

      // Add default admin/staff if not present
      if (!availableUsers.some(u => (u.username || '').toLowerCase() === 'admin')) {
        availableUsers.push({ username: 'admin', password: '9999', role: 'SUPER_ADMIN', fullName: 'Admin (ບັນຊີຫຼັກ)', fbKey: 'default:SUPER_ADMIN' });
      }
      if (!availableUsers.some(u => (u.username || '').toLowerCase() === 'staff')) {
        availableUsers.push({ username: 'staff', password: '1234', role: 'STAFF', fullName: 'Staff (ບັນຊີວິຊາການ)', fbKey: 'default:STAFF' });
      }

      // Add custom users from local storage if any
      try {
        const customUsers = JSON.parse(localStorage.getItem('dwr_custom_qr_users') || '[]');
        customUsers.forEach(cu => {
          if (!availableUsers.some(u => (u.username || '').toLowerCase() === (cu.username || '').toLowerCase())) {
            availableUsers.push(cu);
          }
        });
      } catch (e) {}

      const defaultUser = prefillUser || availableUsers[0] || { username: 'admin', password: '9999', role: 'SUPER_ADMIN', fullName: 'Administrator', fbKey: 'default:SUPER_ADMIN' };

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
                </h3>
                <p class="text-xs text-slate-400">Department of Water Resources Digital Access Badge</p>
              </div>
            </div>
            <button type="button" id="dwrQrGenCloseBtn" class="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-lg font-bold transition cursor-pointer">
              &times;
            </button>
          </div>

          <!-- User Select / Inputs -->
          <div class="space-y-3 bg-slate-855 p-3.5 rounded-2xl border border-slate-800 text-xs">
            <div>
              <label class="block text-[11px] font-bold text-slate-300 mb-1">ເລືອກບັນຊີຜູ້ໃຊ້ (Select Account)</label>
              <select id="dwrQrGenUserSel" class="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer">
                ${availableUsers.map((u, idx) => `
                  <option value="${idx}">[${u.role || 'USER'}] ${u.fullName || u.name || u.username} (${u.username || u.name})</option>
                `).join('')}
                <option value="CUSTOM">➕ ປ້ອນບັນຊີອື່ນເອງ (Custom Input)...</option>
              </select>
            </div>

            <!-- Custom User Inputs (Hidden by default) -->
            <div id="dwrQrCustomFields" class="hidden space-y-2 pt-1 border-t border-slate-800">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400 mb-0.5">ຊື່ຜູ້ໃຊ້ (Username)</label>
                  <input type="text" id="dwrQrCustUser" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono" placeholder="username">
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 mb-0.5">ລະຫັດຜ່ານ (Password)</label>
                  <input type="text" id="dwrQrCustPass" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono" placeholder="password">
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
                    <option value="STAFF" selected>🛠️ Staff</option>
                    <option value="VIEWER">👁️ Viewer</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Digital ID Card Display Area (Printable & Downloadable Badge) -->
          <div id="dwrQrCardPreview" class="bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-2 border-indigo-500/40 rounded-2xl p-5 text-center space-y-3.5 shadow-xl relative overflow-hidden">
            <!-- Top Card Header -->
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

            <!-- QR Code Canvas Container -->
            <div class="flex items-center justify-center">
              <div class="p-3 bg-white rounded-2xl shadow-xl ring-4 ring-indigo-500/20">
                <div id="dwrQrCodeBox" class="w-48 h-48 flex items-center justify-center"></div>
              </div>
            </div>

            <!-- User Info on Badge -->
            <div>
              <h4 id="dwrQrBadgeName" class="text-sm font-black text-white tracking-tight">Admin</h4>
              <p id="dwrQrBadgeUser" class="text-xs text-slate-400 font-mono mt-0.5">username: admin</p>
              <div class="flex items-center justify-center gap-1.5 text-[10px] text-emerald-400 mt-1 font-semibold">
                <span>🔒 Digital Verified Key</span>
                <span>•</span>
                <span>ໃຊ້ເຂົ້າສູ່ລະບົບໄດ້ທັນທີ</span>
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

      const renderQrBadge = (user) => {
        currentQrUser = user;
        const box = document.getElementById('dwrQrCodeBox');
        if (!box) return;
        box.innerHTML = '';

        const payload = DwrQrAuth.generatePayload(user);

        // Generate sharp QR with QRCode.js
        new window.QRCode(box, {
          text: payload,
          width: 192,
          height: 192,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.H
        });

        const roleText = user.role === 'SUPER_ADMIN' ? '👑 SUPER ADMIN' : user.role === 'STAFF' ? '🛠️ STAFF' : '👁️ VIEWER';
        document.getElementById('dwrQrBadgeRole').innerText = roleText;
        document.getElementById('dwrQrBadgeName').innerText = user.fullName || user.name || user.username;
        document.getElementById('dwrQrBadgeUser').innerText = `username: ${user.username || user.name}`;

        // Save custom created user in local registry
        if (user.isCustom || !user.fbKey) {
          try {
            const raw = localStorage.getItem('dwr_custom_qr_users') || '[]';
            const list = JSON.parse(raw);
            const uLow = (user.username || '').toLowerCase();
            const idx = list.findIndex(x => (x.username || '').toLowerCase() === uLow);
            if (idx >= 0) list[idx] = user; else list.push(user);
            localStorage.setItem('dwr_custom_qr_users', JSON.stringify(list));
          } catch (e) {}
        }
      };

      // Initial QR generation
      renderQrBadge(defaultUser);

      // Account selector change handler
      const sel = document.getElementById('dwrQrGenUserSel');
      const customBox = document.getElementById('dwrQrCustomFields');

      sel.onchange = () => {
        if (sel.value === 'CUSTOM') {
          customBox.classList.remove('hidden');
          const cu = document.getElementById('dwrQrCustUser').value;
          const cp = document.getElementById('dwrQrCustPass').value;
          const cn = document.getElementById('dwrQrCustName').value;
          const cr = document.getElementById('dwrQrCustRole').value;
          renderQrBadge({ username: cu || 'user', password: cp || '1234', fullName: cn || 'User', role: cr || 'STAFF', isCustom: true });
        } else {
          customBox.classList.add('hidden');
          const u = availableUsers[Number(sel.value)];
          if (u) renderQrBadge(u);
        }
      };

      // Custom fields input listener
      ['dwrQrCustUser', 'dwrQrCustPass', 'dwrQrCustName', 'dwrQrCustRole'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = () => {
          if (sel.value === 'CUSTOM') {
            const cu = document.getElementById('dwrQrCustUser').value;
            const cp = document.getElementById('dwrQrCustPass').value;
            const cn = document.getElementById('dwrQrCustName').value;
            const cr = document.getElementById('dwrQrCustRole').value;
            renderQrBadge({ username: cu || 'user', password: cp || '1234', fullName: cn || 'User', role: cr || 'STAFF', isCustom: true });
          }
        };
      });

      // Download QR Image
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

      // Print Badge
      document.getElementById('dwrQrPrintBtn').onclick = () => {
        const canvas = document.querySelector('#dwrQrCodeBox canvas');
        const img = document.querySelector('#dwrQrCodeBox img');
        const src = canvas ? canvas.toDataURL('image/png') : (img ? img.src : '');

        const pWin = window.open('', '_blank', 'width=520,height=680');
        if (!pWin) return;

        pWin.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>DWR Login QR Pass - ${currentQrUser.username}</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/phetsarath@5.3.0/400.css">
            <style>
              body { font-family: 'Phetsarath OT', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 90vh; background: #f8fafc; margin: 0; padding: 20px; }
              .card { width: 340px; background: white; border: 2px solid #0f172a; border-radius: 20px; padding: 24px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
              .header { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
              .qr-box { padding: 12px; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 16px; display: inline-block; margin-bottom: 16px; }
              .qr-box img { width: 190px; height: 190px; display: block; }
              .name { font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
              .role { font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 9999px; background: #e0e7ff; color: #3730a3; display: inline-block; margin-bottom: 6px; }
              .user { font-family: monospace; font-size: 12px; color: #64748b; }
              .footer { font-size: 10px; color: #94a3b8; margin-top: 14px; border-top: 1px dashed #cbd5e1; padding-top: 8px; }
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
              <div class="role">${currentQrUser.role || 'USER'}</div>
              <div class="qr-box">
                <img src="${src}" alt="QR Pass">
              </div>
              <div class="name">${currentQrUser.fullName || currentQrUser.name || currentQrUser.username}</div>
              <div class="user">username: ${currentQrUser.username}</div>
              <div class="footer">ບັດເຂົ້າສູ່ລະບົບດິຈິຕອນ · ສະແກນດ້ວຍກ້ອງເພື່ອ Login</div>
            </div>
            <script>
              window.onload = function() { window.print(); };
            <\/script>
          </body>
          </html>
        `);
        pWin.document.close();
      };

      // Copy auth token to clipboard
      document.getElementById('dwrQrCopyBtn').onclick = () => {
        const payload = DwrQrAuth.generatePayload(currentQrUser);
        navigator.clipboard.writeText(payload).then(() => {
          if (window.Swal) {
            window.Swal.fire({
              icon: 'success',
              title: 'ສຳເນົາລະຫັດແລ້ວ',
              text: 'ທ່ານສາມາດສົ່ງລະຫັດນີ້ ຫຼື ໃຊ້ສ້າງ QR Code ໃນແອັບອື່ນໄດ້',
              timer: 1500,
              showConfirmButton: false
            });
          }
        });
      };
    }
  };

  window.DwrQrAuth = DwrQrAuth;

})(window);
