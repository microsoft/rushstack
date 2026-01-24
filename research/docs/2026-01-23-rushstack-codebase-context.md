---
date: 2026-01-23 13:15:00 PST
researcher: Claude Opus 4.5
git_commit: 9262485db2851f0d1baf3a660ef306539209156d
branch: atomic-style-claude
repository: rushstack
topic: "RushStack Monorepo Architecture and CLAUDE.md Context"
tags: [research, codebase, rush, heft, api-extractor, monorepo, typescript]
status: complete
last_updated: 2026-01-23
last_updated_by: Claude Opus 4.5
---

# Research: RushStack Monorepo Architecture

## Research Question
Document the RushStack monorepo's architecture, key packages and their purposes, build system (Rush), testing patterns, development workflows, and coding conventions to create a comprehensive CLAUDE.md file that provides essential context for AI-assisted development across the entire codebase.

## Summary

RushStack is a large-scale TypeScript monorepo maintained by Microsoft containing 150+ projects organized in a "category folder" model. The repository provides enterprise-grade build tools including Rush (build orchestrator), Heft (pluggable build system), API Extractor (TypeScript API analysis), and numerous supporting libraries and plugins. Projects are exactly two directory levels deep, grouped by category (apps, libraries, heft-plugins, etc.).

## Detailed Findings

### Monorepo Structure

The repository enforces a strict "category folder" model via `rush.json`:
- `projectFolderMinDepth: 2`
- `projectFolderMaxDepth: 2`

All projects reside exactly two levels below the repository root.

| Directory | Purpose | Project Count |
|-----------|---------|---------------|
| `apps/` | CLI tools and applications | 13 |
| `libraries/` | Core shared libraries | 30 |
| `heft-plugins/` | Heft build system plugins | 17 |
| `rush-plugins/` | Rush orchestration plugins | 10 |
| `eslint/` | ESLint configs and plugins | 7 |
| `webpack/` | Webpack loaders and plugins | 15 |
| `rigs/` | Shared build configurations | 6 |
| `vscode-extensions/` | VS Code extensions | 5 |
| `build-tests/` | Regression test projects | 63 |
| `build-tests-samples/` | Tutorial samples | 14 |
| `build-tests-subspace/` | Subspace test projects | 5 |
| `repo-scripts/` | Internal tooling | 3 |

**Special Directories:**
- `common/config/rush/` - Rush configuration files
- `common/reviews/api/` - API review files (59 `.api.md` files)
- `common/changes/` - Rush change files for versioning

### Build System

**Versions (from `rush.json`):**
- Rush: 5.166.0
- PNPM: 10.27.0
- Node.js: 18.15+, 20.9+, 22.12+, or 24.11+

**Phased Build System:**

The monorepo uses three build phases defined in `common/config/rush/command-line.json`:

1. `_phase:lite-build` - Simple builds without CLI arguments
2. `_phase:build` - Main compilation (depends on lite-build)
3. `_phase:test` - Test execution (depends on lite-build + build)

**Rush Commands:**

| Command | Description | Incremental |
|---------|-------------|-------------|
| `rush install` | Install dependencies | N/A |
| `rush build` | Run lite-build + build phases | Yes |
| `rush test` | Run all phases including tests | Yes |
| `rush retest` | Rebuild and rerun all tests | No |
| `rush start` | Build with watch mode | Yes |

**Custom Parameters:**
- `--production` - Production build with minification
- `--fix` - Auto-fix linting problems
- `--update-snapshots` - Update Jest snapshots
- `--no-color` - Disable colors in build log

### Heft Build System

Projects use Heft for individual builds, configured via rig packages that provide shareable configurations.

**Rig Hierarchy:**

```
@rushstack/heft-node-rig (published)
    ^
decoupled-local-node-rig (private, pinned versions)
    ^
Core packages (heft, api-extractor, node-core-library, etc.)

@rushstack/heft-node-rig (published)
    ^
local-node-rig (private, workspace:*)
    ^
Most other packages

@rushstack/heft-web-rig (published)
    ^
local-web-rig (private, workspace:*)
    ^
Web applications
```

**Why `decoupled-local-node-rig` exists:**
Foundational packages (Heft itself, API Extractor, node-core-library) are dependencies of the rigs. Using `workspace:*` would create circular dependencies, so `decoupled-local-node-rig` uses pinned published versions to break the cycle.

**Key Heft Plugins:**
- `@rushstack/heft-typescript-plugin` - TypeScript compilation
- `@rushstack/heft-lint-plugin` - ESLint integration
- `@rushstack/heft-jest-plugin` - Jest test runner
- `@rushstack/heft-api-extractor-plugin` - API Extractor integration
- `@rushstack/heft-webpack5-plugin` - Webpack bundling

### Testing Patterns

**Test Execution:**
```bash
# Incremental (skips unchanged)
rush test

# Force all tests to run
rush retest

# Update Jest snapshots
rush test --update-snapshots
```

**Test File Conventions:**
- Pattern: `*.test.ts` in `src/test/` directories
- Tests run against compiled output in `lib/**/*.test.js`
- Snapshots stored in `__snapshots__/` directories

**Jest Configuration Chain:**
1. `@rushstack/heft-jest-plugin/includes/jest-shared.config.json` (base)
2. Rig-level `config/jest.config.json` (extends base)
3. Project-level `config/jest.config.json` (extends rig)

**Test Categories:**
- `build-tests/` - Regression tests for tooling
- `build-tests-samples/` - Tutorial projects that double as tests
- `build-tests-subspace/` - Tests in isolated PNPM subspace
- Integration tests use Docker (e.g., `rush-redis-cobuild-plugin-integration-test`)

### Code Quality

**ESLint Configuration:**
- Format: ESLint 9 flat config (`eslint.config.js`)
- Base package: `@rushstack/eslint-config`
- Local customization: `local-eslint-config`
- Distribution: Via rig packages

**Key ESLint Rules (from local-eslint-config):**
- `@rushstack/no-backslash-imports` - Prevents Windows path separators
- `@typescript-eslint/no-floating-promises` - Requires promise chains to terminate
- `headers/header-format` - Enforces Microsoft MIT license header
- `import/order` - Groups imports by source

**Prettier Configuration (`.prettierrc.js`):**
```javascript
{
  printWidth: 110,
  singleQuote: true,
  endOfLine: 'auto',
  trailingComma: 'none'
}
```

**API Extractor:**
- Generates `.api.md` reports in `common/reviews/api/`
- Produces `.d.ts` rollup files
- Creates `.api.json` doc models for API Documenter
- Configuration: `config/api-extractor.json` per project

### Key CLI Tools

| Tool | Package | Purpose |
|------|---------|---------|
| `rush` | `@microsoft/rush` | Monorepo build orchestration |
| `heft` | `@rushstack/heft` | Pluggable build system |
| `api-extractor` | `@microsoft/api-extractor` | TypeScript API analysis |
| `api-documenter` | `@microsoft/api-documenter` | Documentation generation |

### Key Libraries

| Library | Purpose |
|---------|---------|
| `@rushstack/node-core-library` | Shared Node.js utilities |
| `@rushstack/terminal` | Terminal output handling |
| `@rushstack/ts-command-line` | CLI argument parsing |
| `@microsoft/rush-lib` | Core Rush logic |
| `@rushstack/heft-config-file` | Configuration file loading |
| `@rushstack/rig-package` | Rig resolution |

### Version Policy

The `rush` version policy (lock-step versioning at 5.166.0) applies to:
- `@microsoft/rush`
- `@microsoft/rush-lib`
- `@rushstack/rush-sdk`
- All `rush-*-plugin` packages

### Subspaces

Subspaces are enabled for isolating certain test projects with their own `pnpm-lock.yaml`:
- Subspace: `build-tests-subspace`
- Projects: `rush-lib-test`, `rush-sdk-test`, `typescript-newest-test`, `typescript-v4-test`, `webpack-local-version-test`

## Code References

### Configuration Files
- `rush.json:19` - Rush version
- `rush.json:29` - PNPM version
- `rush.json:45` - Node.js version requirements
- `rush.json:98-99` - Project folder depth constraints
- `common/config/rush/command-line.json:14-55` - Build commands
- `common/config/rush/command-line.json:235-261` - Phase definitions
- `.prettierrc.js` - Prettier configuration

### Entry Points
- `apps/rush/src/start.ts` - Rush entry point
- `apps/heft/src/startWithVersionSelector.ts` - Heft entry point
- `apps/api-extractor/src/start.ts` - API Extractor entry point
- `apps/api-documenter/src/start.ts` - API Documenter entry point

### Rig Configurations
- `rigs/heft-node-rig/profiles/default/config/heft.json` - Node rig Heft config
- `rigs/heft-node-rig/profiles/default/tsconfig-base.json` - Node rig TypeScript config
- `rigs/decoupled-local-node-rig/package.json` - Decoupled rig with pinned versions

## Architecture Documentation

### Project Registration
All projects are registered in `rush.json` (lines 334-1591) with:
- `packageName` - NPM package name
- `projectFolder` - Path relative to repo root
- `reviewCategory` - For approved packages tracking (`libraries`, `tests`, `vscode-extensions`)
- `shouldPublish` or `versionPolicyName` - Publishing configuration
- Optional `decoupledLocalDependencies` - For breaking dependency cycles
- Optional `subspaceName` - For separate PNPM lockfile

### Build Flow
1. `rush install` - Installs all dependencies via PNPM workspaces
2. `rush build` - Orchestrates `_phase:lite-build` then `_phase:build` across projects
3. Each project runs `heft run --only build -- --clean`
4. Heft loads rig configuration and executes plugins (TypeScript, lint, API Extractor)
5. `rush test` adds `_phase:test` which runs Jest via `@rushstack/heft-jest-plugin`

### Dependency Management
- Internal dependencies use `"workspace:*"` protocol
- Decoupled dependencies use pinned versions for circular dependency breaking
- Build cache enabled locally (`common/config/rush/build-cache.json`)

## Open Questions

1. What are the conventions for adding new packages to specific categories?
2. How are package versions bumped across the lock-step version policy?
3. What is the process for updating the `decoupled-local-node-rig` pinned versions?
