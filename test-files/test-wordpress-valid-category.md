---
title: Test Article WordPress - Catégorie Valide
categorie: cnv
---

# Test avec catégorie valide

Ce fichier utilise une catégorie qui existe dans la configuration : `cnv`

## Comportement attendu

1. Le champ `categorie: cnv` devrait être détecté
2. La catégorie "cnv" devrait être pré-sélectionnée dans le dropdown
3. Aucun avertissement dans les logs
4. Publication devrait fonctionner normalement

## Test de case-insensitivity

La nouvelle implémentation supporte aussi des variations de casse :
- `categorie: CNV` devrait correspondre à `cnv`
- `categorie: Cnv` devrait correspondre à `cnv`
- `categorie: cnV` devrait correspondre à `cnv`

Tous ces cas devraient maintenant fonctionner correctement.
