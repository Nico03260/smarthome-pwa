require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const CLIENT_ID     = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_SECRET;
const REGION        = process.env.TUYA_REGION || 'eu';
const DATA_FILE     = path.join('/tmp', 'temp_history.json');

const BASE_URLS = {
  eu: 'https://openapi.tuyaeu.com',
  us: 'https://openapi.tuyaus.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};
const BASE_URL = BASE_URLS[REGION] || BASE_URLS.eu;

// IDs des capteurs de température
const SENSORS = [
  { id: 'bf84e177556484e481jpwd',  name: 'Salon' },
  { id: 'bf761413f71fcea995ihdt',  name: 'Chambre parentale' },
  { id: 'bfb8d8de60580b0a9fnkxq',  name: 'Chambre Jules' },
  { id: 'bfc71adbd5b267026bbxgp',  name: 'SdB Bas' },
  { id: 'bffa8434fe10aa1059xvdv',  name: 'SdB Haut' },
  { id: 'bfb93470abf69bae3f1x0m',  name: 'Sous-sol' },
];

// ── Signature Tuya ────────────────────────────────────────
function calcSign(method, path, token, t, body) {
  const contentHash = crypto.createHash('sha256').update(body || '').digest('hex');
  const stringToSign = [method.toUpperCase(), contentHash, '', path].join('\n');
  const signStr = CLIENT_ID + (token || '') + t + stringToSign;
  return crypto.createHmac('sha256', CLIENT_SECRET).update(signStr).digest('hex').toUpperCase();
}

function buildHeaders(method, path, token, body) {
  const t    = Date.now().toString();
  const sign = calcSign(method, path, token || '', t, body || '');
  const headers = {
    'client_id':    CLIENT_ID,
    't':            t,
    'sign_method':  'HMAC-SHA256',
    'sign':         sign,
    'Content-Type': 'application/json',
  };
  if (token) headers['access_token'] = token;
  return headers;
}

// ── Token cache ───────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const path    = '/v1.0/token?grant_type=1';
  const headers = buildHeaders('GET', path, '', '');
  const res     = await fetch(BASE_URL + path, { headers });
  const data    = await res.json();
  if (!data.success) throw new Error('Token failed: ' + JSON.stringify(data));
  tokenCache = {
    token:     data.result.access_token,
    expiresAt: Date.now() + (data.result.expire_time - 60) * 1000,
  };
  return tokenCache.token;
}

async function tuyaRequest(method, path, body) {
  const token   = await getToken();
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = buildHeaders(method, path, token, bodyStr);
  const res = await fetch(BASE_URL + path, { method, headers, body: body ? bodyStr : undefined });
  return res.json();
}

// ── Historique températures ───────────────────────────────
function loadHistory() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) {}
  return {};
}

function saveHistory(history) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(history), 'utf8');
  } catch(e) { console.error('Erreur sauvegarde:', e); }
}

function pruneHistory(history) {
  const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const id of Object.keys(history)) {
    history[id] = history[id].filter(p => p.t > cutoff7d);
  }
  return history;
}

async function recordTemperatures() {
  try {
    const uid  = 'eu16080591067982nAyN';
    const data = await tuyaRequest('GET', `/v1.0/users/${uid}/devices`);
    if (!data.success || !data.result) return;

    let history = loadHistory();
    const now   = Date.now();

    for (const sensor of SENSORS) {
      const device = data.result.find(d => d.id === sensor.id);
      if (!device || !device.online) continue;
      const tempStatus = device.status?.find(s => s.code === 'va_temperature');
      const humStatus  = device.status?.find(s => s.code === 'va_humidity');
      if (!tempStatus) continue;

      if (!history[sensor.id]) history[sensor.id] = [];
      history[sensor.id].push({
        t:    now,
        temp: tempStatus.value / 10,
        hum:  humStatus ? humStatus.value : null,
      });
    }

    history = pruneHistory(history);
    saveHistory(history);
    console.log(`[${new Date().toISOString()}] Températures enregistrées`);
  } catch(err) {
    console.error('Erreur enregistrement:', err.message);
  }
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
  });
});

app.get('/api/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ ok: true, token: token.substring(0, 10) + '...' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/devices', async (req, res) => {
  try {
    const uid  = 'eu16080591067982nAyN';
    const data = await tuyaRequest('GET', `/v1.0/users/${uid}/devices`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const data = await tuyaRequest('GET', `/v1.0/iot-03/devices/${req.params.id}/status`);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const data = await tuyaRequest('POST', `/v1.0/iot-03/devices/${req.params.id}/commands`, req.body);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// Historique 24h ou 7j
app.get('/api/history', (req, res) => {
  const period = req.query.period || '24h';
  const hours  = period === '7d' ? 7 * 24 : 24;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const history = loadHistory();
  const result  = {};
  for (const [id, points] of Object.entries(history)) {
    result[id] = points.filter(p => p.t > cutoff);
  }
  res.json({ success: true, period, result, sensors: SENSORS });
});

// ── Démarrage ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend SmartHome sur http://localhost:${PORT}`);
  // Enregistrement immédiat puis toutes les 10 minutes
  recordTemperatures();
  setInterval(recordTemperatures, 10 * 60 * 1000);
});
