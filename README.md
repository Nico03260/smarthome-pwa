# SmartHome PWA — Guide d'installation

Application domotique PWA pour contrôler tes appareils **SmartLife / Tuya**.

---

## Fichiers inclus

| Fichier | Rôle |
|---|---|
| `index.html` | Application principale |
| `manifest.json` | Métadonnées PWA (icône, nom, thème) |
| `sw.js` | Service Worker (mode hors-ligne, cache) |

---

## Hébergement

### Option 1 — GitHub Pages (gratuit, recommandé)

1. Crée un dépôt GitHub (ex: `smarthome-pwa`)
2. Dépose les 3 fichiers + 2 icônes (voir section Icônes)
3. Va dans **Settings → Pages → Source : main branch**
4. Ton app est disponible sur `https://TON_PSEUDO.github.io/smarthome-pwa`

### Option 2 — Serveur local (test rapide)

```bash
# Python 3
python3 -m http.server 8080

# Node.js
npx serve .
```

Puis ouvre `http://localhost:8080` dans Chrome ou Firefox.

> ⚠ **HTTPS obligatoire** pour que le Service Worker et l'installation PWA fonctionnent.
> En local, `localhost` est l'exception (autorisé sans HTTPS).

---

## Icônes à créer

La PWA nécessite deux icônes PNG. Tu peux les générer gratuitement sur :
- https://www.pwabuilder.com/imageGenerator
- https://favicon.io

| Fichier | Taille |
|---|---|
| `icon-192.png` | 192 × 192 px |
| `icon-512.png` | 512 × 512 px |

Dépose-les dans le même dossier que `index.html`.

---

## Connexion API Tuya

### Obtenir tes clés API

1. Crée un compte sur https://iot.tuya.com
2. Va dans **Cloud → Créer un projet**
3. Région : choisir **Europe** si tu es en France
4. Récupère le **Access Key (Client ID)** et le **Secret Key**
5. Dans l'app → bouton **Configurer** → entre tes clés

### ⚠ Sécurité importante

Le **Secret Key** ne doit **jamais** être exposé côté client (navigateur).
Pour un usage en production, tu dois créer un **backend** (Node.js, Python, etc.)
qui signe les requêtes Tuya avec HMAC-SHA256 et expose une API intermédiaire.

Exemple de backend minimal en Node.js :
```bash
npm install express node-fetch crypto
```

```js
// server.js
const express = require('express');
const crypto  = require('crypto');
const fetch   = require('node-fetch');
const app     = express();

const CLIENT_ID     = process.env.TUYA_CLIENT_ID;
const CLIENT_SECRET = process.env.TUYA_SECRET;
const BASE_URL      = 'https://openapi.tuyaeu.com';

async function getToken() {
  const t   = Date.now().toString();
  const str = CLIENT_ID + t;
  const sign = crypto.createHmac('sha256', CLIENT_SECRET).update(str).digest('hex').toUpperCase();
  const res  = await fetch(`${BASE_URL}/v1.0/token?grant_type=1`, {
    headers: { client_id: CLIENT_ID, sign, t, sign_method: 'HMAC-SHA256' }
  });
  const data = await res.json();
  return data.result.access_token;
}

app.post('/api/device/:id/command', express.json(), async (req, res) => {
  const token = await getToken();
  const { id } = req.params;
  const r = await fetch(`${BASE_URL}/v1.0/iot-03/devices/${id}/commands`, {
    method: 'POST',
    headers: { client_id: CLIENT_ID, access_token: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  res.json(await r.json());
});

app.listen(3000, () => console.log('Backend Tuya sur http://localhost:3000'));
```

---

## Installer l'app sur Android

1. Ouvre l'URL de l'app dans **Chrome Android**
2. Un bandeau « Ajouter à l'écran d'accueil » apparaît automatiquement
3. Appuie sur **Installer** → l'app apparaît comme une vraie application

---

## Fonctionnalités

- 4 scènes rapides (Soirée, Matin, Absent, Nuit)
- Contrôle de 6 types d'appareils (lumières, thermostat, prises, serrure, caméra)
- Slider luminosité et température
- 4 automations programmables
- Graphique de consommation énergétique
- Mode hors-ligne (Service Worker)
- Installation sur écran d'accueil (PWA)
- Notifications push (à activer côté serveur)
