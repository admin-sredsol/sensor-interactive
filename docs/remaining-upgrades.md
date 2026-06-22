# Remaining Package Upgrades — Sensor Interactive

> Generated: 2026-06-22  
> Branch: `upgrade/react-19` (React 19 upgrade complete)

## Summary

After the React 19 upgrade, **41 packages** still have newer versions available. This document categorizes them by risk level and recommended upgrade approach.

---

## ✅ Already Upgraded (React 19 PR)

| Package | From | To | Status |
|---------|------|----|--------|
| `react` | `^16.14.0` | `^19.2.7` | ✅ Done |
| `react-dom` | `^16.14.0` | `^19.2.7` | ✅ Done |
| `@types/react` | `^16.14.22` | `^19.2.17` | ✅ Done |
| `@types/react-dom` | `^16.9.14` | `^19.2.3` | ✅ Done |
| `@types/react-modal` | `^3.13.1` | `^3.16.3` | ✅ Done |
| `react-modal` | `^3.14.4` | `^3.16.3` | ✅ Done |

**Removed:** `react-sizeme`, `react-sparklines`, `@types/react-sparklines`

---

## 🟢 Safe — Minor/Patch Updates (Low Risk)

These are same-major-version updates that should be safe to upgrade in a single PR.

| Package | Current | Latest | Gap | Notes |
|---------|---------|--------|-----|-------|
| `@types/lodash` | `4.14.178` | `4.17.24` | Minor | ✅ Done in PR1 |
| `@types/semver` | `7.3.9` | `7.7.1` | Minor | ✅ Done in PR1 |
| `@types/web-bluetooth` | `0.0.12` | `0.0.21` | Patch | ✅ Done in PR1 |
| `dygraphs` | `2.1.0` | `2.2.1` | Minor | ✅ Done in PR1 |
| `eslint-plugin-import` | `2.25.4` | `2.32.0` | Minor | ✅ Done in PR1 |
| `html-webpack-plugin` | `5.5.3` | `5.6.7` | Minor | ✅ Done in PR1 |
| `lodash` | `4.17.21` | `4.18.1` | Patch | ✅ Done in PR1 |
| `postcss` | `8.4.38` | `8.5.15` | Minor | ✅ Done in PR1 |
| `semver` | `7.3.5` | `7.8.5` | Minor | ✅ Done in PR1 |
| `ts-loader` | `9.5.1` | `9.6.1` | Patch | ✅ Done in PR1 |
| `webpack` | `5.76.0` | `5.107.2` | Minor | ✅ Done in PR1 |
| `@typescript-eslint/eslint-plugin` | `5.10.2` | `5.62.0` | Minor | ✅ Done in PR1 |
| `@typescript-eslint/parser` | `5.10.2` | `5.62.0` | Minor | ✅ Done in PR1 |
| `eslint` | `8.8.0` | `8.57.1` | Minor | ✅ Done in PR1 |
| `eslint-config-prettier` | `8.3.0` | `8.10.2` | Minor | ✅ Done in PR1 |
| `eslint-plugin-jsdoc` | `37.7.0` | `37.9.7` | Minor | ✅ Done in PR1 |
| `css-loader` | `6.6.0` | `6.11.0` | Minor | ✅ Done in PR1 |
| `cypress` | `13.12.0` | `13.17.0` | Minor | ✅ Done in PR1 |
| `@vernier/godirect` | `1.7.1` | `1.8.3` | Minor | ⚠️ Skipped — v1.8 uses ESM, breaks Jest |
| `iframe-phone` | `1.3.1` | `1.4.0` | Minor | ✅ Done in PR1 |

**Recommended:** Bundle these into one PR. Run `npm update` then verify build + tests.

---

## 🟡 Moderate — Major Version Bumps (Medium Risk)

These require API review and potentially code changes, but are well-scoped.

| Package | Current | Latest | Breaking Changes | Notes |
|---------|---------|--------|-------------------|-------|
| `d3-format` | `1.4.5` | `3.1.2` | ESM-only in v3; `@types/d3-format` needs v3+ | Check format strings |
| `@types/d3-format` | `1.4.2` | `3.0.4` | Must match `d3-format` v3 | Upgrade with d3-format |
| `@types/dygraphs` | `1.1.13` | `2.1.11` | Major type changes | Check compatibility with dygraphs v2 |
| `@types/jest` | `27.4.0` | `30.0.0` | Must match jest major | Upgrade with jest |
| `jest` | `27.5.1` | `30.4.2` | Major breaking changes in v28+ | Needs config migration |
| `ts-jest` | `27.1.3` | `29.4.11` | Must match jest major | Upgrade with jest |
| `copy-webpack-plugin` | `10.2.4` | `14.0.0` | API changes in v11+ | Check webpack config |
| `webpack-cli` | `5.1.4` | `7.0.3` | Breaking config changes | Check webpack config |
| `webpack-dev-server` | `4.7.4` | `5.2.5` | Breaking config changes | Check dev server config |
| `postcss-loader` | `6.2.1` | `8.2.1` | Requires postcss v8+ (already have) | Check loader config |
| `source-map-loader` | `0.2.4` | `5.0.0` | Complete rewrite | Check webpack config |
| `style-loader` | `3.3.1` | `4.0.0` | ESM-only in v4 | Check webpack config |
| `cypress-commands` | `2.0.1` | `3.0.0` | API changes | Check test files |
| `@simonsmith/cypress-image-snapshot` | `9.0.3` | `10.0.4` | API changes | Check snapshot tests |
| `cross-env` | `7.0.3` | `10.1.0` | ESM-only in v10 | Check scripts |
| `wait-on` | `4.0.2` | `9.0.10` | Major API changes | Check CI scripts |

**Recommended:** Upgrade in focused groups:
- **Group A (Webpack):** `webpack-cli`, `webpack-dev-server`, `copy-webpack-plugin`, `css-loader`, `style-loader`, `postcss-loader`, `source-map-loader` — test build thoroughly
- **Group B (Testing):** `jest`, `ts-jest`, `@types/jest`, `cypress`, `cypress-commands`, `@simonsmith/cypress-image-snapshot` — test all test suites
- **Group C (D3):** `d3-format`, `@types/d3-format` — check format strings
- **Group D (Individual):** `cross-env`, `wait-on`, `@types/dygraphs`

---

## 🔴 High Risk — Major Breaking Changes (High Risk)

These require significant code changes and careful testing.

| Package | Current | Latest | Breaking Changes | Notes |
|---------|---------|--------|-------------------|-------|
| `jquery` | `3.6.0` | `4.0.0` | Removed deprecated APIs, ESM-first | Used in `shutterbug` integration; audit all jQuery usage |
| `typescript` | `4.9.5` | `6.0.3` | Stricter type checking, new errors likely | Will surface new type errors; fix first |
| `eslint` | `8.8.0` | `10.5.0` | Flat config required in v9+ | Need new `eslint.config.mjs` |
| `@typescript-eslint/*` | `5.10.2` | `8.61.1` | Must match eslint v9+ | Upgrade with eslint |
| `eslint-config-prettier` | `8.3.0` | `10.1.8` | Must match eslint v9+ | Upgrade with eslint |
| `eslint-plugin-jsdoc` | `37.7.0` | `63.0.7` | Major API changes | Upgrade with eslint |
| `@concord-consortium/lara-interactive-api` | `1.7.0` | `1.13.0` | API additions/changes | Check breaking changes in changelog |
| `@concord-consortium/slate-editor` | `0.7.3` | `0.13.0` | ✅ Done in PR2 | Major rewrite, React 18+ required |

**Recommended:** Each deserves its own PR:
- **`typescript` v5→v6:** Run `tsc --noEmit` first to see new errors, fix, then upgrade
- **`eslint` v8→v9 + `@typescript-eslint` v5→v8:** Create flat config, remove tslint scripts
- **`jquery` v3→v4:** Audit all jQuery usage, test shutterbug integration
- **`@concord-consortium/slate-editor` v0.7→v0.13:** Highest impact — eliminates all 20 node_modules TS errors
- **`@concord-consortium/lara-interactive-api` v1.7→v1.13:** Check API changes

---

## 🗑️ Cleanup — Remove or Replace

| Package | Current | Action | Notes |
|---------|---------|--------|-------|
| `text-encoding` | `0.7.0` | **Remove** | Polyfill for `TextEncoder`/`TextDecoder`; not needed in modern browsers |
| `tslint` (in scripts) | — | **Remove scripts** | Deprecated; project has `@typescript-eslint` but no ESLint config |
| `source-map-loader` | `0.2.4` | **Upgrade or remove** | v0.2 is very old; v5 is complete rewrite; may not be needed |

---

## 📋 Recommended Upgrade Order

### PR 1: Safe Minor Updates ✅ COMPLETED

```
@types/lodash, @types/semver, @types/web-bluetooth, @types/jest, dygraphs,
eslint-plugin-import, html-webpack-plugin, lodash, postcss, semver,
ts-loader, webpack, @typescript-eslint/* (v5 latest), eslint (v8 latest),
eslint-config-prettier (v8 latest), eslint-plugin-jsdoc (v37 latest),
css-loader (v6 latest), cypress (v13 latest), @simonsmith/cypress-image-snapshot (v9 latest),
shutterbug, jquery (v3 latest), iframe-phone, style-loader (v3 latest)
```
**Risk:** Very low. All same-major-version updates.
**Result:** Build passes, 11/11 Jest tests pass, Cypress smoke test passes.
**Note:** `@vernier/godirect` v1.8 was skipped — it uses ESM which breaks Jest.

### PR 2: Slate Editor Upgrade ✅ COMPLETED

```
@concord-consortium/slate-editor: 0.7.3 → 0.13.0
```
**Impact:** Reduced TS errors from 20 to 10 (all remaining in `node_modules/`). Required React 18+ (already have React 19).
**Breaking changes:** `SlateEditor` + `SlateToolbar` → `SlateContainer`, `getContentHeight` removed, CSS path changed, `order` → `buttons` prop.

### PR 3: LARA Interactive API
```
@concord-consortium/lara-interactive-api: 1.7.0 → 1.13.0
```
**Impact:** Check for API changes in init message handling.

### PR 4: Webpack Ecosystem
```
webpack-cli: 5 → 7, webpack-dev-server: 4 → 5, copy-webpack-plugin: 10 → 14,
css-loader: 6 → 7, style-loader: 3 → 4, postcss-loader: 6 → 8,
source-map-loader: 0.2 → 5
```
**Risk:** Medium. Config changes needed.

### PR 5: Testing Infrastructure
```
jest: 27 → 30, ts-jest: 27 → 29, @types/jest: 27 → 30,
cypress: 13 → 15, cypress-commands: 2 → 3,
@simonsmith/cypress-image-snapshot: 9 → 10
```
**Risk:** Medium. Config migration needed for jest v28+.

### PR 6: TypeScript v5/6
```
typescript: 4.9 → 6.0
```
**Risk:** Medium. Will surface new type errors that need fixing first.

### PR 7: ESLint v9 + Flat Config
```
eslint: 8 → 9, @typescript-eslint/*: 5 → 8, eslint-config-prettier: 8 → 10,
eslint-plugin-jsdoc: 37 → 63
```
**Risk:** Medium. Requires new `eslint.config.mjs` file.

### PR 8: jQuery v4
```
jquery: 3 → 4
```
**Risk:** High. Audit all jQuery usage first.

### PR 9: D3 Format v3
```
d3-format: 1 → 3, @types/d3-format: 1 → 3
```
**Risk:** Low-medium. Check format string compatibility.

### PR 10: Cleanup
```
Remove text-encoding polyfill
Remove tslint scripts from package.json
Add ESLint scripts to package.json
```

---

## Packages NOT Listed in Original Plan

These packages were not mentioned in the original upgrade plan but appear in `npm outdated`:

| Package | Current | Latest | Why Missed | Risk |
|---------|---------|--------|------------|------|
| `@simonsmith/cypress-image-snapshot` | `9.0.3` | `10.0.4` | Not in original inventory | Medium |
| `@types/dygraphs` | `1.1.13` | `2.1.11` | Not in original inventory | Medium |
| `@types/web-bluetooth` | `0.0.12` | `0.0.21` | Not in original inventory | Low |
| `copy-webpack-plugin` | `10.2.4` | `14.0.0` | Listed but version gap was larger than noted | High |
| `cross-env` | `7.0.3` | `10.1.0` | Not in original inventory | Medium |
| `cypress-commands` | `2.0.1` | `3.0.0` | Not in original inventory | Medium |
| `eslint-plugin-jsdoc` | `37.7.0` | `63.0.7` | Listed as `^37.7.0` but latest is v63 | High |
| `postcss-loader` | `6.2.1` | `8.2.1` | Not in original inventory | Medium |
| `source-map-loader` | `0.2.4` | `5.0.0` | Not in original inventory | High |
| `wait-on` | `4.0.2` | `9.0.10` | Not in original inventory | High |