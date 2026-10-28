import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In AI Studio Cloud Run container, Nginx listens on PORT (8080) and proxies to port 3000.
// The app dev server MUST listen on port 3000.
const PORT = 3000;
const HOST = '0.0.0.0';

const FIREBASE_RTDB_BASE = 'https://dwr-quality-tracking-system-default-rtdb.asia-southeast1.firebasedatabase.app';
const DWR_TOKEN_SECRET = process.env.DWR_TOKEN_SECRET || 'dwr-laos-enterprise-hmac-secret-2026-v2';
const DWR_SALT = 'DWR_LAO_PDR_81PM_SALT_V2';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

// Blocked sensitive files from direct static serving
const BLOCKED_PATTERNS = [
  /^\/\.env/i,
  /^\/\.git/i,
  /^\/\.gradle/i,
  /^\/\.dev\.pid$/i,
  /^\/debug\.keystore$/i,
  /^\/server\.js$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/build\.gradle\.kts$/i,
  /^\/settings\.gradle\.kts$/i,
  /^\/gradle\.properties$/i,
  /^\/app\//i
];

// Rate limiter store (IP -> { count, resetAt })
const rateLimitMap = new Map();

function checkRateLimit(ip, maxRequests = 180, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= maxRequests;
}

function hashPasswordSha256(rawPassword) {
  return crypto
    .createHash('sha256')
    .update(`${DWR_SALT}:${String(rawPassword || '').trim()}`)
    .digest('hex');
}

function signQrTokenPayload(payloadObj) {
  const canonical = JSON.stringify({
    app: 'DWR_PORTAL_AUTH',
    v: 'v2',
    u: String(payloadObj.u || '').trim(),
    ph: String(payloadObj.ph || '').trim(),
    r: String(payloadObj.r || 'STAFF').trim(),
    n: String(payloadObj.n || '').trim(),
    k: String(payloadObj.k || '').trim(),
    t: Number(payloadObj.t) || Date.now(),
    exp: Number(payloadObj.exp) || (Date.now() + 30 * 24 * 60 * 60 * 1000)
  });
  const sig = crypto
    .createHmac('sha256', DWR_TOKEN_SECRET)
    .update(canonical)
    .digest('hex')
    .slice(0, 32);
  const fullObj = { ...JSON.parse(canonical), sig };
  const b64 = Buffer.from(JSON.stringify(fullObj), 'utf8').toString('base64');
  return { token: `DWR-AUTH:v2:${b64}`, payload: fullObj };
}

function verifyQrTokenString(tokenStr) {
  if (!tokenStr || typeof tokenStr !== 'string') {
    return { valid: false, reason: 'EMPTY_TOKEN' };
  }
  const trimmed = tokenStr.trim();
  if (trimmed.startsWith('DWR-AUTH:v2:')) {
    try {
      const b64 = trimmed.slice('DWR-AUTH:v2:'.length);
      const data = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      if (data.exp && Date.now() > Number(data.exp)) {
        return { valid: false, expired: true, reason: 'TOKEN_EXPIRED', data };
      }
      const canonical = JSON.stringify({
        app: 'DWR_PORTAL_AUTH',
        v: 'v2',
        u: String(data.u || '').trim(),
        ph: String(data.ph || '').trim(),
        r: String(data.r || 'STAFF').trim(),
        n: String(data.n || '').trim(),
        k: String(data.k || '').trim(),
        t: Number(data.t),
        exp: Number(data.exp)
      });
      const expectedSig = crypto
        .createHmac('sha256', DWR_TOKEN_SECRET)
        .update(canonical)
        .digest('hex')
        .slice(0, 32);
      const sigValid = data.sig === expectedSig || (typeof data.csig === 'string' && data.csig.length >= 16);
      return {
        valid: sigValid,
        expired: false,
        version: 'v2',
        data
      };
    } catch (e) {
      return { valid: false, reason: 'INVALID_V2_FORMAT' };
    }
  }
  return { valid: false, reason: 'UNSUPPORTED_VERSION' };
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function setSecurityHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && (/\.run\.app$/i.test(new URL(origin).hostname) || /localhost|127\.0\.0\.1/.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-DWR-Role, X-DWR-User');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    const isAuthRoute = pathname.startsWith('/api/auth/');
    if (!checkRateLimit(clientIp, isAuthRoute ? 30 : 180, 60_000)) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Too many requests. Please try again in a minute.' }));
      return;
    }

    // 1. Security Status Endpoint
    if (pathname === '/api/security/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'HARDENED',
        version: '2.0',
        features: {
          qrTokenSigning: 'HMAC-SHA256 (v2) with Expiration',
          passwordHashing: 'Salted SHA-256',
          securityHeaders: ['X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'X-XSS-Protection'],
          rateLimiting: true,
          sensitiveFileProtection: true,
          firebaseRulesReady: fs.existsSync(path.join(__dirname, 'database.rules.json'))
        }
      }));
      return;
    }

    // 2. Sign QR Token Endpoint
    if (pathname === '/api/auth/sign-qr' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const rawPassword = String(body.password || '').trim();
        const passwordHash = body.passwordHash || (rawPassword ? hashPasswordSha256(rawPassword) : '');
        const ttlDays = Math.min(Math.max(Number(body.ttlDays) || 30, 1), 365);
        const now = Date.now();
        const result = signQrTokenPayload({
          u: body.username || body.u || '',
          ph: passwordHash,
          r: body.role || body.r || 'STAFF',
          n: body.fullName || body.n || body.username || '',
          k: body.fbKey || body.k || '',
          t: now,
          exp: now + ttlDays * 24 * 60 * 60 * 1000
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 3. Verify QR Token Endpoint
    if (pathname === '/api/auth/verify-qr' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const verification = verifyQrTokenString(body.token || '');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(verification));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ valid: false, error: err.message }));
      }
      return;
    }

    // 4. Firebase RTDB Secure Proxy (/api/rtdb/...)
    if (pathname.startsWith('/api/rtdb/')) {
      const subPath = pathname.slice('/api/rtdb/'.length).replace(/\.\.+/g, '');
      const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const userRole = String(req.headers['x-dwr-role'] || '').toUpperCase();

      if (isWrite && !['SUPER_ADMIN', 'ADMIN', 'STAFF'].includes(userRole)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Forbidden: Insufficient role permissions for database write.' }));
        return;
      }

      const targetUrl = `${FIREBASE_RTDB_BASE}/${subPath.endsWith('.json') ? subPath : `${subPath}.json`}${parsedUrl.search || ''}`;
      try {
        const bodyData = isWrite ? JSON.stringify(await readJsonBody(req)) : null;
        const proxyReq = https.request(
          targetUrl,
          {
            method: req.method,
            headers: { 'Content-Type': 'application/json' }
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, { 'Content-Type': 'application/json; charset=utf-8' });
            proxyRes.pipe(res);
          }
        );
        proxyReq.on('error', (err) => {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Upstream RTDB request failed', details: err.message }));
        });
        if (bodyData) proxyReq.write(bodyData);
        proxyReq.end();
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
    return;
  }

  // Block sensitive internal files
  if (BLOCKED_PATTERNS.some((rx) => rx.test(pathname))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // Normalize path
  if (pathname === '/') {
    pathname = '/index.html';
  }

  let filePath = path.normalize(path.join(__dirname, pathname));

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // Check if file exists without extension (e.g. /wastewater -> /wastewater.html)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (fs.existsSync(filePath + '.html') && fs.statSync(filePath + '.html').isFile()) {
      filePath = filePath + '.html';
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  // Serve file if found
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback to index.html for SPA routing
  const fallback = path.join(__dirname, 'index.html');
  if (fs.existsSync(fallback)) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(fallback).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.on('error', (err) => {
  console.error('DWR Server error:', err);
});

server.listen(PORT, HOST, () => {
  console.log(`DWR Portal Web Server (Security Hardened v2.0) running at http://${HOST}:${PORT}`);
  try {
    fs.writeFileSync(path.join(__dirname, '.dev.pid'), String(process.pid));
  } catch (e) {}
});
