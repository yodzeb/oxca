# 🪂 Open XC Analytics

**[🇬🇧 English version](README.md)**

---

**Vos vols parapente méritent mieux qu'un gribouillis sur une carte.**

Déposez un fichier IGC. Devenez obsédé par vos données.

---

```
        ___
   ____/   \____          ╭───────────────────────────╮
  /  ___   ___  \    ←    │  C'était un 2.3 ou un     │
 / /   / | \   \ \        │  2.4 m/s ce thermique ?   │
  /   /  |  \   \         │  MAINTENANT TU SAURAS.    │
      \  |  /             ╰───────────────────────────╯
       \ ● /
        \|/
         │
        / \
```

## C'est quoi ce truc ?

OXCA est une appli web 100% côté client qui dissèque vos traces IGC et vous raconte tout ce que vous étiez trop occupé à voler pour remarquer. Pas de serveur. Pas de compte. Pas de télémétrie. Juste vous et vos données, dans un navigateur.

Conçu pour les pilotes **parapente** qui pensent aux thermiques sous la douche.

## ⚡ Démarrage rapide

```bash
# Option A : Ouvrez directement le fichier
open oxca-bundle.html

# Option B : Servez-le proprement (PWA + tuiles Leaflet)
cd xc-analyzer && python3 -m http.server
# → http://localhost:8000
```

Déposez un fichier `.igc` dessus. Contemplez la magie.

## 📊 Six modules, zéro patience requise

| Module | Ce qu'il fait | Pourquoi c'est important |
|---|---|---|
| **Vue d'ensemble** | Grille de stats, barre de phases, graphes altitude & vitesse | Le résumé exécutif de votre vol |
| **Vario / Montée** | Taux de montée vs temps, altitude, histogramme | Trouvez vos meilleurs thermiques, quantifiez vos pires dégueulantes |
| **Vent** | Heatmaps (vitesse × altitude × temps), nuages de points, flèches | Voir l'air invisible qui vous poussait |
| **Phases** | Détection thermique / flottement / transition / chute avec timeline | Combien de temps avez-vous réellement passé à avancer ? |
| **Record** | Distance droite, triangle plat, triangle FAI | Vos chiffres officiels de vantardise, sur une carte Leaflet |
| **MacCready** | Courbe polaire, MC glissant, analyse vitesse-à-voler, correction vent | Vous voliez intelligemment, ou juste... vous voliez ? |

## 🏗️ Architecture

```
xc-analyzer/
├── index.html          ← Coquille PWA (plein écran, installable)
├── manifest.json       ← Config "Ajouter à l'écran d'accueil"
├── sw.js               ← Service worker offline-first
├── icon.svg            ← Logo vectoriel
├── style.css           ← Thèmes sombre + clair via variables CSS
│
├── core/               ← Le cerveau
│   ├── config.js       ← 16 paramètres réglables, sauvés en localStorage
│   ├── geo.js          ← Haversine, relèvement, moyenne circulaire
│   ├── igc-parser.js   ← Parsing des enregistrements B + H
│   ├── flight-enricher.js  ← Dérivées, lissage, détection de phases, vent
│   ├── flight-store.js     ← Magasin central de données
│   ├── module-registry.js  ← Système de plugins + bus de données partagé
│   ├── chart-theme.js      ← Thème Chart.js (s'adapte clair/sombre)
│   ├── helpers.js           ← Formateurs, sous-échantillonneurs
│   └── app.js               ← Contrôleur, onglets, paramètres, thème
│
└── modules/            ← Chacun est autonome
    ├── mod-overview.js     ← lit le bus partagé (stats vario + vent)
    ├── mod-vario.js        ← publie : avgClimb, maxClimb, cumulatif
    ├── mod-wind.js         ← publie : avgSpeed, avgDir, maxSpeed
    ├── mod-phases.js
    ├── mod-record.js       ← Carte Leaflet + 3 optimiseurs de distance
    └── mod-mccready.js     ← lit les données vent du bus partagé
```

### La Danse des Plugins

```
App.showAnalysis()
  │
  ├── Passe 1 : mod.update()     ← chaque module calcule ses données
  ├── Passe 2 : mod.publish()    ← les modules exportent vers le bus
  └── Passe 3 : mod.lateUpdate() ← les modules consommateurs se mettent à jour
```

Envie d'ajouter un module ? C'est aussi simple que ça :

```javascript
ModuleRegistry.register({
  id: 'monmodule',
  name: 'Mon Module',
  init(container) { container.innerHTML = '<h1>Bonjour</h1>'; },
  update(fixes, stats, headers) { /* lâchez-vous */ },
  publish() { ModuleRegistry.publish('monmodule', { maValeur: 42 }); },
  lateUpdate() { const vent = ModuleRegistry.get('wind'); },
  onShow() { /* appelé quand l'onglet devient visible */ },
  destroy() { /* nettoyage */ },
});
```

## 🌡️ Le Pipeline d'Enrichissement

Des enregistrements B bruts entrent. Des données de vol enrichies sortent.

```
Fixes bruts (lat, lon, alt, temps)
  → Gestion du passage à minuit
  → Dérivées de base (vitesse, distance, cap, vario)
  → Lissage (fenêtre configurable, moyenne circulaire pour le cap)
  → Calcul du taux de virage
  → Détection de phases (3 passes : instantané → vote majoritaire → absorption)
  → Estimation du vent (analyse de dérive thermique → interpolation temporelle)
  → Fixes enrichis avec 20+ champs calculés par point
```

Le détecteur de phases a été le morceau le plus coriace. Il s'avère que « suis-je en thermique ? » est une question étonnamment philosophique quand votre taux de virage chute pendant 2 secondes en plein cercle. La solution : une fenêtre de vote majoritaire où le thermique a la priorité dès 30% de représentation, puis un filtre de durée minimale qui réabsorbe les micro-phases dans leurs voisines.

## 🎯 Théorie MacCready (Adaptée au Parapente)

Le MacCready classique dit : « volez plus vite entre les thermiques forts ». Le module construit une courbe polaire quadratique à partir des 3 points de vitesse de votre aile et calcule :

- **MC glissant** : la montée moyenne évolue au fil du vol (fenêtre ¼ de la durée)
- **Vitesse XC effective** : fenêtre de recul configurable (25 min par défaut)
- **Correction vent** : ajoute le vent moyen à la vitesse théorique pour les vols en ligne droite

> *« Un pilote parapente qui applique la théorie MacCready, c'est comme un cycliste qui applique l'aérodynamique de Formule 1 — techniquement correct mais la plage de vitesse est... limitée. »*

## 📐 Optimisation des Records

Trois types de distances, calculés par force brute sur des points échantillonnés :

- **Distance droite** : Décollage → TP1 → TP2 → TP3 → Atterrissage (O(n³))
- **Triangle plat** : Fermeture ≤ 3km, maximiser le périmètre (deux passes : grossier + affinement)
- **Triangle FAI** : Chaque branche ≥ 28% du périmètre

Le tout visualisé sur une carte Leaflet avec les routes superposées.

## 🌬️ Estimation du Vent

Pas de capteur de vitesse air ? Pas de problème. Quand vous thermaliquez en cercle, la dérive GPS du centre du cercle EST le vent. L'enrichisseur :

1. Suit l'accumulation du changement de cap en phase thermique
2. Détecte les cercles complets de 360°
3. Mesure le déplacement (= dérive du vent) sur chaque cercle
4. Collecte les échantillons par bande d'altitude
5. Interpole entre les échantillons (temps + altitude) pour le champ de vent complet

Les heatmaps montrent tout ça sous forme de grilles temps × altitude avec la vitesse en couleur et des micro-flèches pour la direction. C'est essentiellement un radiosondage du pauvre.

## ⚙️ Paramètres

Tout est réglable. Bouton `⚙ Paramètres` ou hackez directement `localStorage` :

```javascript
// Performance de l'aile
sinkRate: -1.0          // m/s (taux de chute en air calme)
trimSpeed: 40           // km/h
acceleratedSpeed: 55    // km/h (plein barreau)
minSpeed: 22            // km/h

// Détection de phases
thermalClimbMin: 0.3    // m/s — en dessous c'est pas du thermique
thermalTurnRateMin: 6   // °/s — faut tourner quand même

// MacCready
mcRollingWindow: 25     // minutes — fenêtre de recul vitesse XC
```

## 🌗 Mode Clair

Cliquez ☀ / 🌙 dans l'en-tête. Tous les graphiques s'adaptent. Persisté en localStorage. Vos yeux vous remercient.

## 📱 PWA

Installez-le sur votre téléphone. Il passe en plein écran. Fonctionne hors-ligne après le premier chargement. Parfait pour le trajet retour du déco quand vous n'avez pas de réseau mais que vous avez désespérément besoin de savoir si ce dernier thermique était votre meilleur de la journée.

## 🛠️ Stack Technique

- **Vanilla JS** — pas de framework, pas de build, pas de trou noir node_modules
- **Chart.js 4** + plugin zoom — tous les graphiques
- **Leaflet** — la carte
- **Variables CSS** — thématisation
- **Service Worker** — support hors-ligne
- **~2 200 lignes de JS** réparties sur 15 modules

## 📄 Format IGC

L'appli lit les fichiers IGC standard tels que définis par la [spécification FAI/IGC](https://xp-soaring.github.io/igc_file_format/igc_format_2008.html). Gère le passage à minuit, les trous de données, et l'interprétation créative de la spécification dont font preuve les différents enregistreurs de vol.

## Licence

Faites-en ce que vous voulez. Si vous volez plus loin grâce à ça, dites-le à vos potes.

---

```
  « À la fin, on ne regrette que les thermiques qu'on n'a pas pris. »
                                        — Ancien proverbe parapentiste
```
