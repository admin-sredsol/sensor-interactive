# Sensor Interactive — React 19 Upgrade Plan

> **Current React version:** `^16.14.0`  
> **Target React version:** `^19.0.0` (latest: 19.2.7)  
> **Date:** 2026-06-22

---

## Executive Summary

The `sensor-interactive` project currently runs **React 16** and must be upgraded to **React 19**. This requires:

- Replacing **35 `ReactDOM.render()`** calls with `createRoot().render()`
- Removing **2 `componentWillReceiveProps`** lifecycle methods
- Replacing **3 abandoned React libraries** (`react-sizeme`, `react-sparklines`, `react-modal` needs update)
- Updating **TypeScript config** for the new JSX transform
- Updating **all type definitions** to match React 19
- Updating **20+ dependency versions** across `dependencies` and `devDependencies`

---

## Current Dependency Inventory

### Runtime Dependencies

| Package | Current | Latest | React 19 Compatible | Notes |
|---------|---------|--------|---------------------|-------|
| `react` | `^16.14.0` | `19.2.7` | ✅ Target | Core upgrade |
| `react-dom` | `^16.14.0` | `19.2.7` | ✅ Target | Core upgrade |
| `react-modal` | `^3.14.4` | `3.16.3` | ✅ (v3.16+ supports React 19) | Update to latest |
| `react-sizeme` | `^3.0.2` | `3.0.2` | ❌ Abandoned | **Replace with custom hook** |
| `react-sparklines` | `^1.7.0` | `1.7.0` | ❌ Abandoned (2017) | **Replace with custom component** |
| `@concord-consortium/lara-interactive-api` | `^1.7.0` | `1.13.0` | ✅ (`>=16.9.0`) | Update to latest |
| `@concord-consortium/sensor-connector-interface` | `^0.2.0` | `0.2.0` | ✅ (no React peer dep) | Already latest |
| `@vernier/godirect` | `^1.7.1` | `1.8.3` | ✅ (no React peer dep) | Update |
| `d3-format` | `^1.4.5` | `3.1.2` | ✅ | Major version bump (v2→v3) |
| `dygraphs` | `^2.1.0` | `2.2.1` | ✅ | Minor update |
| `iframe-phone` | `^1.3.1` | `1.4.0` | ✅ | Minor update |
| `jquery` | `^3.6.0` | `4.0.0` | ✅ | **Major version bump** |
| `lodash` | `^4.17.21` | `4.18.1` | ✅ | Patch update |
| `semver` | `^7.3.5` | `7.8.5` | ✅ | Minor update |
| `shutterbug` | `^1.3.3-pre` | `1.5.0` | ✅ | Update |
| `text-encoding` | `^0.7.0` | — | ✅ | Polyfill; consider removing if targeting modern browsers |

### Dev Dependencies

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `@concord-consortium/slate-editor` | `^0.7.3` | `0.13.0` | Major update; peer dep `react>=18` |
| `@types/react` | `^16.14.22` | `19.2.17` | Must match React 19 |
| `@types/react-dom` | `^16.9.14` | `19.2.3` | Must match React 19 |
| `@types/react-modal` | `^3.13.1` | `3.16.3` | Update |
| `typescript` | `^4.9.5` | `6.0.3` | Major update (v5→v6) |
| `@typescript-eslint/parser` | `^5.10.2` | `8.61.1` | Major update |
| `@typescript-eslint/eslint-plugin` | `^5.10.2` | `8.61.1` | Major update |
| `eslint` | `^8.8.0` | `9.x` | Major update (flat config) |
| `jest` | `^27.5.1` | `30.4.2` | Major update |
| `ts-jest` | `^27.1.3` | `29.4.11` | Major update |
| `cypress` | `^13.12.0` | `15.17.0` | Major update |
| `webpack` | `^5.76.0` | `5.107.2` | Minor update |
| `webpack-cli` | `^5.1.4` | `7.0.3` | Major update |
| `webpack-dev-server` | `^4.7.4` | `5.2.5` | Major update |
| `css-loader` | `^6.6.0` | `7.1.4` | Major update |
| `style-loader` | `^3.3.1` | `4.0.0` | Major update |
| `ts-loader` | `^9.5.1` | `9.6.1` | Patch update |
| `copy-webpack-plugin` | `^10.2.4` | `14.0.0` | Major update |
| `html-webpack-plugin` | `^5.5.3` | `5.6.7` | Minor update |

---

## Breaking Changes Inventory

### 🔴 Critical — Will Cause Runtime Errors

#### 1. `ReactDOM.render()` removed (35 occurrences)

React 19 removes `ReactDOM.render()`. All 35 call sites must be migrated to `createRoot()`:

**Production files (3):**
- `src/interactive/index.tsx` — line 7
- `src/interactive/report-item.tsx` — line 78
- `src/app.tsx` — line 14

**Example files (32):**
- All files in `src/examples/` directory

**Migration pattern:**
```tsx
// BEFORE (React 16)
import ReactDOM from "react-dom";
ReactDOM.render(<App />, document.getElementById("app"));

// AFTER (React 19)
import { createRoot } from "react-dom/client";
const root = createRoot(document.getElementById("app")!);
root.render(<App />);
```

#### 2. `componentWillReceiveProps` removed (2 occurrences)

React 19 removes this lifecycle method entirely:

- `src/components/graph.tsx` — line 343
- `src/components/sensor-graph.tsx` — line 163

**Migration pattern:**
```tsx
// BEFORE
componentWillReceiveProps(nextProps: GraphProps) {
  if (nextProps.someValue !== this.props.someValue) {
    this.setState({ derivedValue: compute(nextProps) });
  }
}

// AFTER — Option A: getDerivedStateFromProps (if setting state from props)
static getDerivedStateFromProps(props: GraphProps, state: GraphState) {
  return { derivedValue: compute(props) };
}

// AFTER — Option B: componentDidUpdate (if side effects needed)
componentDidUpdate(prevProps: GraphProps) {
  if (prevProps.someValue !== this.props.someValue) {
    // perform side effect
  }
}
```

### 🟡 Warning — Library Compatibility Issues

#### 3. `react-sizeme` — Abandoned, must be replaced

- **Current:** `^3.0.2` (last updated 2019)
- **Used in:** `src/components/app.tsx` — wraps `AppContainer` with `withSize()` HOC
- **Purpose:** Injects `size.width` and `size.height` props for responsive layout
- **Replacement:** Custom `useResizeObserver` hook

```tsx
// BEFORE
import withSize from "react-sizeme";
const App = withSize({ monitorHeight: true })(AppContainer);

// AFTER — custom hook
function useResizeObserver(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
```

#### 4. `react-sparklines` — Abandoned (2017), must be replaced

- **Current:** `^1.7.0` (last updated 2017)
- **Used in:** `src/interactive/report-item-metrics.tsx` — `Sparklines`, `SparklinesLine`, `SparklinesBars`
- **Also:** `src/interactive/report-item-sparkline-points.tsx` — `Point` type
- **Replacement options:**
  - **Option A:** Use a lightweight SVG-based custom sparkline component
  - **Option B:** Use `@nivo/sparkline` or `victory` (heavier)
  - **Recommended:** Option A — the project already has a custom `SparklinesPoints` component

#### 5. `react-modal` — Update to v3.16+

- **Current:** `^3.14.4`
- **Latest:** `3.16.3` — **React 19 compatible** (peer dep includes `^19`)
- **Used extensively in:** `src/components/app.tsx` (9 modal dialogs)
- **Action:** Update version, no API changes needed

### 🟢 Informational — Should Update

#### 6. TypeScript JSX transform

`tsconfig.json` currently uses `"jsx": "react"` which requires explicit `import React from "react"`. React 17+ supports the automatic JSX runtime:

```jsonc
// BEFORE
"jsx": "react"

// AFTER
"jsx": "react-jsx"
```

This change allows removing `import React from "react"` from files that only use JSX (not hooks or other React APIs). However, since many files use `React.useState`, `React.useEffect`, etc., the import will still be needed in most files.

#### 7. `react-dom/server` import

- **File:** `src/interactive/report-item-metrics.tsx`
- **Current:** `import * as Renderer from "react-dom/server"`
- **Status:** Still works in React 19, no change needed

---

## Upgrade Plan — Step by Step

### Phase 1: Preparation & Branch Setup ✅ COMPLETED

- [x] **Step 1.1:** Create a feature branch `upgrade/react-19` ✅
- [x] **Step 1.2:** Ensure all existing tests pass (`npm run test:jest`) ✅
- [x] **Step 1.3:** Run Cypress smoke tests to establish baseline (`npm run test:cypress:smoke`) ✅
- [x] **Step 1.4:** Commit current working state as baseline ✅

#### Phase 1 Baseline Test Results

| Test | Result | Details |
|------|--------|---------|
| **Jest unit tests** | ✅ PASS | 11 tests passed, 0 failed, 0 skipped |
| **TypeScript compilation** | ⚠️ 71 errors (all in `node_modules/`) | All errors are in `@concord-consortium/slate-editor`, `slate-react`, `slate-dom`, and `@types/node` — **zero source-level errors** |
| **Webpack production build** | ✅ PASS | Compiled successfully in 9s; all 35 entry points built |
| **Cypress verification** | ✅ PASS | Cypress v13.12.0 verified; 34 E2E test files found (1 smoke, 13 bar, 13 line, 7 branch) |
| **Cypress smoke tests** | ⏭️ SKIPPED | Requires running dev server + browser; manual verification needed |

#### Pre-existing Issues Found

1. **`@concord-consortium/slate-editor` type errors** — The `slate-editor` v0.7.3 has broken type definitions that depend on `slate-react` types with incompatible `Editor`/`Plugin` exports and missing `slate` type declarations. These are all in `node_modules/` and don't affect the build (webpack ignores `.d.ts` files). This will be resolved when upgrading `slate-editor` to v0.13.0 in Phase 4.

2. **`@types/node` conflict** — `AbortSignal` type mismatch between `@types/node` and the project's `tsconfig.json`. This is a pre-existing issue that doesn't affect runtime.

3. **`npm audit` vulnerabilities** — 59 vulnerabilities (16 low, 21 moderate, 18 high, 4 critical) found in `node_modules/`. These should be addressed separately from the React 19 upgrade.

### Phase 2: Replace Abandoned Libraries (Pre-React Upgrade)

These changes are independent of the React version and can be done first to reduce the scope of the React 19 upgrade.

- [ ] **Step 2.1: Replace `react-sizeme` with custom `useResizeObserver` hook**
  - Create `src/hooks/use-resize-observer.ts` with a `useResizeObserver` hook
  - Refactor `src/components/app.tsx`:
    - Remove `withSize` HOC wrapper
    - Convert `AppContainer` from class component to use the new hook
    - Pass size through context or props instead of HOC injection
  - Remove `react-sizeme` from `package.json`
  - Remove `@types/react-sizeme` if present
  - **Test:** Verify responsive layout still works

- [ ] **Step 2.2: Replace `react-sparklines` with custom SVG sparkline component**
  - Create `src/components/sparkline.tsx` — lightweight SVG sparkline component
  - Refactor `src/interactive/report-item-metrics.tsx`:
    - Replace `Sparklines`, `SparklinesLine`, `SparklinesBars` imports with custom component
  - Refactor `src/interactive/report-item-sparkline-points.tsx`:
    - Replace `Point` type import with custom type
  - Remove `react-sparklines` from `package.json`
  - Remove `@types/react-sparklines` from `package.json`
  - **Test:** Verify sparkline rendering in report items

- [ ] **Step 2.3: Update `react-modal` to v3.16+**
  - Update `package.json`: `"react-modal": "^3.16.3"`
  - Update `@types/react-modal`: `"^3.16.3"`
  - **Test:** Verify all 9 modal dialogs still work

### Phase 3: Fix React 19 Breaking Patterns

- [ ] **Step 3.1: Replace all `ReactDOM.render()` calls with `createRoot()`**
  
  **Production files (3):**
  - `src/interactive/index.tsx`
  - `src/interactive/report-item.tsx`
  - `src/app.tsx`
  
  **Example files (32):**
  - All files in `src/examples/` directory
  
  **Migration pattern for each file:**
  ```tsx
  // Remove: import ReactDOM from "react-dom";
  // Add:    import { createRoot } from "react-dom/client";
  // Replace: ReactDOM.render(<Component />, element)
  // With:    createRoot(element).render(<Component />)
  ```

- [ ] **Step 3.2: Replace `componentWillReceiveProps` in `graph.tsx`**
  - Read the current implementation of `componentWillReceiveProps` in `src/components/graph.tsx`
  - Determine if it's computing derived state or performing side effects
  - Replace with `getDerivedStateFromProps` (for derived state) or `componentDidUpdate` (for side effects)
  - **Test:** Verify graph rendering and data updates

- [ ] **Step 3.3: Replace `componentWillReceiveProps` in `sensor-graph.tsx`**
  - Read the current implementation in `src/components/sensor-graph.tsx`
  - Apply same migration pattern as Step 3.2
  - **Test:** Verify sensor graph updates

### Phase 4: Upgrade React & Core Dependencies

- [ ] **Step 4.1: Update React packages**
  ```bash
  npm install react@^19.0.0 react-dom@^19.0.0
  npm install -D @types/react@^19.0.0 @types/react-dom@^19.0.0
  ```

- [ ] **Step 4.2: Update TypeScript config**
  - In `tsconfig.json`, change `"jsx": "react"` to `"jsx": "react-jsx"`
  - Consider updating `"module": "es6"` to `"module": "esnext"` (optional)
  - Consider adding `"strict": true` (optional, may require additional fixes)

- [ ] **Step 4.3: Update Concord libraries**
  ```bash
  npm install @concord-consortium/lara-interactive-api@^1.13.0
  npm install -D @concord-consortium/slate-editor@^0.13.0
  ```
  - **Note:** `slate-editor` v0.13.0 requires `react>=18`, which is compatible with React 19
  - Check for any API changes in `lara-interactive-api` v1.7→v1.13

- [ ] **Step 4.4: Update other runtime dependencies**
  ```bash
  npm install @vernier/godirect@^1.8.3 dygraphs@^2.2.1 iframe-phone@^1.4.0 lodash@^4.18.1 semver@^7.8.5
  ```
  - **Note on `d3-format`:** v3.x has breaking changes from v1.x — check API compatibility
  - **Note on `jquery`:** v4.0 has breaking changes — defer this to a separate upgrade
  - **Note on `shutterbug`:** Update from pre-release to stable v1.5.0

- [ ] **Step 4.5: Update dev dependencies**
  ```bash
  npm install -D @types/d3-format@^3 @types/dygraphs@^1 @types/lodash@^4 @types/semver@^7 @types/web-bluetooth@^0.0.20
  npm install -D typescript@^5.8 @typescript-eslint/parser@^8 @typescript-eslint/eslint-plugin@^8
  npm install -D jest@^29 ts-jest@^29 @types/jest@^29
  npm install -D cypress@^15
  npm install -D webpack@^5 webpack-cli@^5 webpack-dev-server@^5
  npm install -D css-loader@^7 style-loader@^4 ts-loader@^9 copy-webpack-plugin@^14 html-webpack-plugin@^5
  ```
  - **Note:** `webpack-cli` v7 and `copy-webpack-plugin` v14 have breaking changes — consider upgrading separately
  - **Note:** `eslint` v9 uses flat config — defer to separate upgrade
  - **Note:** `jest` v30 and `ts-jest` v30 are available but may need migration — consider v29 first

### Phase 5: Type Fixes & Compilation

- [ ] **Step 5.1: Fix TypeScript errors from React 19 type changes**
  - React 19 types have significant changes from `@types/react@16`:
    - `React.FC` no longer includes implicit `children` prop
    - Many event types have changed
    - `ref` callback types are more strict
    - `React.Component` generic parameters may need updating
  - Run `npx tsc --noEmit` and fix all type errors

- [ ] **Step 5.2: Fix `children` prop issues**
  - React 19 types removed implicit `children` from `React.FC`
  - Add explicit `children?: React.ReactNode` to component props that use children

- [ ] **Step 5.3: Fix ref type changes**
  - `React.RefObject<T>` in React 19 is `{ current: T | null }` (no longer mutable)
  - Callback refs may need type adjustments
  - `React.createRef()` return type may differ

- [ ] **Step 5.4: Update `@types/react-modal`**
  - Ensure types are compatible with `react-modal` v3.16+

### Phase 6: Testing & Validation

- [ ] **Step 6.1: Run TypeScript compilation**
  ```bash
  npx tsc --noEmit
  ```
  Fix all errors before proceeding.

- [ ] **Step 6.2: Run Jest unit tests**
  ```bash
  npm run test:jest
  ```

- [ ] **Step 6.3: Run webpack build**
  ```bash
  npm run build
  ```

- [ ] **Step 6.4: Run dev server and manual testing**
  ```bash
  npm start
  ```
  - Verify app loads correctly
  - Test sensor connection functionality
  - Test all modal dialogs
  - Test responsive layout (replacing `react-sizeme`)
  - Test sparkline rendering in reports
  - Test graph rendering and data updates

- [ ] **Step 6.5: Run Cypress E2E tests**
  ```bash
  npm run test:cypress
  ```

- [ ] **Step 6.6: Visual regression testing**
  - Compare screenshots before and after upgrade
  - Focus on: graphs, modals, sparklines, responsive layout

### Phase 7: Cleanup & Documentation

- [ ] **Step 7.1: Remove unused imports**
  - Remove `import React from "react"` from files that no longer need it (after `"jsx": "react-jsx"` change)
  - Remove `import ReactDOM from "react-dom"` from all files

- [ ] **Step 7.2: Update ESLint configuration**
  - Replace `tslint` with proper ESLint config (project has `@typescript-eslint` packages but no config)
  - Create `eslint.config.mjs` or `.eslintrc.js`

- [ ] **Step 7.3: Update `package.json` scripts**
  - Remove `tslint` scripts (`lint`, `lint:fix`)
  - Add ESLint scripts

- [ ] **Step 7.4: Consider class component → function component migration**
  - The 7 class components could be migrated to function components with hooks
  - This is optional but recommended for long-term maintainability
  - Priority order (by complexity):
    1. `SmartHighlightButton` — simple, no lifecycle
    2. `SmartHighlightSelect` — simple, no lifecycle
    3. `OverlayBarGraph` — moderate, uses canvas refs
    4. `OverlayGraph` — moderate, uses canvas refs
    5. `SensorGraph` — complex, uses `componentWillReceiveProps`
    6. `Graph` — complex, uses `componentWillReceiveProps`, `shouldComponentUpdate`
    7. `AppContainer` — very complex (~1730 lines), uses many lifecycle methods

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `ReactDOM.render()` → `createRoot()` migration | 🔴 High | 35 files to update; use find-and-replace with manual review |
| `componentWillReceiveProps` removal | 🔴 High | Only 2 files; requires understanding of state derivation logic |
| `react-sizeme` replacement | 🟡 Medium | Custom hook is straightforward; test responsive behavior thoroughly |
| `react-sparklines` replacement | 🟡 Medium | Custom SVG component needed; project already has partial replacement |
| `d3-format` v1→v3 breaking changes | 🟡 Medium | Check API compatibility; may need format string updates |
| `@types/react` v16→v19 type changes | 🟡 Medium | Many type errors expected; batch fix with `tsc --noEmit` |
| `jquery` v3→v4 breaking changes | 🟡 Medium | Defer to separate upgrade |
| `webpack-cli` v5→v7 breaking changes | 🟡 Medium | Defer to separate upgrade |
| `jest` v27→v29+ breaking changes | 🟡 Medium | Defer to separate upgrade or upgrade carefully |
| `eslint` v8→v9 flat config | 🟡 Medium | Defer to separate upgrade |

---

## Recommended Upgrade Order

```
Phase 2 (Replace abandoned libs) → Phase 3 (Fix breaking patterns) → Phase 4 (Upgrade React) → Phase 5 (Fix types) → Phase 6 (Test) → Phase 7 (Cleanup)
```

**Rationale:** Replacing abandoned libraries and fixing breaking patterns *before* upgrading React reduces the number of simultaneous changes and makes debugging easier. If something breaks after the React upgrade, we know it's not because of the library replacements.

---

## Deferred Upgrades (Separate PRs)

These are important but should be done in separate PRs to keep the React 19 upgrade manageable:

1. **`jquery` v3 → v4** — Major breaking changes, needs careful testing
2. **`d3-format` v1 → v3** — API changes, check format strings
3. **`webpack-cli` v5 → v7** — Breaking config changes
4. **`jest` v27 → v29+** — Breaking test config changes
5. **`eslint` v8 → v9** — Flat config migration
6. **`typescript` v4 → v5/6** — May surface new type errors
7. **Class → function component migration** — Large refactor, do incrementally
8. **Remove `text-encoding` polyfill** — Not needed in modern browsers