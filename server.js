require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const cors    = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const CLIENT_ID     = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_SECRET;
const REGION        = process.env.TUYA_REGION || 'eu';

const BASE_URLS = {
  eu: 'https://openapi.tuyaeu.com',
  us: 'https://openapi.tuyaus.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};
const BASE_URL = BASE_URLS[REGION] || BASE_URLS.eu;

// ── Signature officielle Tuya ─────────────────────────────
// https://developer.tuya.com/en/docs/iot/singnature?id=Ka43a5mtx1gsc
function calcSign(method, path, token, t, body) {
  const contentHash = crypto.createHash('sha256')
    .update(body || '')
    .digest('hex');

  const stringToSign = [
    method.toUpperCase(),
    contentHash,
    '',
    path
  ].join('\n');

  const signStr = CLIENT_ID + (token || '') + t + stringToSign;

  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(signStr)
    .digest('hex')
    .toUpperCase();
}

function buildHeaders(method, path, token, body) {
  const t    = Date.now().toString();
  const sign = calcSign(method, path, token || '', t, body || '');
  const headers = {
    'client_id':   CLIENT_ID,
    't':           t,
    'sign_method': 'HMAC-SHA256',
    'sign':        sign,
    'Content-Type':'application/json',
  };
  if (token) headers['access_token'] = token;
  return headers;
}

// ── Token cache ───────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const path    = '/v1.0/token?grant_type=1';
  const headers = buildHeaders('GET', path, '', '');

  const res  = await fetch(BASE_URL + path, { headers });
  const data = await res.json();

  if (!data.success) {
    throw new Error('Token failed: ' + JSON.stringify(data));
  }
  tokenCache = {
    token:     data.result.access_token,
    expiresAt: Date.now() + (data.result.expire_time - 60) * 1000,
  };
  return tokenCache.token;
}

// ── Requête générique ─────────────────────────────────────
async function tuyaRequest(method, path, body) {
  const token   = await getToken();
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = buildHeaders(method, path, token, bodyStr);

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? bodyStr : undefined,
  });
  return res.json();
}

// ── Routes ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, region: REGION, base: BASE_URL });
});

app.get('/api/debug', (req, res) => {
  res.json({
    client_id: CLIENT_ID ? CLIENT_ID.substring(0, 6) + '...' : 'MANQUANT',
    secret:    CLIENT_SECRET ? CLIENT_SECRET.substring(0, 6) + '...' : 'MANQUANT',
    region:    REGION,
    base:      BASE_URL,
  });
});

app.get('/api/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ ok: true, token: token.substring(0, 10) + '...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const uid  = process.env.TUYA_UID || 'eu16080591067982nAyN';
    const data = await tuyaRequest('GET', `/v2.0/cloud/thing/device?page_size=20&page_no=1`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const data = await tuyaRequest('GET', `/v1.0/iot-03/devices/${req.params.id}/status`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const data = await tuyaRequest('POST', `/v1.0/iot-03/devices/${req.params.id}/commands`, req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/devices/:id/on', async (req, res) => {
  try {
    const data = await tuyaRequest('POST', `/v1.0/iot-03/devices/${req.params.id}/commands`, {
      commands: [{ code: 'switch_1', value: true }]
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices/:id/off', async (req, res) => {
  try {
    const data = await tuyaRequest('POST', `/v1.0/iot-03/devices/${req.params.id}/commands`, {
      commands: [{ code: 'switch_1', value: false }]
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend SmartHome sur http://localhost:${PORT}`);
  console.log(`Région: ${REGION} → ${BASE_URL}`);
  if (!CLIENT_ID || !CLIENT_SECRET) console.warn('⚠ Clés Tuya manquantes !');
});
