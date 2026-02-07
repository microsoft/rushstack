---
date: 2026-02-07 23:00:10 UTC
researcher: Claude Code
git_commit: d61ddd6d2652ce142803db3c73058c06415edaab
branch: feat/claude-workflow
repository: rushstack
topic: "Full architectural review and complete assessment and map of tools and build systems used"
tags: [research, codebase, architecture, rush, heft, build-system, monorepo, webpack, eslint, rigs, ci-cd]
status: complete
last_updated: 2026-02-07
last_updated_by: Claude Code
---

# Rush Stack Monorepo: Full Architectural Review

## Research Question
Full architectural review and complete assessment and map of tools and build systems used in the microsoft/rushstack monorepo.

## Summary

Rush Stack is a Microsoft-maintained monorepo containing a comprehensive ecosystem of JavaScript/TypeScript build tools. The repo is managed by **Rush v5.166.0** (the monorepo orchestrator) with **pnpm v10.27.0** as the package manager. The project-level build system is **Heft**, a pluggable build orchestrator that replaces individual tool configuration with a unified plugin-based approach. The repo contains **~130+ projects** organized into 12 top-level category directories, using a **rig system** for sharing build configurations across projects.

---

## Detailed Findings

### 1. Monorepo Directory Structure

The repo enforces a strict 2-level depth model (`rush.json:98-99`): `projectFolderMinDepth: 2, projectFolderMaxDepth: 2`. All projects live exactly 2 levels below the repo root in category folders.

| Directory | Project Count | Purpose |
|-----------|--------------|---------|
| `apps/` | 12 | Published CLI tools and applications |
| `libraries/` | 28 | Reusable libraries (core infrastructure) |
| `heft-plugins/` | 16 | Heft build system plugins |
| `rush-plugins/` | 10 | Rush monorepo orchestrator plugins |
| `webpack/` | 14 | Webpack loaders and plugins |
| `eslint/` | 7 | ESLint configs, plugins, and patches |
| `rigs/` | 6 | Shared build configurations (rig packages) |
| `vscode-extensions/` | 5 | VS Code extensions |
| `build-tests/` | 59 | Integration/scenario tests |
| `build-tests-samples/` | 14 | Tutorial sample projects |
| `build-tests-subspace/` | 4 | Tests in a separate PNPM subspace |
| `repo-scripts/` | 3 | Internal repo maintenance scripts |
| `common/` | N/A | Rush config, autoinstallers, scripts, temp files |

### 2. Key Applications (apps/)

| Package | Path | Description |
|---------|------|-------------|
| `@microsoft/rush` | `apps/rush` | Rush CLI - the monorepo management tool (v5.167.0 lockstep) |
| `@rushstack/heft` | `apps/heft` | Heft build system - pluggable project-level build orchestrator |
| `@microsoft/api-extractor` | `apps/api-extractor` | Analyzes TypeScript APIs, generates .d.ts rollups and API reports |
| `@microsoft/api-documenter` | `apps/api-documenter` | Generates documentation from API Extractor output |
| `@rushstack/lockfile-explorer` | `apps/lockfile-explorer` | Visual tool for analyzing PNPM lockfiles |
| `@rushstack/mcp-server` | `apps/rush-mcp-server` | MCP server for Rush (AI integration) |
| `@rushstack/rundown` | `apps/rundown` | Diagnostic tool for analyzing Node.js startup performance |
| `@rushstack/trace-import` | `apps/trace-import` | Diagnostic tool for tracing module resolution |
| `@rushstack/zipsync` | `apps/zipsync` | Tool for synchronizing zip archives |
| `@rushstack/cpu-profile-summarizer` | `apps/cpu-profile-summarizer` | Summarizes CPU profiles |
| `@rushstack/playwright-browser-tunnel` | `apps/playwright-browser-tunnel` | Tunnels browser connections for Playwright |

### 3. Core Libraries (libraries/)

| Package | Path | Purpose |
|---------|------|---------|
| `@microsoft/rush-lib` | `libraries/rush-lib` | Rush's public API (lockstep v5.167.0) |
| `@rushstack/rush-sdk` | `libraries/rush-sdk` | Simplified SDK for consuming Rush's API (lockstep v5.167.0) |
| `@rushstack/node-core-library` | `libraries/node-core-library` | Core Node.js utilities (filesystem, JSON, etc.) |
| `@rushstack/terminal` | `libraries/terminal` | Terminal output utilities with color support |
| `@rushstack/ts-command-line` | `libraries/ts-command-line` | Type-safe command-line parser framework |
| `@rushstack/heft-config-file` | `libraries/heft-config-file` | JSON config file loading with inheritance |
| `@rushstack/rig-package` | `libraries/rig-package` | Rig package resolution library |
| `@rushstack/operation-graph` | `libraries/operation-graph` | DAG-based operation scheduling |
| `@rushstack/package-deps-hash` | `libraries/package-deps-hash` | Git-based package change detection |
| `@rushstack/package-extractor` | `libraries/package-extractor` | Creates deployable package extractions |
| `@rushstack/stream-collator` | `libraries/stream-collator` | Collates multiple build output streams |
| `@rushstack/lookup-by-path` | `libraries/lookup-by-path` | Efficient path-based lookups |
| `@rushstack/tree-pattern` | `libraries/tree-pattern` | Pattern matching for tree structures |
| `@rushstack/module-minifier` | `libraries/module-minifier` | Module-level code minification |
| `@rushstack/worker-pool` | `libraries/worker-pool` | Worker pool management |
| `@rushstack/localization-utilities` | `libraries/localization-utilities` | Localization utilities for webpack plugins |
| `@rushstack/typings-generator` | `libraries/typings-generator` | Generates TypeScript typings from various sources |
| `@rushstack/credential-cache` | `libraries/credential-cache` | Secure credential caching |
| `@rushstack/debug-certificate-manager` | `libraries/debug-certificate-manager` | Dev SSL certificate management |
| `@microsoft/api-extractor-model` | `libraries/api-extractor-model` | Data model for API Extractor reports |
| `@rushstack/rush-pnpm-kit-v8/v9/v10` | `libraries/rush-pnpm-kit-*` | PNPM version-specific integration kits |

---

## 4. Rush: Monorepo Orchestrator

### Configuration (`rush.json`)
- **Rush version**: 5.166.0 (`rush.json:19`)
- **Package manager**: pnpm 10.27.0 (`rush.json:29`)
- **Node.js support**: `>=18.15.0 <19.0.0 || >=20.9.0 <21.0.0 || >=22.12.0 <23.0.0 || >=24.11.1 <25.0.0` (`rush.json:45`)
- **Repository URL**: `https://github.com/microsoft/rushstack.git` (`rush.json:216`)
- **Default branch**: `main` (`rush.json:222`)
- **Telemetry**: enabled (`rush.json:307`)
- **Approved packages policy**: 3 review categories: `libraries`, `tests`, `vscode-extensions` (`rush.json:134-138`)
- **Git policy**: Requires `@users.noreply.github.com` email (`rush.json:165`)

### Phased Build System (`common/config/rush/command-line.json`)
Rush uses a **phased build system** with 3 phases:

1. **`_phase:lite-build`** - Simple builds without CLI arguments, depends on upstream `lite-build` and `build` (`command-line.json:236-243`)
2. **`_phase:build`** - Main build, depends on self `lite-build` and upstream `build` (`command-line.json:244-253`)
3. **`_phase:test`** - Testing, depends on self `lite-build` and `build` (`command-line.json:254-261`)

### Custom Commands
| Command | Kind | Phases | Description |
|---------|------|--------|-------------|
| `build` | phased | lite-build, build | Standard build |
| `test` | phased | lite-build, build, test | Build + test (incremental) |
| `retest` | phased | lite-build, build, test | Build + test (non-incremental) |
| `start` | phased | lite-build, build (+ watch) | Watch mode with build + test |
| `prettier` | global | N/A | Pre-commit formatting via pretty-quick |

### Custom Parameters (`command-line.json:482-509`)
- `--no-color` - Disable colors in build log
- `--update-snapshots` - Update Jest snapshots
- `--production` - Production build with minification/localization
- `--fix` - Auto-fix lint problems

### Build Cache (`common/config/rush/build-cache.json`)
- **Enabled**: true (`build-cache.json:13`)
- **Provider**: `local-only` (`build-cache.json:20`)
- **Cache entry pattern**: `[projectName:normalize]-[phaseName:normalize]-[hash]` (`build-cache.json:35`)
- Supports Azure Blob Storage, Amazon S3, and HTTP cache backends (configured but not active)

### Subspaces (`common/config/rush/subspaces.json`)
- **Enabled**: true (`subspaces.json:12`)
- **Subspace names**: `["build-tests-subspace"]` (`subspaces.json:34`)
- Allows multiple PNPM lockfiles within a single Rush workspace

### Experiments (`common/config/rush/experiments.json`)
- `usePnpmFrozenLockfileForRushInstall`: true
- `usePnpmPreferFrozenLockfileForRushUpdate`: true
- `omitImportersFromPreventManualShrinkwrapChanges`: true
- `usePnpmSyncForInjectedDependencies`: true

### Version Policies (`common/config/rush/version-policies.json`)
- **"rush"** policy: lockStepVersion at v5.167.0, `nextBump: "minor"`, mainProject: `@microsoft/rush`
- Applied to: `@microsoft/rush`, `@microsoft/rush-lib`, `@rushstack/rush-sdk`, and all `rush-plugins/*` (except `rush-litewatch-plugin`)

### Rush Plugins (rush-plugins/)
| Plugin | Purpose |
|--------|---------|
| `rush-amazon-s3-build-cache-plugin` | S3-based remote build cache |
| `rush-azure-storage-build-cache-plugin` | Azure Blob Storage build cache |
| `rush-http-build-cache-plugin` | HTTP-based remote build cache |
| `rush-redis-cobuild-plugin` | Redis-based collaborative builds (cobuild) |
| `rush-serve-plugin` | Local dev server for Rush watch mode |
| `rush-resolver-cache-plugin` | Module resolution caching |
| `rush-bridge-cache-plugin` | Bridge between cache providers |
| `rush-buildxl-graph-plugin` | BuildXL build graph integration |
| `rush-litewatch-plugin` | Lightweight watch mode (not published) |
| `rush-mcp-docs-plugin` | MCP documentation plugin |

---

## 5. Heft: Project-Level Build Orchestrator

### Overview
Heft (`apps/heft`) is a pluggable build system designed for web projects. It provides a unified CLI that orchestrates TypeScript compilation, linting, testing, bundling, and other build tasks through a plugin architecture.

**Key source files:**
- CLI entry: `apps/heft/src/cli/HeftCommandLineParser.ts`
- Plugin interface: `apps/heft/src/pluginFramework/IHeftPlugin.ts`
- Plugin host: `apps/heft/src/pluginFramework/HeftPluginHost.ts`
- Phase management: `apps/heft/src/pluginFramework/HeftPhase.ts`
- Task management: `apps/heft/src/pluginFramework/HeftTask.ts`
- Session initialization: `apps/heft/src/pluginFramework/InternalHeftSession.ts`
- Configuration: `apps/heft/src/configuration/HeftConfiguration.ts`

### Plugin Architecture
Heft has two plugin types (`apps/heft/src/pluginFramework/IHeftPlugin.ts`):

1. **Task plugins** (`IHeftTaskPlugin`) - Provide specific build task implementations within phases
2. **Lifecycle plugins** (`IHeftLifecyclePlugin`) - Affect the overall Heft lifecycle, not tied to a specific phase

Plugins implement the `apply(session, heftConfiguration, pluginOptions?)` method and can expose an `accessor` object for inter-plugin communication via `session.requestAccessToPlugin(...)`.

### Heft Configuration (heft.json)
Heft is configured via `config/heft.json` in each project (or inherited from a rig). The config defines:
- **Phases** with tasks and their plugin references
- **Plugin options** for each task
- **Phase dependencies** (directed acyclic graph)
- **Aliases** for common action combinations

### Heft Plugins (heft-plugins/)

| Plugin | Package | Purpose |
|--------|---------|---------|
| TypeScript | `@rushstack/heft-typescript-plugin` | TypeScript compilation with multi-emit support |
| Jest | `@rushstack/heft-jest-plugin` | Jest test runner integration |
| Lint | `@rushstack/heft-lint-plugin` | ESLint/TSLint integration |
| API Extractor | `@rushstack/heft-api-extractor-plugin` | API report generation and .d.ts rollup |
| Webpack 4 | `@rushstack/heft-webpack4-plugin` | Webpack 4 bundling |
| Webpack 5 | `@rushstack/heft-webpack5-plugin` | Webpack 5 bundling |
| Rspack | `@rushstack/heft-rspack-plugin` | Rspack bundling |
| Sass | `@rushstack/heft-sass-plugin` | Sass/SCSS compilation |
| Sass Themed Styles | `@rushstack/heft-sass-load-themed-styles-plugin` | Themed styles with Sass |
| Storybook | `@rushstack/heft-storybook-plugin` | Storybook integration |
| Dev Cert | `@rushstack/heft-dev-cert-plugin` | Development SSL certificates |
| Serverless Stack | `@rushstack/heft-serverless-stack-plugin` | SST (Serverless Stack) integration |
| VS Code Extension | `@rushstack/heft-vscode-extension-plugin` | VS Code extension building |
| JSON Schema Typings | `@rushstack/heft-json-schema-typings-plugin` | Generate TS types from JSON schemas |
| Localization Typings | `@rushstack/heft-localization-typings-plugin` | Generate TS types for localization files |
| Isolated TS Transpile | `@rushstack/heft-isolated-typescript-transpile-plugin` | Isolated TypeScript transpilation (SWC-like) |

---

## 6. Rig System: Shared Build Configurations

### How Rigs Work
The rig system (`libraries/rig-package`) allows projects to inherit build configurations from a shared "rig package" instead of duplicating config files. Each rig provides profiles containing config files that projects reference via `config/rig.json`.

### Published Rigs

#### `@rushstack/heft-node-rig` (`rigs/heft-node-rig`)
- **Profile**: `default`
- **Config files provided**:
  - `config/heft.json` - Defines build, test, lint phases with TypeScript, Jest, Lint, API Extractor plugins
  - `config/typescript.json` - TypeScript compilation settings
  - `config/jest.config.json` - Jest test configuration
  - `config/api-extractor-task.json` - API Extractor settings
  - `config/rush-project.json` - Rush project settings with operation cache config
  - `tsconfig-base.json` - Base TypeScript compiler options (ES2017 target, CommonJS module, strict mode)
  - `includes/eslint/` - ESLint configuration profiles (node, node-trusted-tool) and mixins (react, packlets, tsdoc, friendly-locals)

#### `@rushstack/heft-web-rig` (`rigs/heft-web-rig`)
- **Profiles**: `app`, `library`
- **Config files**: Similar to node-rig but with web-specific settings (ES2017 target for browser, ESNext modules, webpack config, Sass config)
- **Additional files**: `webpack-base.config.js`, `config/sass.json`

#### `@rushstack/heft-vscode-extension-rig` (`rigs/heft-vscode-extension-rig`)
- **Profile**: `default`
- **Config files**: TypeScript, Jest, API Extractor, webpack config for VS Code extension bundling

### Local Rigs (not published)

| Rig | Profiles | Purpose |
|-----|----------|---------|
| `local-node-rig` | `default` | Local variant of heft-node-rig for this repo |
| `local-web-rig` | `app`, `library` | Local variant of heft-web-rig for this repo |
| `decoupled-local-node-rig` | `default` | Node rig with decoupled dependencies for breaking circular deps |

### Rig Consumption Pattern
Projects reference a rig via `config/rig.json`:
```json
{
  "rigPackageName": "@rushstack/heft-node-rig",
  "rigProfile": "default"
}
```
Then their `tsconfig.json` extends the rig's base config:
```json
{
  "extends": "./node_modules/@rushstack/heft-node-rig/profiles/default/tsconfig-base.json"
}
```

### Rig heft.json Structure (heft-node-rig default profile)
Defines 3 phases:
1. **build** - TypeScript plugin + API Extractor plugin
2. **test** - Jest plugin (depends on build)
3. **lint** - Lint plugin (depends on build)

---

## 7. Webpack Plugins (webpack/)

| Plugin | Package | Purpose |
|--------|---------|---------|
| `webpack-embedded-dependencies-plugin` | `@rushstack/webpack-embedded-dependencies-plugin` | Embeds dependencies directly into webpack bundles |
| `webpack-plugin-utilities` | `@rushstack/webpack-plugin-utilities` | Shared utilities for webpack plugins |
| `webpack4-localization-plugin` | `@rushstack/webpack4-localization-plugin` | Webpack 4 localization/internationalization |
| `webpack5-localization-plugin` | `@rushstack/webpack5-localization-plugin` | Webpack 5 localization/internationalization |
| `webpack4-module-minifier-plugin` | `@rushstack/webpack4-module-minifier-plugin` | Module-level minification for Webpack 4 |
| `webpack5-module-minifier-plugin` | `@rushstack/webpack5-module-minifier-plugin` | Module-level minification for Webpack 5 |
| `set-webpack-public-path-plugin` | `@rushstack/set-webpack-public-path-plugin` | Sets webpack public path at runtime |
| `hashed-folder-copy-plugin` | `@rushstack/hashed-folder-copy-plugin` | Copies folders with content hashing |
| `loader-load-themed-styles` | `@microsoft/loader-load-themed-styles` | Webpack 4 loader for themed CSS styles |
| `webpack5-load-themed-styles-loader` | `@microsoft/webpack5-load-themed-styles-loader` | Webpack 5 loader for themed CSS styles |
| `loader-raw-script` | `@rushstack/loader-raw-script` | Webpack loader for raw script injection |
| `preserve-dynamic-require-plugin` | `@rushstack/webpack-preserve-dynamic-require-plugin` | Preserves dynamic require() in webpack output |
| `webpack-deep-imports-plugin` | `@rushstack/webpack-deep-imports-plugin` | Controls deep import access (not published) |
| `webpack-workspace-resolve-plugin` | `@rushstack/webpack-workspace-resolve-plugin` | Resolves workspace packages in webpack |

---

## 8. ESLint Ecosystem (eslint/)

| Package | Path | Purpose |
|---------|------|---------|
| `@rushstack/eslint-config` | `eslint/eslint-config` | Shareable ESLint config with profiles (node, web-app, node-trusted-tool) and mixins (react, packlets, tsdoc, friendly-locals) |
| `@rushstack/eslint-plugin` | `eslint/eslint-plugin` | Custom ESLint rules for TypeScript projects |
| `@rushstack/eslint-plugin-packlets` | `eslint/eslint-plugin-packlets` | ESLint rules for the "packlets" pattern (lightweight alternative to npm packages for code organization within a project) |
| `@rushstack/eslint-plugin-security` | `eslint/eslint-plugin-security` | Security-focused ESLint rules |
| `@rushstack/eslint-patch` | `eslint/eslint-patch` | Patches ESLint's module resolution for monorepo compatibility |
| `@rushstack/eslint-bulk` | `eslint/eslint-bulk` | Bulk suppression management for ESLint violations |
| `local-eslint-config` | `eslint/local-eslint-config` | ESLint configuration used within this repo (not published) |

The ESLint config supports both legacy (`.eslintrc`) and flat config (`eslint.config.js`) formats, with separate directories for each in the rig profiles.

---

## 9. Testing Framework

### Test Runner: Jest (via Heft)
- Jest integration is provided through `@rushstack/heft-jest-plugin` (`heft-plugins/heft-jest-plugin`)
- The plugin provides a shared config: `heft-plugins/heft-jest-plugin/includes/jest-shared.config.json`
- Test configuration is defined in `config/jest.config.json` within each project or rig
- Tests run during `_phase:test` which depends on `_phase:build`

### Test Project Categories

#### `build-tests/` (59 projects)
Integration and scenario tests for Rush Stack tools:
- **API Extractor tests**: `api-extractor-test-01` through `-05`, `api-extractor-scenarios`, `api-extractor-lib*-test`, `api-extractor-d-cts-test`, `api-extractor-d-mts-test`
- **API Documenter tests**: `api-documenter-test`, `api-documenter-scenarios`
- **Heft tests**: `heft-node-everything-test`, `heft-webpack4/5-everything-test`, `heft-rspack-everything-test`, `heft-typescript-v2/v3/v4-test`, `heft-sass-test`, `heft-swc-test`, `heft-copy-files-test`, `heft-jest-preset-test`, etc.
- **ESLint tests**: `eslint-7-test`, `eslint-7-7-test`, `eslint-7-11-test`, `eslint-8-test`, `eslint-9-test`, `eslint-bulk-suppressions-test*`
- **Webpack tests**: `heft-webpack4-everything-test`, `heft-webpack5-everything-test`, `localization-plugin-test-01/02/03`, `set-webpack-public-path-plugin-test`
- **Rush integration tests**: `rush-amazon-s3-build-cache-plugin-integration-test`, `rush-redis-cobuild-plugin-integration-test`, `rush-package-manager-integration-test`
- **Package extractor tests**: `package-extractor-test-01` through `-04`

#### `build-tests-samples/` (14 projects)
Tutorial projects demonstrating Heft usage:
- `heft-node-basic-tutorial`, `heft-node-jest-tutorial`, `heft-node-rig-tutorial`
- `heft-webpack-basic-tutorial`, `heft-web-rig-app-tutorial`, `heft-web-rig-library-tutorial`
- `heft-storybook-v6/v9-react-tutorial*`
- `heft-serverless-stack-tutorial`
- `packlets-tutorial`

#### `build-tests-subspace/` (4 projects)
Projects in a separate PNPM subspace:
- `rush-lib-test`, `rush-sdk-test` - Test Rush API consumption
- `typescript-newest-test`, `typescript-v4-test` - Test TypeScript version compatibility

---

## 10. CI/CD and Automation

### GitHub Actions CI (`.github/workflows/ci.yml`)
The CI pipeline runs on push to `main` and on pull requests. It uses Rush's build orchestration to run builds and tests across all projects.

### GitHub Actions - Doc Tickets (`.github/workflows/file-doc-tickets.yml`)
Automated workflow for filing documentation tickets.

### Pre-commit Hook: Prettier
- **Autoinstaller**: `common/autoinstallers/rush-prettier/`
- **Tool**: `pretty-quick` (v4.2.2) with `prettier` (v3.6.2)
- **Command**: `rush prettier` runs `pretty-quick --staged`
- **Config**: `.prettierrc.js` at repo root
- Invoked as a global Rush command via Git pre-commit hook

### Git Hooks
- Located in `common/git-hooks/`
- Pre-commit hook invokes `rush prettier` for code formatting

### API Extractor Reports
API Extractor runs as part of the build phase for published packages, generating:
- `.api.md` API report files (tracked in `common/reviews/api/`)
- `.d.ts` rollup files for package consumers
- Configured per-project via `config/api-extractor.json`

---

## 11. Package Management

### PNPM Configuration
- **Version**: pnpm 10.27.0
- **Workspace protocol**: Projects reference each other via `workspace:*`
- **Subspaces**: One additional subspace (`build-tests-subspace`) for isolated dependency resolution
- **Injected dependencies**: Enabled via `usePnpmSyncForInjectedDependencies` experiment

### Decoupled Local Dependencies
Several packages declare `decoupledLocalDependencies` in `rush.json` to break circular dependency chains. The most common pattern is decoupling `@rushstack/heft` from libraries that Heft itself depends on (like `@rushstack/node-core-library`, `@rushstack/terminal`, etc.).

### Version Management
- **Lock-step versioning**: Rush core packages (`@microsoft/rush`, `@microsoft/rush-lib`, `@rushstack/rush-sdk`, and rush-plugins) share version 5.167.0
- **Individual versioning**: All other packages version independently
- **Change management**: `rush change` command generates change files in `common/changes/`

---

## 12. Development Workflow

### Standard Developer Flow
```
rush install          # Install dependencies
rush build            # Build all projects (phases: lite-build → build)
rush test             # Build + test all projects (phases: lite-build → build → test)
rush start            # Watch mode: build, then watch for changes
rush prettier         # Format staged files
```

### Build Phase Flow
```
_phase:lite-build  →  _phase:build  →  _phase:test
(simple builds)       (main build)     (Jest tests)
```

Each phase runs per-project according to the dependency graph. The `lite-build` phase handles simple builds that don't support CLI args. The `build` phase runs TypeScript compilation, linting, API Extractor, and bundling (via Heft plugins). The `test` phase runs Jest tests.

### Project Build Configuration Stack
```
Project package.json
    ↓
config/rig.json → Rig package (e.g., @rushstack/heft-node-rig)
    ↓
Rig profile (e.g., profiles/default/)
    ↓
config/heft.json → Heft plugins
    ↓
tsconfig.json → extends rig's tsconfig-base.json
    ↓
config/rush-project.json → Build cache settings
```

---

## 13. VS Code Extensions (vscode-extensions/)

| Extension | Package | Purpose |
|-----------|---------|---------|
| Rush VS Code Extension | `rushstack` | Rush integration for VS Code |
| Rush Command Webview | `@rushstack/rush-vscode-command-webview` | Webview UI for Rush commands |
| Debug Certificate Manager | `debug-certificate-manager` | Manage dev SSL certs from VS Code |
| Playwright Local Browser Server | `playwright-local-browser-server` | Local browser server for Playwright in VS Code |
| VS Code Shared | `@rushstack/vscode-shared` | Shared utilities for VS Code extensions |

---

## 14. Repo Scripts (repo-scripts/)

| Script | Purpose |
|--------|---------|
| `doc-plugin-rush-stack` | Custom API Documenter plugin for Rush Stack website |
| `generate-api-docs` | Generates API documentation |
| `repo-toolbox` | Internal repo maintenance utilities |

---

## Architecture Documentation

### Design Patterns

1. **Two-tier orchestration**: Rush orchestrates at the monorepo level (dependency graph, parallelism, caching), while Heft orchestrates at the project level (TypeScript, linting, testing, bundling).

2. **Plugin architecture**: Both Rush and Heft use plugin systems. Rush plugins extend monorepo operations (caching, serving, etc.). Heft plugins provide build task implementations (TypeScript compilation, testing, bundling).

3. **Rig system**: Eliminates config file duplication by allowing projects to inherit build configurations from shared rig packages. Projects only need a `config/rig.json` to point to a rig.

4. **Phased builds**: Rush's phased build system splits builds into discrete phases (`lite-build`, `build`, `test`) that can be independently cached and parallelized.

5. **Lock-step versioning**: Rush-related packages (rush, rush-lib, rush-sdk, rush-plugins) share a single version number and are published together.

6. **Decoupled dependencies**: Circular dependencies between Rush Stack packages are broken using `decoupledLocalDependencies`, where a package uses the last published version of a dependency instead of the local workspace version.

7. **Subspaces**: The subspace feature allows different groups of projects to have independent PNPM lockfiles, useful for testing different dependency versions.

### Interconnection Map

```
rush.json (monorepo config)
├── common/config/rush/command-line.json (phases & commands)
├── common/config/rush/build-cache.json (caching)
├── common/config/rush/subspaces.json (multi-lockfile)
├── common/config/rush/experiments.json (feature flags)
└── common/config/rush/version-policies.json (versioning)

Per-project:
├── package.json (dependencies, scripts)
├── config/rig.json → rig package
├── config/heft.json (or inherited from rig)
│   ├── Phase: build
│   │   ├── Task: typescript (heft-typescript-plugin)
│   │   ├── Task: api-extractor (heft-api-extractor-plugin)
│   │   └── Task: webpack/rspack (heft-webpack5-plugin or heft-rspack-plugin)
│   ├── Phase: test
│   │   └── Task: jest (heft-jest-plugin)
│   └── Phase: lint
│       └── Task: lint (heft-lint-plugin)
├── tsconfig.json → extends rig tsconfig-base.json
├── config/api-extractor.json (API report config)
├── config/rush-project.json (build cache config)
└── eslint.config.js or .eslintrc.js
```

---

## Code References
- `rush.json:1-1599` - Complete monorepo project inventory and Rush configuration
- `common/config/rush/command-line.json:1-511` - Phased build system definition
- `common/config/rush/build-cache.json:1-145` - Build cache configuration
- `common/config/rush/experiments.json:1-120` - Experimental features
- `common/config/rush/subspaces.json:1-35` - Multi-lockfile configuration
- `common/config/rush/version-policies.json:1-109` - Version policy definitions
- `common/config/rush/rush-plugins.json:1-29` - Rush plugin configuration (currently empty)
- `apps/heft/src/cli/HeftCommandLineParser.ts` - Heft CLI entry point
- `apps/heft/src/pluginFramework/IHeftPlugin.ts` - Heft plugin interface
- `apps/heft/src/pluginFramework/HeftPluginHost.ts` - Plugin host with access request system
- `rigs/heft-node-rig/profiles/default/config/heft.json` - Node rig Heft configuration
- `rigs/heft-node-rig/profiles/default/tsconfig-base.json` - Node rig TypeScript base config
- `rigs/heft-web-rig/profiles/app/config/heft.json` - Web rig app Heft configuration
- `.github/workflows/ci.yml` - CI pipeline configuration

## Open Questions
- Detailed CI pipeline steps and matrix configurations (requires deeper reading of ci.yml)
- Complete dependency graph visualization between all ~130 packages
- Specific autoinstaller configurations beyond rush-prettier
- Historical versioning patterns and release cadence
