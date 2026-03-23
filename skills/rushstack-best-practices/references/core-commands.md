# Core Commands Reference

## Command Tool Selection

### rush (Repository-wide Operations)

**Purpose:** Execute operations affecting the entire repository or multiple projects

**Features:**
- Strict parameter validation and documentation
- Support for global and batch commands
- Suitable for standardized workflows

**Use Cases:**
- Dependency installation (`rush install`, `rush update`)
- Building (`rush build`, `rush rebuild`)
- Publishing (`rush publish`)
- Version management (`rush change`, `rush version`)

### rushx (Single Project Scripts)

**Purpose:** Execute specific scripts for a single project

**Features:**
- Similar to `npm run` or `pnpm run`
- Uses Rush version selector for toolchain consistency
- Prepares shell environment based on Rush configuration

**Use Cases:**
- Running project-specific build scripts
- Executing tests for a single project
- Running development servers

**Example:**
```bash
cd apps/my-app
rushx build      # Equivalent to npm run build
rushx test       # Equivalent to npm run test
rushx start      # Equivalent to npm run start
```

### rush-pnpm (Direct PNPM with Rush Context)

**Purpose:** Replace direct use of pnpm in Rush repository

**Features:**
- Sets correct PNPM workspace context
- Supports Rush-specific enhancements
- Provides compatibility checks with Rush

**Use Cases:**
- When direct PNPM commands are needed
- Troubleshooting PNPM-specific issues
- PNPM operations that Rush doesn't wrap

**Example:**
```bash
rush-pnpm list         # List packages in Rush context
rush-pnpm why <pkg>    # Check why a package is included
```

## Common Commands

### rush update

**Function:** Install and update dependencies, update shrinkwrap file

**Important Parameters:**
- `-p, --purge` - Clean before installation
- `--bypass-policy` - Bypass gitPolicy rules
- `--no-link` - Don't create project symlinks
- `--network-concurrency COUNT` - Limit concurrent network requests

**Use Cases:**
- After first cloning repository
- After pulling new Git changes
- After modifying package.json
- When dependencies need updating

**Example:**
```bash
rush update                  # Standard update
rush update --purge          # Clean then update
rush update --to @my/app     # Update specific project and deps
```

### rush install

**Function:** Install dependencies based on existing shrinkwrap file (read-only)

**Features:**
- Won't modify shrinkwrap file
- Suitable for CI environment

**Important Parameters:**
- `-p, --purge` - Clean before installation
- `--bypass-policy` - Bypass gitPolicy rules
- `--no-link` - Don't create project symlinks

**Use Cases:**
- CI/CD pipelines
- Ensuring dependency version consistency
- Avoiding accidental shrinkwrap file updates

**Example:**
```bash
rush install                  # Standard install
rush install --production     # Install only production deps
```

### rush build

**Function:** Incremental project build

**Features:**
- Only builds changed projects and dependencies
- Supports parallel building
- Uses build cache when available

**Use Cases:**
- Daily development builds
- Quick change validation

**Example:**
```bash
rush build                    # Build all changed projects
rush build --to @my/app       # Build app and dependencies
rush build --from @my/lib     # Build lib and dependents
```

### rush rebuild

**Function:** Complete clean build

**Features:**
- Builds all projects
- Cleans previous build artifacts
- Skips build cache

**Use Cases:**
- When complete build cleaning is needed
- When investigating build issues

**Example:**
```bash
rush rebuild                  # Rebuild everything
rush rebuild --to @my/app     # Rebuild app and dependencies
```

### rush add

**Function:** Add dependencies to project

**Usage:** `rush add -p <package> [--dev] [--exact]`

**Important Parameters:**
- `-p, --package` - Package name
- `--dev` - Add as development dependency
- `--exact` - Use exact version (no semver range)
- `--peer` - Add as peer dependency

**Important:** Must be run in corresponding project directory

**Example:**
```bash
cd apps/my-app
rush add -p lodash --dev        # Add dev dependency
rush add -p react --exact       # Add exact version
rush add -p typescript -D       # Short for --dev
```

### rush remove

**Function:** Remove project dependencies

**Usage:** `rush remove -p <package>`

**Example:**
```bash
cd apps/my-app
rush remove -p lodash           # Remove lodash
```

### rush purge

**Function:** Clean temporary files and installation files

**Use Cases:**
- Clean build environment
- Resolve dependency issues
- Free up disk space

**Example:**
```bash
rush purge                      # Clean all temp files
```

## Project Selection Flags

### --to <PROJECT>

**Function:** Select specified project and all its dependencies

**Use Cases:**
- Build specific project and its dependencies
- Ensure complete dependency chain build

**Example:**
```bash
rush build --to @my-company/my-project
rush build --to my-project      # Omit scope if unique
rush build --to .               # Use current directory's project
```

### --to-except <PROJECT>

**Function:** Select all dependencies of specified project, but not the project itself

**Use Cases:**
- Update project dependencies without processing project itself
- Pre-build dependencies

**Example:**
```bash
rush build --to-except @my-company/my-project
```

### --from <PROJECT>

**Function:** Select specified project and all its downstream dependencies

**Use Cases:**
- Validate changes' impact on downstream projects
- Build all projects affected by specific project

**Example:**
```bash
rush build --from @my-company/my-library
```

### --impacted-by <PROJECT>

**Function:** Select projects that might be affected by specified project changes, excluding dependencies

**Use Cases:**
- Quick test of project change impacts
- Use when dependency status is already correct

**Example:**
```bash
rush build --impacted-by @my-company/my-library
```

### --impacted-by-except <PROJECT>

**Function:** Similar to `--impacted-by`, but excludes specified project itself

**Use Cases:**
- Project itself has been manually built
- Only need to test downstream impacts

**Example:**
```bash
rush build --impacted-by-except @my-company/my-library
```

### --only <PROJECT>

**Function:** Only select specified project, completely ignore dependency relationships

**Use Cases:**
- Dependency status is known to be correct
- Combine with other selection parameters

**Example:**
```bash
rush build --only @my-company/my-project
rush build --impacted-by projectA --only projectB
```
