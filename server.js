// SmartHome — Backend Tuya sécurisé
require('dotenv').config();
// Signe les requêtes Tuya côté serveur (le secret ne quitte jamais le serveur)

const express = require('express');
const crypto  = require('crypto');
const cors    = require('cors');

const app  = express();
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// ── Config ────────────────────────────────────────────────
const CLIENT_ID     = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_SECRET;
const REGION        = process.env.TUYA_REGION || 'eu'; // eu | us | cn | in

const BASE_URLS = {
  eu: 'https://openapi.tuyaeu.com',
  us: 'https://openapi.tuyaus.com',
  cn: 'https://openapi.tuyacn.com',
  in: 'https://openapi.tuyain.com',
};
const BASE_URL = BASE_URLS[REGION] || BASE_URLS.eu;

// ── Signature Tuya ────────────────────────────────────────
function sign(clientId, secret, token, t, method, path, body = '') {
  const bodyHash  = crypto.createHash('sha256').update(body || '').digest('hex');
  const strToSign = method + '\n' + bodyHash + '\n' + '' + '\n' + path;
  const signStr   = clientId + (token || '') + t + strToSign;
  return crypto.createHmac('sha256', secret).update(signStr).digest('hex').toUpperCase();
}

// ── Token cache ───────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const t   = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const s   = sign(CLIENT_ID, CLIENT_SECRET, '', t, 'GET', path);

  const res  = await fetch(`${BASE_URL}${path}`, {
    headers: {
      client_id:   CLIENT_ID,
      sign:        s,
      t,
      sign_method: 'HMAC-SHA256',
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error('Token Tuya échoué : ' + data.msg);

  tokenCache = {
    token:     data.result.access_token,
    expiresAt: Date.now() + (data.result.expire_time - 60) * 1000,
  };
  return tokenCache.token;
}

// ── Helper requête Tuya ───────────────────────────────────
async function tuyaRequest(method, path, body = null) {
  const token = await getToken();
  const t     = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const s     = sign(CLIENT_ID, CLIENT_SECRET, token, t, method, path, bodyStr);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      client_id:    CLIENT_ID,
      access_token: token,
      sign:         s,
      t,
      sign_method:  'HMAC-SHA256',
      'Content-Type': 'application/json',
    },
    body: body ? bodyStr : undefined,
  });
  return res.json();
}

// ── Routes ────────────────────────────────────────────────

// Santé du serveur
app.get('/api/debug', (req, res) => {
  res.json({
    client_id: CLIENT_ID ? CLIENT_ID.substring(0,6) + '...' : 'MANQUANT',
    secret: CLIENT_SECRET ? CLIENT_SECRET.substring(0,6) + '...' : 'MANQUANT',
    region: REGION,
  });
});

// Liste des appareils du compte
app.get('/api/devices', async (req, res) => {
  try {
   const data = await tuyaRequest('GET', '/v2.0/cloud/thing/device?page_size=20&page_no=1');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Détail d'un appareil
app.get('/api/devices/:id', async (req, res) => {
  try {
    const data = await tuyaRequest('GET', `/v1.0/iot-03/devices/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// État des fonctions d'un appareil
app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const data = await tuyaRequest('GET', `/v1.0/iot-03/devices/${req.params.id}/status`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Envoyer une commande à un appareil
// Body: { commands: [{ code: 'switch_led', value: true }] }
app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const data = await tuyaRequest(
      'POST',
      `/v1.0/iot-03/devices/${req.params.id}/commands`,
      req.body
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Commandes prédéfinies pratiques
app.post('/api/devices/:id/on',  async (req, res) => {
  try {
    const data = await tuyaRequest('POST', `/v1.0/iot-03/devices/${req.params.id}/commands`, {
      commands: [{ code: 'switch_led', value: true }]
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices/:id/off', async (req, res) => {
  try {
    const data = await tuyaRequest('POST', `/v1.0/iot-03/devices/${req.params.id}/commands`, {
      commands: [{ code: 'switch_led', value: false }]
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/devices/:id/brightness', async (req, res) => {
  const { value } = req.body; // 10–1000
  try {
    const data = await tuyaRequest('POST', `/v1.0/iot-03/devices/${req.params.id}/commands`, {
      commands: [{ code: 'bright_value_v2', value: Math.round(value) }]
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Démarrage ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Backend SmartHome démarré sur http://localhost:${PORT}`);
  console.log(`  Région Tuya : ${REGION} → ${BASE_URL}`);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('  ⚠ TUYA_CLIENT_ID ou TUYA_SECRET non définis — vérifie ton .env');
  }
});
