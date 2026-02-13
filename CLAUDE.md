# Rush Stack Monorepo

## Overview
Microsoft's Rush Stack: ~130 TypeScript projects providing the Rush monorepo manager, Heft build system, API Extractor, ESLint configs, webpack plugins, and supporting libraries. Managed by Rush v5 with pnpm.

## Monorepo Structure
All projects are exactly 2 levels deep (e.g., `apps/rush`, `libraries/node-core-library`).

| Path | Purpose |
|------|---------|
| `apps/` | Published CLI tools (Rush, Heft, API Extractor, etc.) |
| `libraries/` | Core shared libraries |
| `heft-plugins/` | Heft build system plugins |
| `rush-plugins/` | Rush monorepo plugins |
| `webpack/` | Webpack loaders and plugins |
| `eslint/` | ESLint configs, plugins, patches |
| `rigs/` | Shared build configurations (rig packages) |
| `vscode-extensions/` | VS Code extensions |
| `build-tests/` | Integration/scenario tests (non-shipping) |
| `build-tests-samples/` | Tutorial sample projects (non-shipping) |
| `common/` | Rush config, autoinstallers, temp files |

## Quick Reference

### Commands
```bash
rush install                    # Install deps (frozen lockfile)
rush build                      # Incremental build
rush test                       # Incremental build + test
rush retest                     # Full rebuild + test (CI uses this)
rush start                      # Watch mode
rush build -t <package-name>    # Build single project + its deps
rush build --to .               # Build project in current directory + deps
rush prettier                   # Format staged files (pre-commit hook)
rush change                     # Generate changelog entries for modified packages
```

### Custom Build Parameters
- `--production` -- Production build with minification
- `--fix` -- Auto-fix lint problems
- `--update-snapshots` -- Update Jest snapshots
- `--verbose` -- Detailed build output

### Build Phases
```
_phase:lite-build  →  _phase:build  →  _phase:test
(simple builds)       (TS + lint +      (Jest tests)
                       API Extractor)
```

## Build System Architecture
- **Rush**: Monorepo orchestrator (dependency graph, parallelism, build cache)
- **Heft**: Project-level build system (TypeScript, ESLint, Jest, API Extractor via plugins)
- **Rig system**: Projects inherit build config via `config/rig.json` pointing to a rig package
  - Most projects use `local-node-rig` or `decoupled-local-node-rig`
  - `decoupled-local-node-rig` is for packages that are themselves deps of the build toolchain

## Code Conventions
- TypeScript strict mode, target ES2017/ES2018, CommonJS output to `lib/`
- ESLint v9 flat config; per-project `eslint.config.js` composing profiles + mixins from rig
- Async methods must have `Async` suffix (ESLint naming convention rule)
- `export * from '...'` is forbidden (use explicit named exports)
- Tests: `src/test/*.test.ts`, run via Heft/Jest against compiled `lib/` output
- Prettier: `printWidth: 110`, `singleQuote: true`, `trailingComma: 'none'`

## Verification
```bash
rush build -t <package>         # Build the package you changed
rush test -t <package>          # Build + test the package you changed
```
The pre-commit hook runs `rush prettier` automatically on staged files.

## Progressive Disclosure
| Topic | Location |
|-------|----------|
| Rush config | `rush.json`, `common/config/rush/` |
| Build phases & commands | `common/config/rush/command-line.json` |
| Build cache | `common/config/rush/build-cache.json` |
| Version policies | `common/config/rush/version-policies.json` |
| Node rig (build pipeline) | `rigs/heft-node-rig/profiles/default/config/heft.json` |
| TypeScript base config | `rigs/heft-node-rig/profiles/default/tsconfig-base.json` |
| ESLint rules | `rigs/decoupled-local-node-rig/profiles/default/includes/eslint/flat/` |
| Jest shared config | `heft-plugins/heft-jest-plugin/includes/jest-shared.config.json` |
| API review files | `common/reviews/api/` |
| Plugin architecture | `libraries/rush-lib/src/pluginFramework/` |
| CI pipeline | `.github/workflows/ci.yml` |
| Contributor guidelines | `.github/PULL_REQUEST_TEMPLATE.md`, rushstack.io |
| Existing research | `research/docs/` |

## Universal Rules
1. Run `rush build -t <pkg> && rush test -t <pkg>` to verify changes
2. Run `rush change` when modifying published packages
3. Git email must match `*@users.noreply.github.com` (enforced by rush.json git policy)
4. Rush core packages (`@microsoft/rush`, `rush-lib`, `rush-sdk`, rush-plugins) share a lock-step version
5. API Extractor reports in `common/reviews/api/` must be updated when public APIs change
