# Rush Stack Monorepo

## Overview
Large-scale TypeScript monorepo containing build tools for enterprise development: Rush (build orchestrator), Heft (incremental build system), API Extractor, and 150+ related packages.

## Monorepo Structure
| Path | Purpose |
|------|---------|
| `apps/` | CLI tools (rush, heft, api-extractor, api-documenter) |
| `libraries/` | Core shared libraries (node-core-library, rush-lib, etc.) |
| `heft-plugins/` | Heft build system plugins |
| `rush-plugins/` | Rush orchestration plugins |
| `eslint/` | ESLint configurations and plugins |
| `webpack/` | Webpack plugins and loaders |
| `rigs/` | Shared build configurations (heft-node-rig, etc.) |
| `build-tests/` | Test projects for validation |
| `common/config/rush/` | Rush configuration files |
| `common/reviews/api/` | API review files (version-controlled) |

## Quick Reference

### Essential Commands
```bash
# Install dependencies
rush install

# Build all projects (incremental)
rush build

# Build + run tests (incremental)
rush test

# Full rebuild + tests (clean)
rush retest

# Build specific project and its dependencies
rush build --to <project-name>

# Watch mode for development
rush start
```

### Individual Project Commands
```bash
# From within a project directory
heft build --clean          # Build single project
heft test                   # Run tests
```

### Verification (run before commits)
```bash
rush retest --verbose --production
```

## Build System
- **Rush**: Monorepo orchestrator (v5.166+)
- **Heft**: Individual project builds via `heft.json`
- **pnpm**: Package manager (managed by Rush)
- **Node.js**: 18.15+, 20.9+, 22.12+, or 24.11+

## Key Patterns
1. **Rig packages** share configs across projects (`rig.json` references `decoupled-local-node-rig`)
2. **API Extractor** tracks public APIs in `common/reviews/api/*.api.md`
3. **Phased builds**: `_phase:lite-build` -> `_phase:build` -> `_phase:test`
4. **Workspace deps**: Use `"workspace:*"` for internal package references

## Code Quality
Formatting and linting handled by automated tools:
- Prettier via `.prettierrc.js` (110 char width, single quotes)
- ESLint via flat config (`eslint.config.js` per project)

Run `rush build --fix` to auto-fix linting issues.

## Documentation
| Topic | Location |
|-------|----------|
| Rush docs | https://rushjs.io |
| Heft docs | https://heft.rushstack.io |
| API reference | https://api.rushstack.io |
| API Extractor | https://api-extractor.com |
| RFCs | `common/docs/rfcs/` |

## Universal Rules
1. Run `rush retest --verbose --production` before commits
2. API changes require updating `common/reviews/api/*.api.md`
3. Use workspace protocol for internal deps: `"@rushstack/node-core-library": "workspace:*"`
4. New packages go in appropriate category folder at depth 2 (e.g., `libraries/my-lib`)
