# Build System Reference

## Build vs Rebuild

### rush build (Incremental Build)

**Purpose:** Build only changed projects and dependencies

**Behavior:**
- Analyzes project dependency graph
- Builds only projects that changed
- Builds downstream dependents
- Uses build cache when available
- Supports parallel execution

**Use Cases:**
- Daily development
- Quick iteration
- Testing changes

**Examples:**
```bash
# Build all changed projects
rush build

# Build specific project and dependencies
rush build --to @my-scope/my-app

# Build project and downstream dependents
rush build --from @my-scope/my-lib

# Parallel build (default for bulk commands)
rush build --parallel
```

### rush rebuild (Clean Build)

**Purpose:** Complete clean build of all projects

**Behavior:**
- Cleans previous build artifacts
- Builds all projects (even unchanged)
- Skips build cache
- Takes longer than incremental build

**Use Cases:**
- After major dependency updates
- When investigating build issues
- Before releases
- Complete validation

**Examples:**
```bash
# Rebuild everything
rush rebuild

# Rebuild specific project and dependencies
rush rebuild --to @my-scope/my-app
```

## Build Selection Flags

### Flag Comparison

| Flag | Selects | Dependencies Built | Dependents Built | Use Case |
|------|---------|-------------------|------------------|----------|
| `--to <proj>` | Project + dependencies | Yes | No | Build with full chain |
| `--to-except <proj>` | Dependencies only | Yes | No | Pre-build dependencies |
| `--from <proj>` | Project + dependents | No | Yes | Test downstream impact |
| `--impacted-by <proj>` | Affected projects | No | Yes (only impacted) | Quick validation |
| `--impacted-by-except <proj>` | Dependents only | No | Yes (only impacted) | Skip built project |
| `--only <proj>` | Just the project | No | No | When deps are good |

### --to (Project + Dependencies)

Build project and all dependencies recursively:

```bash
rush build --to @my-scope/my-app
```

**Use When:**
- Building an application for testing
- Need complete dependency chain
- Publishing a package

**Dependency Graph Example:**
```
my-app
├── ui-lib
│   └── utils
└── api-lib
    └── utils

rush build --to my-app builds: utils, ui-lib, api-lib, my-app
```

### --to-except (Dependencies Only)

Build all dependencies, but not the project itself:

```bash
rush build --to-except @my-scope/my-app
```

**Use When:**
- Pre-building dependencies
- Project will be built separately
- Validating dependency chain

### --from (Project + Dependents)

Build project and all downstream dependents:

```bash
rush build --from @my-scope/utils
```

**Use When:**
- After library changes
- Testing impact on dependents
- Ensuring downstream compatibility

**Dependency Graph Example:**
```
utils (changed)
├── ui-lib
│   └── my-app
└── api-lib
    └── my-app

rush build --from utils builds: utils, ui-lib, api-lib, my-app
```

### --impacted-by (Affected Projects)

Build projects that might be affected by changes:

```bash
rush build --impacted-by @my-scope/utils
```

**Use When:**
- Quick change validation
- Dependencies are already built
- Faster than `--from`

**Note:** Assumes dependencies are up-to-date

### --impacted-by-except (Dependents Only)

Like `--impacted-by` but excludes the project itself:

```bash
rush build --impacted-by-except @my-scope/utils
```

**Use When:**
- Project already built
- Only need to test dependents
- Saving time

### --only (Just the Project)

Build only specified project, ignore dependency relationships:

```bash
rush build --only @my-scope/my-app
```

**Use When:**
- Dependencies known to be correct
- Combining with other flags
- Quick single-project rebuild

**Combined Example:**
```bash
# Build downstream dependents, but only rebuild utils
rush build --from utils --only utils
```

## Build Cache

### Cache Principles

Rush build cache accelerates builds by caching project outputs:

**Cache Storage:** `common/temp/build-cache/`

**Cache Key Based On:**
- Source file contents
- Dependency versions
- Environment variables
- Command line parameters
- Rush configuration

**Behavior:**
- If cache key matches → Extract cached output
- If cache key differs → Rebuild and update cache

### Cache Configuration

**File:** `<project>/config/rush-project.json`

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush-project.schema.json",
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["lib", "dist"],
      "disableBuildCacheForOperation": false,
      "dependsOnEnvVars": ["MY_ENV_VAR", "API_KEY"]
    }
  ]
}
```

**Fields:**
- `operationName` - Script name in package.json
- `outputFolderNames` - Folders to cache
- `disableBuildCacheForOperation` - Disable caching for this operation
- `dependsOnEnvVars` - Environment variables that affect build

### Environment Variables

**Caching with Environment Variables:**

```json
{
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["dist"],
      "dependsOnEnvVars": ["NODE_ENV", "API_ENDPOINT"]
    }
  ]
}
```

**Effect:**
- Cache key includes `NODE_ENV` and `API_ENDPOINT` values
- Changing these values invalidates cache
- Different values have different caches

**Use Cases:**
- Production vs development builds
- Region-specific builds
- Feature flag configurations

### Disabling Cache

**Per Operation:**
```json
{
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["dist"],
      "disableBuildCacheForOperation": true  // Disable
    }
  ]
}
```

**Per Command:**
```bash
# Rush rebuild always skips cache
rush rebuild

# Rush build uses cache (unless disabled)
rush build
```

## Parallel Execution

### Enabling Parallelism

In `command-line.json`:

```json
{
  "commandKind": "bulk",
  "name": "build",
  "summary": "Build projects",
  "enableParallelism": true
}
```

**Effect:**
- Builds independent projects simultaneously
- Respects dependency order
- Faster builds on multi-core machines

### Parallel Build Behavior

**Dependency Graph:**
```
app1 depends on lib1 and lib2
app2 depends on lib2
lib1 and lib2 are independent
```

**Parallel Build Order:**
```
Phase 1 (parallel): lib1, lib2
Phase 2 (parallel): app1, app2
```

### Limiting Parallelism

```bash
# Limit concurrent build jobs
rush build --parallelism 4
```

**Use Cases:**
- Resource-constrained machines
- Preventing memory issues
- CI environment limits

## Build Best Practices

### 1. Use Incremental Builds for Development

**Incorrect:**
```bash
# Always rebuild everything
rush rebuild
```

**Correct:**
```bash
# Incremental build for development
rush build
```

### 2. Use Selection Flags to Reduce Scope

**Incorrect:**
```bash
# Build everything when only one project changed
rush build
```

**Correct:**
```bash
# Build only affected projects
rush build --to @my-scope/changed-project
```

### 3. Configure Build Cache

**Incorrect:**
```json
// No cache configuration
// Builds are always slow
```

**Correct:**
```json
{
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["dist"],
      "disableBuildCacheForOperation": false
    }
  ]
}
```

### 4. Enable Parallelism

**Incorrect:**
```json
{
  "enableParallelism": false
}
```

**Correct:**
```json
{
  "enableParallelism": true
}
```

## Build Troubleshooting

### Cache Issues

**Symptom:** Build output seems stale

**Solutions:**
```bash
# Clear cache and rebuild
rush rebuild

# Or use purge
rush purge
rush build
```

### Dependency Build Order

**Symptom:** Projects build in wrong order

**Solutions:**
```bash
# Let Rush determine order
rush build  # Automatic dependency order

# Verify dependency graph
rush list --json
```

### Slow Builds

**Symptom:** Builds take too long

**Solutions:**
```bash
# Use selection flags
rush build --to @my-scope/target-project

# Enable parallelism
# Check command-line.json has "enableParallelism": true

# Configure cache
# Check rush-project.json has cache configured
```

## Build Scripts

### package.json Scripts

**Recommended Setup:**
```json
{
  "scripts": {
    "build": "heft build",
    "build:production": "heft build --production",
    "clean": "heft clean",
    "test": "heft test"
  }
}
```

**Corresponding rush-project.json:**
```json
{
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["lib", "dist"]
    },
    {
      "operationName": "build:production",
      "outputFolderNames": ["dist"],
      "dependsOnEnvVars": ["NODE_ENV"]
    }
  ]
}
```

**Usage:**
```bash
# Run project script directly
cd apps/my-app
rushx build

# Or via Rush bulk command
rush build
```
