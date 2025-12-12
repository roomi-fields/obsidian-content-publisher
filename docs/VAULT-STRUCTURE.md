# Vault Structure for Content Publisher

This document describes the recommended Obsidian vault structure for publishing to multiple WordPress sites.

## Overview

```
📁 Publications/
├── 📁 re.liance.art/           # Site FR uniquement
│   ├── 📁 articles/
│   │   ├── 📁 CNV/             # Catégorie WordPress
│   │   ├── 📁 Therapie/        # Catégorie WordPress
│   │   ├── 📁 Regards/         # Catégorie WordPress
│   │   └── 📁 Le-Cours/        # Catégorie WordPress
│   └── 📁 pages/
│       ├── 📁 cnv/             # Pages CNV (OSBD, etc.)
│       ├── 📁 disciplines/     # Pages de présentation (IFS, Trauma...)
│       ├── 📁 accompagnements/ # Pages accompagnements
│       └── *.md                # Autres pages
│
├── 📁 roomi-fields.com/        # Site bilingue FR/EN
│   ├── 📁 articles/
│   │   ├── 📁 News/
│   │   └── 📁 Articles/
│   └── 📁 pages/
│
└── 📁 _brouillons/             # Idées pas encore assignées à un site
```

## Frontmatter Standard

### Pour les articles (posts)

```yaml
---
title: "Mon Article"
type: post
tags: [IFS, trauma]              # Disciplines/thèmes (pour filtrage)
wordpress_id:                    # Auto-rempli après publication
wordpress_url:                   # Auto-rempli après publication
---
```

### Pour les pages

```yaml
---
title: "Ma Page"
type: page
wordpress_url: "https://re.liance.art/ma-page/"
wordpress_slug: "ma-page"
tags: [CNV]                      # Optionnel, pour regroupement
---
```

### Pour le contenu bilingue (roomi-fields.com)

```yaml
---
title: "Titre FR"
title_en: "English Title"
type: post
wordpress_url_fr: "https://roomi-fields.com/article/"
wordpress_url_en: "https://roomi-fields.com/en/article/"
---
```

## Catégories WordPress

### re.liance.art

| Dossier Obsidian | Catégorie WordPress | ID |
|------------------|---------------------|-----|
| CNV/ | CNV | 6 |
| Therapie/ | Thérapie | 22 |
| Regards/ | Regards | 23 |
| Le-Cours/ | Le Cours | 10 |

### roomi-fields.com

| Dossier Obsidian | Catégorie WordPress |
|------------------|---------------------|
| News/ | News |
| Articles/ | Articles |

## Liens entre pages/articles

Utilisez les wikilinks Obsidian standard :
```markdown
Voir ma page [[ifs]] pour plus d'infos sur l'IFS.
```

Le plugin Content Publisher résout automatiquement ces liens en URLs WordPress lors de la publication, en utilisant le champ `wordpress_url` du frontmatter de la page liée.

## Tags vs Catégories

- **Catégories** = Structure principale (CNV, Therapie, Regards, Le Cours)
- **Tags** = Disciplines/thèmes spécifiques (IFS, trauma, systémique, gestalt, philo, etc.)

Les tags permettent de :
- Filtrer les articles par discipline
- Générer des pages `/tag/ifs/` automatiques sur WordPress
- Ajouter de nouvelles disciplines sans modifier la structure
