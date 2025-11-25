# Roadmap - Obsidian Substack Publisher

## v1.0.0 (Current) - MVP
- [x] Authentification par cookie Substack
- [x] Support multi-publications
- [x] Conversion Markdown → Substack JSON
  - Headers (h1-h6)
  - Paragraphes avec formatage inline (bold, italic, code, liens)
  - Listes ordonnées/non-ordonnées
  - Blocs de code avec langage
  - Blockquotes
  - Images (URLs externes)
  - Règles horizontales
- [x] Modal de publication avec preview
- [x] Save as Draft / Publish direct

---

## v1.1.0 - Améliorations UX
- [ ] Sélecteur d'audience (everyone, only_paid, founding, only_free)
- [ ] Confirmation avant publication directe
- [ ] Affichage du lien vers le post après publication
- [ ] Meilleure gestion des erreurs (cookie expiré, rate limit, etc.)
- [ ] Notification de succès avec lien cliquable

## v1.2.0 - Gestion des drafts
- [ ] Liste des drafts existants
- [ ] Mise à jour d'un draft existant (au lieu de créer nouveau)
- [ ] Suppression de drafts
- [ ] Synchronisation bidirectionnelle (optionnel)

## v1.3.0 - Images
- [ ] Upload d'images locales vers Substack
- [ ] Support des images embarquées dans le Markdown
- [ ] Gestion des images de couverture (cover image)

## v1.4.0 - Métadonnées
- [ ] Support du frontmatter YAML pour métadonnées
  - `title`, `subtitle`, `audience`
  - `tags`, `section`
  - `scheduled_date` (publication programmée)
- [ ] Extraction automatique du titre depuis H1 ou frontmatter

## v1.5.0 - Multi-compte
- [ ] Support de plusieurs comptes Substack
- [ ] Profils de configuration
- [ ] Switch rapide entre comptes

---

## v2.0.0 - Fonctionnalités avancées
- [ ] Éditeur WYSIWYG preview (côte à côte)
- [ ] Templates de posts
- [ ] Statistiques de publication (vues, likes, comments)
- [ ] Intégration avec Obsidian Publish
- [ ] Support des newsletters programmées
- [ ] Paywall marker dans le Markdown (`<!-- paywall -->`)

---

## Backlog (non priorisé)
- [ ] Support des podcasts Substack
- [ ] Import de posts Substack → Obsidian
- [ ] Conversion inverse (Substack JSON → Markdown)
- [ ] Support des footnotes
- [ ] Support des tables Markdown
- [ ] Intégration avec d'autres plateformes (Medium, Ghost, etc.)
- [ ] Mode hors-ligne avec queue de publication
- [ ] Historique des publications dans une note dédiée

---

## Notes techniques

### Limitations connues
- API Substack non-officielle (peut changer)
- Cookie expire après ~30 jours
- Pas de support OAuth (Substack n'en propose pas)

### Dépendances à surveiller
- `obsidian` API changes
- Format JSON Substack (non documenté)
