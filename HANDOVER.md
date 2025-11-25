# Handover - Obsidian Substack Publisher

**Date**: 2025-11-25
**Session précédente**: Phase 1-3 complétées - Plugin fonctionnel, prêt pour tests

---

## Contexte du projet

Plugin Obsidian pour publier des notes sur Substack. Fusion de deux sources MIT :
- **obsidian-content-os** (structure plugin Obsidian, UI) - cloné comme base
- **substack-mcp-plus** (API Substack, Python) - fetché comme remote, à adapter en TypeScript

### Cahier des charges
Voir `obsidian-substack-publisher-spec.md` dans ce répertoire.

---

## État actuel du répertoire

### Git Remotes configurés
```
origin      → https://github.com/roomi-fields/obsidian-substack.git (ton repo)
upstream    → https://github.com/eharris128/obsidian-content-os.git (source LinkedIn)
substack-mcp → https://github.com/ty13r/substack-mcp-plus.git (source API Python)
```

Le code Python de substack-mcp est accessible via :
```bash
git show substack-mcp/main:src/handlers/post_handler.py
git show substack-mcp/main:src/converters/markdown_converter.py
git show substack-mcp/main:src/converters/block_builder.py
git show substack-mcp/main:src/simple_auth_manager.py
```

### Fichiers ✅ Prêts (Phase 1 complète)
- `manifest.json` - Adapté (id: obsidian-substack, author: Romi)
- `package.json` - Adapté (name: obsidian-substack, repo: roomi-fields, builtin-modules@3.3.0)
- `versions.json` - Reset à 1.0.0
- `LICENSE` - MIT avec attributions aux 3 sources
- `ATTRIBUTIONS.md` - Crédits détaillés
- `README.md` - Adapté pour Substack
- `.claude/` - Skills (release, skill-creator) copiés
- `deployment/` - Scripts de déploiement copiés
- `src/utils/logger.ts` - Réutilisable tel quel
- `main.ts` - ✅ Nettoyé, squelette SubstackPublisherPlugin fonctionnel
- `src/substack/api.ts` - ✅ Squelette SubstackAPI (createDraft, publishDraft, listDrafts, updateDraft)
- `src/substack/PostComposer.ts` - ✅ Modal avec sélecteur publication, titre, subtitle, preview, boutons Draft/Publish
- `styles.css` - ✅ Classes `substack-*` (renommées de `contentos-*`)

### Fichiers ✅ Phase 2 complète
- `src/substack/types.ts` - ✅ Interfaces TypeScript (SubstackBlock, SubstackDocument, etc.)
- `src/substack/converter.ts` - ✅ MarkdownConverter avec support headers, listes, code, blockquotes, images, inline formatting
- `src/substack/api.ts` - ✅ Mis à jour avec types stricts
- `src/substack/PostComposer.ts` - ✅ Intégré avec MarkdownConverter

---

## Choix techniques confirmés avec l'utilisateur

| Question | Réponse |
|----------|---------|
| Source API | substack-mcp-plus (Python → TypeScript) |
| Images v1 | Non (texte/Markdown seulement) |
| Publication | Draft + Publish direct |
| Multi-publications | Oui |

---

## Plan de travail (Tasklist)

### PHASE 1 : Nettoyage (squelette compilable) ✅ COMPLÈTE
- [x] 1.1 Structure projet (copier .claude, deployment)
- [x] 1.2 Nettoyer main.ts (remplacer LinkedIn → Substack squelette)
- [x] 1.3 Nettoyer src/substack/api.ts (vider code LinkedIn)
- [x] 1.4 Nettoyer src/substack/PostComposer.ts (vider code LinkedIn)
- [x] 1.5 Adapter styles.css (renommer classes)
- [x] 1.6 npm install + npm run build (vérifier compilation)

### PHASE 2 : Implémentation API ✅ COMPLÈTE
- [x] 2.1 Créer src/substack/types.ts
- [x] 2.2 Implémenter src/substack/api.ts (adapté de post_handler.py)
- [x] 2.3 Créer src/substack/converter.ts (adapté de markdown_converter.py + block_builder.py)
- [x] 2.4 Implémenter main.ts avec settings Substack (cookie, publications[])

### PHASE 3 : UI/UX ✅ COMPLÈTE (fait dans Phase 1-2)
- [x] 3.1 Implémenter PostComposer.ts modal
- [x] 3.2 Ajouter sélecteur de publication (multi-pub)
- [x] 3.3 Ajouter boutons Draft / Publish

### PHASE 4 : Tests
- [ ] Tests manuels dans Obsidian

### PHASE 5 : Finalisation
- [ ] Documentation finale
- [ ] Premier commit + push

---

## Références code Python à adapter

### API Substack (post_handler.py)
- `create_draft(title, content, subtitle, content_type)` → créer brouillon
- `publish_draft(post_id)` → publier
- `list_drafts()` → lister brouillons
- `update_draft(post_id, ...)` → mettre à jour

### Convertisseur Markdown (markdown_converter.py + block_builder.py)
- Headers (h1-h6)
- Paragraphes avec formatage inline (bold, italic, links)
- Listes ordonnées/non-ordonnées
- Code blocks
- Blockquotes
- Images (v2)
- Horizontal rules

### Structure bloc Substack JSON
```json
{
  "type": "paragraph",
  "content": [{"type": "text", "content": "Hello"}]
}
```

Types de blocs : `paragraph`, `heading-one` à `heading-six`, `bulleted-list`, `ordered-list`, `code`, `blockquote`, `image`, `paywall`

---

## API Substack (non-officielle)

- **Base URL**: `https://{publication}.substack.com/api/v1/`
- **Auth**: Cookie `connect.sid` ou `substack.sid`
- **Endpoints**:
  - `POST /drafts` - Créer draft
  - `PUT /drafts/{id}` - Mettre à jour
  - `POST /drafts/{id}/publish` - Publier
  - `GET /drafts` - Lister

---

## Commandes utiles

```bash
# Dev
npm install
npm run dev

# Build
npm run build

# Voir code Python substack-mcp
git show substack-mcp/main:src/handlers/post_handler.py | head -200
```

---

## Notes importantes

1. **Ne pas coder avant d'avoir un squelette propre qui compile**
2. **Adapter Python → TypeScript** en gardant la logique, pas copier-coller
3. **Auth simple** : cookie dans settings, pas de chiffrement complexe (Obsidian gère le stockage)
4. **Éviter la sur-ingénierie** : solution simple > solution parfaite

---

**Prochaine action** : PHASE 4 - Tests manuels dans Obsidian

## Pour tester le plugin

1. Copier `main.js`, `manifest.json`, `styles.css` dans `<vault>/.obsidian/plugins/obsidian-substack/`
2. Activer le plugin dans Obsidian Settings > Community plugins
3. Configurer dans Settings > Substack Publisher :
   - Cookie Substack (récupérer `substack.sid` ou `connect.sid` depuis les DevTools)
   - Nom(s) de publication(s) (ex: `mypub`)
4. Ouvrir une note Markdown, cliquer sur l'icône ribbon ou Cmd+P > "Publish to Substack"
5. Tester Draft et Publish
