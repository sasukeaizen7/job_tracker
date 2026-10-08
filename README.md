# 🎯 Candidatures Tracker — Emploi · PhD · Alternance

Application web locale pour suivre toutes tes candidatures, avec veille automatique des offres sur
**LinkedIn, HelloWork et EURAXESS**, et import depuis n'importe quel site d'emploi.

## Lancer

### Depuis le bureau (Windows)

```bash
npm install
npm run shortcut
```

Deux icônes apparaissent sur le bureau :
- **Candidatures Tracker** : démarre le serveur en arrière-plan (sans fenêtre) et ouvre l'appli dans le navigateur.
  Si le serveur tourne déjà, l'appli s'ouvre simplement. L'interface est recompilée automatiquement si le code a changé.
- **Arrêter le tracker** : arrête le serveur.

Les journaux sont dans `data/server.log` et `data/server-error.log`.

### En ligne de commande

```bash
npm start          # build + serveur → http://localhost:5174
npm run dev        # développement (hot reload) → http://localhost:5173
```

Pré-requis : Node.js ≥ 22.13 (utilise `node:sqlite`, aucune base à installer).
Les données sont dans `data/tracker.db` (à sauvegarder).

## Fonctionnalités

- **Tableau de bord** : KPIs, pipeline, taux de réponse, candidatures par semaine, offres à relancer, dates limites.
- **Kanban** (glisser-déposer) et **Liste** triable, filtres par type (Emploi / Thèse / Alternance / Stage) et recherche.
- **Fiche offre** : tous les champs, description de l'annonce, historique automatique des changements de statut + notes.
- **Veille** : recherches sauvegardées actualisées toutes les 6 h ; les nouvelles offres arrivent dans une boîte de
  réception → « Suivre » ou « Ignorer ».
- **Import** : colle des liens d'offres ou un email d'alerte complet ; bouton favori « Ajouter au tracker ».
- **Export CSV** (Excel / Google Sheets).

## Sources

| Source | Veille auto | Import par lien | Idéal pour |
|---|---|---|---|
| LinkedIn | ✅ | ✅ | Tout, monde entier |
| HelloWork | ✅ | ✅ | Emploi, alternance, stage en France |
| EURAXESS | ✅ | ✅ (avec date limite) | Thèses, postdocs, recherche en Europe |
| Tout autre site (Welcome to the Jungle, ABG, sites carrières Lever / Greenhouse / Workday…) | — | ✅ via les données schema.org de la page | Offres trouvées ailleurs |

Certains sites bloquent la lecture automatique (Indeed, APEC, FindAPhD…) : le bouton favori ouvre alors la fiche
pré-remplie avec le lien et le titre, à compléter à la main.

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `5174` | Port du serveur |
| `AUTO_REFRESH_HOURS` | `6` | Fréquence de la veille (`0` = désactivée) |
| `DATA_DIR` | `data` | Dossier de la base SQLite |

> La veille lit les pages publiques des sites, sans connexion et à faible volume. Un site peut limiter les requêtes
> (erreur 429) ou changer sa page. L'usage automatisé n'est pas toujours autorisé par leurs conditions d'utilisation
> (notamment LinkedIn) : garde un usage personnel et modéré.

## Code

- `server/index.js` — API Express + planificateur de la veille
- `server/db.js` — base SQLite
- `server/sources/` — une source par fichier (`linkedin.js`, `hellowork.js`, `euraxess.js`, `web.js` pour l'import générique)
- `client/src/` — interface React
- `scripts/` — lanceur bureau (`tracker.ps1`, `launch.vbs`, `create-shortcut.ps1`)
