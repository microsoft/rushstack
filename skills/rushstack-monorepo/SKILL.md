---
name: rushstack-monorepo
description: Context and operational guide for Rush monorepos. Use this skill when you need to understand or work with a Rush-based monorepo - including commands, project structure, dependency management, builds, and configuration.
license: MIT
metadata:
  author: rushstack
  version: "1.0.0"
---

# Rushstack Monorepo Guide

Context and operational guide for understanding and working with Rush monorepos. This skill provides AI agents with the knowledge needed to effectively navigate, understand, and operate within Rush-based projects.

## When to Use

Load this skill when:
- You're in a Rush monorepo and need to understand how it works
- You need to add, remove, or update dependencies
- You need to build, test, or run commands in the monorepo
- You need to modify Rush configuration
- You need to understand project structure or workspace setup
- Troubleshooting Rush-related issues
- Optimizing build performance

## Core Domains

### 1. Core Commands

Essential Rush commands and when to use them.

**Command Selection Guide:**

| Command | Purpose | Use Cases |
|---------|---------|-----------|
| `rush` | Repository-wide operations | Dependency installation, building, publishing |
| `rushx` | Single project scripts | Project-specific builds, tests, dev servers |
| `rush-pnpm` | Direct PNPM with Rush context | When direct PNPM commands are needed |

**Install vs Update:**

| Command | Behavior | When to Use |
|---------|----------|-------------|
| `rush update` | Updates shrinkwrap, installs new dependencies | After cloning, after git pull, after modifying package.json |
| `rush install` | Read-only install from existing shrinkwrap | CI/CD pipelines, ensuring version consistency |

**Build vs Rebuild:**

| Command | Behavior | When to Use |
|---------|----------|-------------|
| `rush build` | Incremental build, only changed projects | Daily development, quick validation |
| `rush rebuild` | Clean build all projects | Complete rebuild needed, investigating issues |

**Key Commands:**
- `rush add <package> -p` - Add dependency (run in project directory)
- `rush remove <package>` - Remove dependency
- `rush purge` - Clean temporary files and installation

**Project Selection Flags:**
```bash
# Build project and all dependencies
rush build --to @my-scope/my-project

# Build project and downstream dependents
rush build --from @my-scope/my-project

# Build projects affected by changes
rush build --impacted-by @my-scope/my-project

# Build only specific project (ignore dependencies)
rush build --only @my-scope/my-project
```

### 2. Project Configuration

Setting up and configuring Rush projects.

**Standard Directory Structure:**
```
/
├── common/                    # Rush common files
│   ├── config/
│   │   ├── rush/             # Rush core config
│   │   │   ├── command-line.json
│   │   │   ├── build-cache.json
│   │   │   └── subspaces.json
│   │   └── subspaces/        # Subspace configs
│   ├── scripts/              # Shared scripts
│   └── temp/                 # Temp files
├── apps/                     # Application projects (2 levels deep)
├── libraries/                # Library projects (2 levels deep)
├── tools/                    # Tool projects (2 levels deep)
└── rush.json                 # Main configuration
```

**rush.json Key Configuration:**
```json
{
  "rushVersion": "5.x.x",
  "pnpmVersion": "8.x.x",      // Or npmVersion, yarnVersion
  "projectFolderMinDepth": 2,  // Projects must be 2 levels deep
  "projectFolderMaxDepth": 2,
  "projects": [
    {
      "packageName": "@scope/project",
      "projectFolder": "libraries/project",
      "shouldPublish": true,
      "decoupledLocalDependencies": [],  // For cyclic dependencies
      "subspaceName": "subspace-name"   // Optional subspace
    }
  ]
}
```

**command-line.json Configuration:**
- **Bulk commands**: Execute separately for each project
  ```json
  {
    "commandKind": "bulk",
    "name": "build",
    "summary": "Build projects",
    "enableParallelism": true
  }
  ```
- **Global commands**: Execute once for entire repository
  ```json
  {
    "commandKind": "global",
    "name": "deploy",
    "summary": "Deploy application",
    "shellCommand": "node common/scripts/deploy.js"
  }
  ```

**Parameter Types:**
- `flag` - Boolean switches (`--production`)
- `string` - String values (`--env dev`)
- `stringList` - Multiple strings (`--tag a --tag b`)
- `choice` - Predefined options (`--locale en-us`)
- `integer` - Numbers (`--timeout 30`)
- `integerList` - Multiple numbers (`--pr 1 --pr 2`)

### 3. Dependency Management

Managing dependencies in a monorepo.

**Package Manager Selection:**
Choose in `rush.json`:
```json
{
  "pnpmVersion": "8.x.x"     // Preferred - efficient, strict
  // "npmVersion": "8.x.x"   // Alternative
  // "yarnVersion": "1.x.x"  // Alternative
}
```

**Version Constraints:**
Configure in `common/config/subspaces/<subspace>/common-versions.json`:
```json
{
  "preferredVersions": {
    "react": "17.0.2",
    "typescript": "~4.5.0"
  },
  "implicitlyPreferredVersions": true,  // Auto-add all deps
  "allowedAlternativeVersions": {
    "typescript": ["~4.5.0", "~4.6.0"]  // Allow multiple versions
  }
}
```

**Workspace Linking:**
- Local projects automatically symlink in node_modules
- Reference local projects: `"@my-scope/my-lib": "^1.0.0"`
- Rush handles linking automatically during `rush install`

**Decoupled Local Dependencies:**
Use for cyclic dependencies in `rush.json`:
```json
{
  "decoupledLocalDependencies": ["@my-scope/other-project"]
}
```

**Adding/Removing Dependencies:**
```bash
# Always use Rush commands, not npm/pnpm directly
rush add -p lodash --dev      # Add dev dependency
rush add -p react --exact     # Add exact version
rush remove -p lodash         # Remove dependency
```

### 4. Build System

Building, caching, and optimization.

**Build Selection Flags:**

| Flag | Selects | Use Case |
|------|---------|----------|
| `--to <project>` | Project + dependencies | Build with full dependency chain |
| `--to-except <project>` | Dependencies only | Pre-build dependencies |
| `--from <project>` | Project + downstream | Test impact on dependents |
| `--impacted-by <project>` | Affected projects | Quick change validation |
| `--impacted-by-except <project>` | Downstream only | Skip already-built project |
| `--only <project>` | Just the project | When deps are known good |

**Build Cache Configuration:**
Configure in `<project>/config/rush-project.json`:
```json
{
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["lib", "dist"],
      "disableBuildCacheForOperation": false,
      "dependsOnEnvVars": ["MY_ENV_VAR"]
    }
  ]
}
```

**Cache Behavior:**
- Cache stored in `common/temp/build-cache`
- Invalidated by: source changes, dependency changes, env vars, command params
- Parallel builds supported via `enableParallelism`

**Build Best Practices:**
- Use `rush build` for daily development (incremental)
- Use `rush rebuild` for clean builds
- Use selection flags to reduce build scope
- Leverage cache for faster iterations

### 5. Subspace

Advanced dependency isolation for large monorepos.

**What is Subspace:**
- Allows multiple PNPM lock files in one Rush monorepo
- Enables independent dependency management per team/project group
- Reduces risk from dependency updates
- Improves install/update performance

**When to Use:**
- Large monorepos (50+ projects)
- Multiple teams with different dependency needs
- Conflicting version requirements
- Need for faster dependency operations

**Configuration:**

1. Enable subspaces in `common/config/rush/subspaces.json`:
```json
{
  "subspacesEnabled": true,
  "subspaceNames": ["team-a", "team-b"]
}
```

2. Assign projects in `rush.json`:
```json
{
  "projects": [
    {
      "packageName": "@team-a/project",
      "subspaceName": "team-a"
    }
  ]
}
```

3. Subspace-specific config in `common/config/subspaces/<subspace-name>/`:
```
common/config/subspaces/team-a/
├── pnpm-lock.yaml           # Subspace lock file
├── common-versions.json     # Version constraints
├── pnpm-config.json         # PNPM settings
└── repo-state.json          # State hash
```

**Subspace Benefits:**
- Isolated dependency trees
- Faster installs (only affected subspaces updated)
- Team autonomy for dependency choices
- Reduced dependency conflict surface

## Troubleshooting

**Dependency Issues:**
- Avoid `npm`, `pnpm`, `yarn` - use Rush commands
- Run `rush purge` to clean environment
- Run `rush update --recheck` to force dependency check

**Build Issues:**
- Use `rush rebuild` to skip cache
- Check `rushx build` output for specific errors
- Use `--verbose` for detailed logs

**Performance Issues:**
- Use selection flags (`--to`, `--from`, etc.) to reduce scope
- Enable build cache in rush-project.json
- Consider subspace for very large monorepos

## Key Principles

1. **Always use Rush commands** - Avoid npm/pnpm/yarn directly in a Rush monorepo
2. **Use rushx for single projects** - Like npm run, but Rush-aware
3. **rush install vs update** - install for CI, update after changes
4. **rush build vs rebuild** - build for incremental, rebuild for clean
5. **Projects at 2 levels** - Standard: apps/, libraries/, tools/
6. **Selection flags reduce scope** - Use --to, --from, --impacted-by
7. **Build cache is automatic** - Configure output folders to enable
8. **Subspace for large repos** - Isolate dependencies when needed

## Detailed References

For expanded information on specific domains, see:
- `references/core-commands.md` - Detailed command reference
- `references/project-configuration.md` - Configuration file specifications
- `references/dependency-management.md` - Advanced dependency patterns
- `references/build-system.md` - Build optimization and caching
- `references/subspace.md` - Subspace setup and usage
