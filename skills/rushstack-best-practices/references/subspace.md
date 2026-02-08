# Subspace Reference

## What is Subspace?

Subspace is a Rush feature that allows multiple PNPM lock files in a single Rush monorepo.

### Benefits

**Dependency Isolation:**
- Different teams can use different dependency versions
- Team A can use React 17 while Team B uses React 18
- Reduce risk from dependency updates

**Performance:**
- Only affected subspaces update during `rush install`
- Faster dependency operations
- Smaller lock files to manage

**Team Autonomy:**
- Teams manage their own dependencies
- Less coordination needed
- Independent release cycles

### When to Use Subspace

**Consider using subspace when:**
- Repository has 50+ projects
- Multiple teams with different dependency needs
- Conflicting version requirements
- Performance issues with dependency operations
- Teams want autonomy for dependency choices

**Avoid subspace when:**
- Small monorepo (< 20 projects)
- Single team or unified dependencies
- Simplicity is preferred
- Just starting with Rush

## Subspace Configuration

### Step 1: Enable Subspaces

**File:** `common/config/rush/subspaces.json`

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/subspaces.schema.json",
  "subspacesEnabled": true,
  "subspaceNames": ["team-a", "team-b", "shared"]
}
```

**Fields:**
- `subspacesEnabled` - Enable/disable subspace feature
- `subspaceNames` - List of subspace names

### Step 2: Assign Projects to Subspaces

**File:** `rush.json`

```json
{
  "projects": [
    {
      "packageName": "@team-a/app-1",
      "projectFolder": "apps/team-a/app-1",
      "subspaceName": "team-a"
    },
    {
      "packageName": "@team-a/lib-1",
      "projectFolder": "libraries/team-a/lib-1",
      "subspaceName": "team-a"
    },
    {
      "packageName": "@team-b/app-1",
      "projectFolder": "apps/team-b/app-1",
      "subspaceName": "team-b"
    },
    {
      "packageName": "@shared/utils",
      "projectFolder": "libraries/shared/utils",
      "subspaceName": "shared"
    }
  ]
}
```

**Important:** Each project must belong to exactly one subspace

### Step 3: Subspace Configuration Files

Each subspace has its own configuration directory:

```
common/config/subspaces/
├── team-a/
│   ├── pnpm-lock.yaml          # Subspace lock file
│   ├── common-versions.json    # Version constraints
│   ├── pnpm-config.json        # PNPM settings
│   └── repo-state.json         # State hash
├── team-b/
│   ├── pnpm-lock.yaml
│   ├── common-versions.json
│   ├── pnpm-config.json
│   └── repo-state.json
└── shared/
    ├── pnpm-lock.yaml
    ├── common-versions.json
    ├── pnpm-config.json
    └── repo-state.json
```

### Subspace common-versions.json

**File:** `common/config/subspaces/<subspace>/common-versions.json`

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/common-versions.schema.json",
  "preferredVersions": {
    // Subspace-specific versions
    "react": "17.0.2",
    "typescript": "~4.5.0"
  },
  "implicitlyPreferredVersions": true,
  "allowedAlternativeVersions": {}
}
```

**Each subspace can have:**
- Different preferred versions
- Different implicit preferences
- Different allowed alternatives

## Subspace Workflows

### Initial Setup

```bash
# 1. Create subspace configuration
mkdir -p common/config/subspaces/team-a

# 2. Enable subspaces in subspaces.json
# Edit: common/config/rush/subspaces.json

# 3. Assign projects in rush.json
# Edit: rush.json - add subspaceName to projects

# 4. Run update to generate lock files
rush update
```

### Adding Projects to Subspace

```bash
# 1. Create project directory
mkdir -p apps/team-a/new-app

# 2. Add to rush.json
{
  "packageName": "@team-a/new-app",
  "projectFolder": "apps/team-a/new-app",
  "subspaceName": "team-a"
}

# 3. Run update
rush update
```

### Updating Dependencies

**Update specific subspace:**
```bash
# Only updates team-a subspace
rush update --to @team-a/app-1
```

**Update all subspaces:**
```bash
# Updates all subspaces
rush update
```

## Subspace Isolation

### Dependency Isolation

Each subspace has its own dependency tree:

**team-a subspace:**
```
team-a/app-1/
└── node_modules/
    ├── react@17.0.2
    └── typescript@4.5.0
```

**team-b subspace:**
```
team-b/app-1/
└── node_modules/
    ├── react@18.2.0
    └── typescript@5.0.0
```

### Cross-Subspace Dependencies

Projects can depend on projects in other subspaces:

```json
// team-a/app-1 depends on shared/utils
{
  "dependencies": {
    "@shared/utils": "^1.0.0"
  }
}
```

**Rush handles:**
- Workspace linking across subspaces
- Build order across subspaces
- Version compatibility

### Shared Dependencies

**Pattern:** Create a "shared" subspace for common libraries

```json
// subspaces.json
{
  "subspaceNames": ["team-a", "team-b", "shared"]
}

// rush.json
{
  "projects": [
    {
      "packageName": "@shared/utils",
      "projectFolder": "libraries/shared/utils",
      "subspaceName": "shared"
    },
    {
      "packageName": "@team-a/app",
      "projectFolder": "apps/team-a/app",
      "subspaceName": "team-a"
    }
  ]
}
```

## Subspace Best Practices

### 1. Organize by Team or Domain

**Good:**
```
subspaceNames: ["platform", "backend", "frontend", "shared"]
```

**Bad:**
```
subspaceNames: ["subspace1", "subspace2", "subspace3"]
```

### 2. Use Shared Subspace for Common Code

**Pattern:**
```
- team-a: Team A's apps and libs
- team-b: Team B's apps and libs
- shared: Common libraries used by both teams
```

### 3. Minimize Cross-Subspace Dependencies

**Good:**
```
team-a/app → team-a/lib → shared/utils
team-b/app → team-b/lib → shared/utils
```

**Avoid:**
```
team-a/app → team-b/lib  # Creates coupling
```

### 4. Keep Subspace Sizes Balanced

**Good:**
```
team-a: 20 projects
team-b: 18 projects
shared: 10 projects
```

**Bad:**
```
team-a: 2 projects
team-b: 50 projects  # Imbalanced
```

## Subspace Troubleshooting

### Lock File Conflicts

**Symptom:** Subspace lock files out of sync

**Solution:**
```bash
# Regenerate all lock files
rush update --purge
```

### Cross-Subspace Build Issues

**Symptom:** Projects build in wrong order

**Solution:**
```bash
# Verify dependency graph
rush list --json

# Force rebuild across subspaces
rush rebuild
```

### Version Conflicts Across Subspaces

**Symptom:** Different subspaces require different versions

**Solution:**
```bash
# Update specific subspace
rush update --to @team-a/app-1

# Or use allowedAlternativeVersions
```

## Subspace vs No Subspace

### No Subspace (Default)

**Structure:**
```
common/
├── config/rush/
└── temp/
pnpm-lock.yaml (single lock file)
rush.json
```

**Pros:**
- Simpler setup
- Easier to understand
- Single source of truth for versions

**Cons:**
- All projects share same dependency tree
- Dependency updates affect all projects
- Slower installs for large repos

### With Subspace

**Structure:**
```
common/
├── config/
│   ├── rush/
│   └── subspaces/
│       ├── team-a/
│       │   └── pnpm-lock.yaml
│       └── team-b/
│           └── pnpm-lock.yaml
└── temp/
rush.json
```

**Pros:**
- Independent dependency trees
- Faster installs (only affected subspaces)
- Team autonomy

**Cons:**
- More complex setup
- More files to manage
- Potential for duplication

## Migration to Subspace

### Step-by-Step Migration

1. **Plan your subspaces:**
   ```json
   {
     "subspaceNames": ["team-a", "team-b", "shared"]
   }
   ```

2. **Enable subspaces:**
   ```bash
   # Edit common/config/rush/subspaces.json
   ```

3. **Assign projects:**
   ```bash
   # Edit rush.json - add subspaceName to each project
   ```

4. **Generate lock files:**
   ```bash
   rush update
   ```

5. **Verify:**
   ```bash
   # Check lock files created
   ls common/config/subspaces/*/pnpm-lock.yaml
   ```

6. **Commit changes:**
   ```bash
   git add .
   git commit -m "Enable Rush subspaces"
   ```
