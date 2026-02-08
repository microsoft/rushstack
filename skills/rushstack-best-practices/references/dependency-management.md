# Dependency Management Reference

## Package Manager Selection

### Choosing a Package Manager

Configure in `rush.json`:

```json
{
  // PNPM (Recommended)
  "pnpmVersion": "8.x.x",

  // Or NPM
  // "npmVersion": "8.x.x",

  // Or Yarn
  // "yarnVersion": "1.x.x"
}
```

**Recommendations:**
- **PNPM** - Preferred: Efficient, strict, handles large monorepos well
- **NPM** - Standard: Good compatibility, widely supported
- **Yarn** - Legacy: Supported, but consider PNPM for new projects

## Workspace Linking

### Automatic Local Linking

Rush automatically creates symlinks for local project dependencies:

**In project A package.json:**
```json
{
  "dependencies": {
    "@my-scope/project-b": "^1.0.0"
  }
}
```

Rush automatically:
1. Detects `@my-scope/project-b` is a local project
2. Creates symlink in `node_modules/@my-scope/project-b`
3. Links to the actual project folder
4. Updates during each `rush install` or `rush update`

**Benefits:**
- Live changes to dependencies immediately visible
- No need for npm link / pnpm link
- Automatic dependency resolution

### Workspace Linking Behavior

```bash
# After running
rush install

# Rush creates
apps/my-app/node_modules/@my-scope/
  ├── my-lib -> ../../libraries/my-lib
  └── other-lib -> ../../libraries/other-lib
```

## Version Management

### common-versions.json

**Purpose:** Configure NPM dependency versions affecting all projects in a subspace

**Location:** `common/config/subspaces/<subspace>/common-versions.json`

### Preferred Versions

Restrict specific package versions:

```json
{
  "preferredVersions": {
    "react": "17.0.2",
    "react-dom": "17.0.2",
    "typescript": "~4.5.0",
    "eslint": "^8.0.0"
  }
}
```

**Use Cases:**
- Force consistent versions across projects
- Prevent version drift
- Ensure compatibility

### Implicit Preferred Versions

Automatically add all dependencies to preferredVersions:

```json
{
  "implicitlyPreferredVersions": true
}
```

**Effect:**
- Every dependency used in any project becomes constrained to that version
- Prevents accidental version updates
- **Caution:** Can make dependency updates difficult

**Recommendation:** Use `false` for active development, `true` for stable maintenance

### Allowed Alternative Versions

Allow certain dependencies to use multiple different versions:

```json
{
  "preferredVersions": {
    "typescript": "~4.5.0"
  },
  "allowedAlternativeVersions": {
    "typescript": ["~4.5.0", "~4.6.0"]
  }
}
```

**Use Cases:**
- Gradual migration between major versions
- Testing new versions without full commitment
- Teams need different versions temporarily

## Adding Dependencies

### Using rush add

**Always use Rush commands**, not npm/pnpm directly:

```bash
# Navigate to project directory
cd apps/my-app

# Add dependency
rush add -p lodash

# Add dev dependency
rush add -p typescript --dev

# Add exact version
rush add -p react --exact

# Add peer dependency
rush add -p react-dom --peer

# Add multiple
rush add -p lodash -p axios -p moment
```

**Important:**
- Must run in project directory
- Rush updates both package.json and shrinkwrap
- Automatically handles workspace dependencies

###rush add Options

| Option | Description |
|--------|-------------|
| `-p, --package <name>` | Package name |
| `-D, --dev` | Add as devDependency |
| `-E, --exact` | Use exact version |
| `--peer` | Add as peerDependency |
| `--caret` | Use caret range (default for dependencies) |
| `--tilde` | Use tilde range |

## Removing Dependencies

### Using rush remove

```bash
# Navigate to project directory
cd apps/my-app

# Remove dependency
rush remove -p lodash

# Remove multiple
rush remove -p lodash -p axios
```

## Decoupled Local Dependencies

### Handling Cyclic Dependencies

When two projects depend on each other:

```json
// In apps/my-app/rush.json
{
  "projects": [
    {
      "packageName": "@my-scope/my-app",
      "projectFolder": "apps/my-app",
      "decoupledLocalDependencies": ["@my-scope/shared-lib"]
    }
  ]
}
```

**Effect:**
- Rush won't create symlink for `@my-scope/shared-lib`
- Project uses version from npm (or registry)
- Breaks cycle at build time

**When to Use:**
- Circular dependency detected
- Temporary workaround during refactoring
- Runtime dependency only (not build-time)

**Caution:** Should be used sparingly - indicates architecture issue

## Dependency Best Practices

### 1. Always Use Rush Commands

**Incorrect:**
```bash
npm install lodash
pnpm add typescript
```

**Correct:**
```bash
rush add -p lodash
rush add -p typescript
```

### 2. Use Workspace References

**Incorrect:**
```json
{
  "dependencies": {
    "my-lib": "file:../libraries/my-lib"
  }
}
```

**Correct:**
```json
{
  "dependencies": {
    "@my-scope/my-lib": "^1.0.0"
  }
}
```

### 3. Centralize Version Constraints

Use `common-versions.json` instead of duplicating in each project:

**Incorrect:**
- Every project has `"typescript": "~4.5.0"` in package.json

**Correct:**
```json
// common/config/subspaces/default/common-versions.json
{
  "preferredVersions": {
    "typescript": "~4.5.0"
  }
}
```

### 4. Careful with implicitlyPreferredVersions

**Good for:**
- Stable maintenance branches
- Released products
- Teams that want strict version control

**Bad for:**
- Active development
- Libraries
- Frequent dependency updates

## Troubleshooting Dependencies

### Dependency Conflicts

**Symptom:** Version conflicts or peer dependency warnings

**Solutions:**
```bash
# Clean slate
rush purge
rush update --recheck

# Check what depends on a package
rush-pnpm why <package>

# View dependency tree
rush-pnpm list --depth 0
```

### Workspace Linking Issues

**Symptom:** Local changes not reflected

**Solutions:**
```bash
# Reinstall to recreate links
rush install

# Check links are correct
ls -la node_modules/@my-scope/
```

### Version Drift

**Symptom:** Different projects using different versions

**Solution:**
```json
// common-versions.json
{
  "preferredVersions": {
    "problematic-package": "exact-version"
  },
  "implicitlyPreferredVersions": false  // Start with false
}
```

## Subspace Dependency Isolation

When using subspaces, each has its own:
- `pnpm-lock.yaml` - Independent lock file
- `common-versions.json` - Independent version constraints
- Dependency tree - Isolated from other subspaces

**Benefits:**
- Team A can use React 17 while Team B uses React 18
- Dependency updates in one subspace don't affect others
- Faster installs (only affected subspace updated)

**See:** `references/subspace.md` for detailed subspace configuration
