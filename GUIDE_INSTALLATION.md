# SmartHome PWA — Guide complet

## Structure du projet

```
smarthome-pwa/
├── index.html          ← Application PWA
├── manifest.json       ← Métadonnées PWA
├── sw.js               ← Service Worker (mode hors-ligne)
├── icon-192.png        ← Icône 192px (à créer)
├── icon-512.png        ← Icône 512px (à créer)
├── .github/
│   └── workflows/
│       └── deploy.yml  ← Déploiement automatique GitHub Pages
└── backend/
    ├── server.js       ← Serveur Node.js (API Tuya sécurisée)
    ├── package.json    ← Dépendances Node
    └── .env.example    ← Modèle de configuration
```

---

## Étape 1 — Créer les icônes

Génère 2 icônes PNG sur https://favicon.io ou https://www.pwabuilder.com/imageGenerator :
- `icon-192.png` (192 × 192 px)
- `icon-512.png` (512 × 512 px)

Dépose-les à la racine du projet (même niveau que `index.html`).

---

## Étape 2 — Mettre en ligne le frontend (GitHub Pages)

### 2a. Créer le dépôt GitHub

```bash
# Dans le dossier smarthome-pwa/
git init
git add index.html manifest.json sw.js icon-192.png icon-512.png .github/
git commit -m "Initial commit — SmartHome PWA"
git branch -M main
git remote add origin https://github.com/TON_PSEUDO/smarthome-pwa.git
git push -u origin main
```

### 2b. Activer GitHub Pages

1. Va sur https://github.com/TON_PSEUDO/smarthome-pwa/settings/pages
2. Source → **GitHub Actions**
3. Le workflow `.github/workflows/deploy.yml` se déclenche automatiquement
4. Ton app est en ligne sur : `https://TON_PSEUDO.github.io/smarthome-pwa`

À chaque `git push` sur `main`, le site est redéployé automatiquement.

---

## Étape 3 — Lancer le backend Node.js

Le backend signe les requêtes Tuya avec ton secret — il ne doit **jamais** tourner sur GitHub Pages (qui n'héberge que du HTML statique).

### En local (test)

```bash
cd backend/
npm install
cp .env.example .env
# Édite .env avec tes vraies clés Tuya
npm start
```

Le serveur démarre sur `http://localhost:3000`.

### En production

Héberge le backend sur un serveur qui supporte Node.js :

| Hébergeur | Gratuit | Notes |
|---|---|---|
| **Railway** | ✓ (500h/mois) | Déploiement en 2 clics depuis GitHub |
| **Render** | ✓ (avec veille) | Se met en veille après 15 min d'inactivité |
| **Fly.io** | ✓ | Plus technique, très fiable |
| **VPS OVH/Hetzner** | ~4€/mois | Contrôle total |

#### Exemple Railway (le plus simple)

1. Va sur https://railway.app → **New Project → Deploy from GitHub**
2. Sélectionne ton dépôt et le dossier `backend/`
3. Dans **Variables**, ajoute :
   - `TUYA_CLIENT_ID` = ta clé
   - `TUYA_SECRET` = ton secret
   - `TUYA_REGION` = `eu`
   - `FRONTEND_URL` = `https://TON_PSEUDO.github.io`
4. Railway te donne une URL publique HTTPS, ex: `https://smarthome-xyz.railway.app`

---

## Étape 4 — Connecter le frontend au backend

Dans `index.html`, trouve la fonction `tuyaCommand` et remplace-la par :

```javascript
const BACKEND_URL = 'https://smarthome-xyz.railway.app'; // ton URL backend

async function tuyaCommand(deviceId, on, props = {}) {
  try {
    const endpoint = on
      ? `${BACKEND_URL}/api/devices/${deviceId}/on`
      : `${BACKEND_URL}/api/devices/${deviceId}/off`;

    await fetch(endpoint, { method: 'POST' });

    // Commandes avancées (luminosité, température...)
    if (Object.keys(props).length > 0) {
      await fetch(`${BACKEND_URL}/api/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: Object.entries(props).map(([code, value]) => ({ code, value })) }),
      });
    }
  } catch (err) {
    console.error('[SmartHome] Erreur commande:', err);
  }
}
```

---

## Étape 5 — Installer l'app sur Android

1. Ouvre `https://TON_PSEUDO.github.io/smarthome-pwa` dans **Chrome Android**
2. Un bandeau « Ajouter à l'écran d'accueil » apparaît
3. Appuie **Installer** → l'icône apparaît sur ton écran d'accueil

---

## Routes disponibles du backend

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Vérifier que le serveur fonctionne |
| GET | `/api/devices` | Lister tous les appareils |
| GET | `/api/devices/:id` | Détail d'un appareil |
| GET | `/api/devices/:id/status` | État actuel d'un appareil |
| POST | `/api/devices/:id/commands` | Envoyer une commande |
| POST | `/api/devices/:id/on` | Allumer |
| POST | `/api/devices/:id/off` | Éteindre |
| POST | `/api/devices/:id/brightness` | Luminosité (body: `{ value: 500 }`) |

---

## Obtenir les IDs de tes appareils Tuya

```bash
curl http://localhost:3000/api/devices
```

Cherche le champ `id` pour chaque appareil, puis remplace les IDs fictifs dans `index.html`.
