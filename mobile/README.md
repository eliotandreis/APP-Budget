# Budget App — Mobile (PWA)

Application web installable sur l'écran d'accueil, autonome (ne dépend pas du PC),
qui lit/écrit directement le **même fichier Drive** que l'app PC.

## Ce qui est fait (mobile étape 0)

- Connexion à Google Drive (bouton, popup de consentement Google)
- Téléchargement du fichier partagé, lecture via SQLite en WebAssembly (sql.js)
- Cache local (IndexedDB) : affichage immédiat même hors-ligne, tant que le fichier
  a déjà été synchronisé une fois
- Dashboard : soldes par compte, dépenses/revenus du mois
- Liste des transactions récentes
- Ajout d'une transaction, avec envoi vers Drive et détection de conflit (même
  logique que côté PC : refuse d'écraser si un autre appareil a écrit entre-temps)

**Pas encore fait** (comme pour le PC, ça viendra par étapes si besoin) : création de
comptes/catégories depuis le mobile (fais-le depuis le PC pour l'instant), import CSV,
budgets, modification/suppression de transaction.

⚠️ Comme pour Drive côté PC, je n'ai pas accès aux serveurs Google ni à un vrai
téléphone depuis mon environnement de développement. J'ai testé toute la logique
(base de données, téléchargement, envoi, conflit) avec des appels réseau simulés,
mais pas le vrai parcours dans un navigateur mobile. À valider chez toi.

## Mise en place (à faire une seule fois)

### 1. Un nouvel identifiant OAuth, différent de celui du PC

Le PC utilise un client OAuth de type "Desktop app". Le mobile a besoin d'un type
différent :

1. Dans le même projet Google Cloud que pour le PC : **Google Auth Platform > Clients
   > Create Client**.
2. Type d'application : **Web application** (pas Desktop).
3. Dans **Authorized JavaScript origins**, ajoute l'URL où tu vas héberger la PWA
   (ex. `https://TON_PSEUDO.github.io`) — voir étape 2 ci-dessous pour l'obtenir.
4. Crée, copie le **Client ID** généré (pas besoin du secret, une app web publique
   n'en a pas).

### 2. Héberger la PWA (GitHub Pages, gratuit)

Google exige que la page soit servie en HTTPS depuis une adresse enregistrée —
impossible d'ouvrir juste un fichier local sur le téléphone. Le plus simple et
gratuit : GitHub Pages.

1. Crée un dépôt GitHub (public ou privé), pousse le contenu du dossier `mobile/`
   à sa racine.
2. Dans les paramètres du dépôt, **Settings > Pages**, active GitHub Pages sur la
   branche principale.
3. Récupère l'URL générée (ex. `https://TON_PSEUDO.github.io/NOM_DU_DEPOT/`) — c'est
   cette URL exacte qu'il faut mettre dans "Authorized JavaScript origins" à l'étape 1.

### 3. Configuration

```bash
cp config.example.js config.js
```

Édite `config.js` et remplace `CLIENT_ID` par celui obtenu à l'étape 1.

Pousse `config.js` sur ton dépôt aussi (ou configure-le directement dans GitHub après
coup) — le Client ID n'est pas un secret pour une app web publique, mais si le dépôt
est public et que ça te gêne, garde le dépôt en privé (GitHub Pages fonctionne aussi
avec un dépôt privé sur les formules payantes ; sinon dépôt public, ce n'est pas
grave ici).

### 4. Installer sur le téléphone

1. Ouvre l'URL GitHub Pages dans le navigateur du téléphone (Chrome/Safari).
2. Menu du navigateur > **Ajouter à l'écran d'accueil**.
3. Ouvre l'app depuis l'icône créée, appuie sur **Se connecter à Google Drive**,
   autorise l'accès — le fichier partagé avec le PC doit se télécharger.

⚠️ Comme pour le PC, tant que l'app Google reste en statut "Testing", il faudra
peut-être te reconnecter tous les 7 jours (voir README principal, section synchro).
