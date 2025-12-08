---
title: Test Article WordPress avec Catégorie
categorie: systemique
---

# Test de détection de catégorie WordPress

Ce fichier teste la détection de la catégorie frontmatter pour WordPress.

Le frontmatter contient `categorie: systemique` (orthographe française).

## Comportement attendu

Avec la correction apportée :

1. Le champ `categorie: systemique` devrait être lu correctement
2. Si "systemique" n'existe pas dans les catégories configurées, une **alerte** sera affichée dans les logs
3. La catégorie par défaut sera utilisée comme fallback
4. Un message d'avertissement clair indiquera le problème

## Catégories configurées

D'après `main.ts`, les catégories disponibles sont :
- `cnv` (ID: 6)
- `ifs` (ID: 7)
- `trauma` (ID: 8)

Puisque "systemique" n'est pas dans cette liste, vous devez soit :

1. Ajouter "systemique" à votre configuration WordPress
2. Utiliser une des catégories existantes : "cnv", "ifs", ou "trauma"

## Solution

Changez le frontmatter en :
```yaml
categorie: cnv
```

Ou ajoutez "systemique" dans vos paramètres WordPress.
