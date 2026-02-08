---
name: rushstack-best-practices
description: Provides best practices and guidance for working with Rush monorepos. Use when the user is working in a Rush-based repository, asks about Rush commands (install, update, build, rebuild), needs help with project selection, dependency management, build caching, subspace configuration, or troubleshooting Rush-specific issues.
license: MIT
metadata:
  author: rushstack
  version: "1.0.0"
---

# Rushstack Best Practices

This skill provides essential best practices for working with Rush monorepos. Following these guidelines ensures efficient dependency management, optimal build performance, and proper command usage.

## Important Guidelines

**When encountering unclear issues or questions:**

1. **Never make assumptions** - If unsure about Rush behavior, configuration, or commands
2. **Search official resources first** - Check documentation and existing issues before guessing
3. **Provide accurate information** - Base responses on verified sources, not assumptions
4. **Ask for clarification** - When the problem description is ambiguous or incomplete

## Core Principles

1. **Always use Rush commands** - Avoid npm/pnpm/yarn directly in a Rush monorepo
2. **Use rushx for single projects** - Like npm run, but Rush-aware
3. **rush install vs update** - install for CI, update after changes
4. **rush build vs rebuild** - build for incremental, rebuild for clean
5. **Projects at 2 levels** - Standard: apps/, libraries/, tools/
6. **Selection flags reduce scope** - Use --to, --from, --impacted-by
7. **Build cache is automatic** - Configure output folders to enable
8. **Subspace for large repos** - Isolate dependencies when needed

## Project Selection Best Practices

When running commands like `install`, `update`, `build`, `rebuild`, etc., by default all projects under the entire repository are processed. Use these selection flags to improve efficiency:

### --to <PROJECT>
Select specified project and all its dependencies.
- Build specific project and its dependencies
- Ensure complete dependency chain build
```bash
rush build --to @my-company/my-project
rush build --to my-project  # If project name is unique
rush build --to .            # Use current directory's project
```

### --to-except <PROJECT>
Select all dependencies of specified project, but not the project itself.
- Update project dependencies without processing project itself
- Pre-build dependencies
```bash
rush build --to-except @my-company/my-project
```

### --from <PROJECT>
Select specified project and all its downstream dependencies.
- Validate changes' impact on downstream projects
- Build all projects affected by specific project
```bash
rush build --from @my-company/my-library
```

### --impacted-by <PROJECT>
Select projects that might be affected by specified project changes, excluding dependencies.
- Quick test of project change impacts
- Use when dependency status is already correct
```bash
rush build --impacted-by @my-company/my-library
```

### --impacted-by-except <PROJECT>
Similar to `--impacted-by`, but excludes specified project itself.
- Project itself has been manually built
- Only need to test downstream impacts
```bash
rush build --impacted-by-except @my-company/my-library
```

### --only <PROJECT>
Only select specified project, completely ignore dependency relationships.
- Dependency status is known to be correct
- Combine with other selection parameters
```bash
rush build --only @my-company/my-project
rush build --impacted-by projectA --only projectB
```

## Command Usage Guidelines

### Command Tool Selection

Choose the correct command tool based on different scenarios:

1. **`rush` command** - Execute operations affecting the entire repository or multiple projects
   - Strict parameter validation and documentation
   - Support for global and batch commands
   - Suitable for standardized workflows
   - Use cases: Dependency installation, building, publishing

2. **`rushx` command** - Execute specific scripts for a single project
   - Similar to `npm run` or `pnpm run`
   - Uses Rush version selector for toolchain consistency
   - Prepares shell environment based on Rush configuration
   - Use cases: Running project-specific build scripts, tests, dev servers

3. **`rush-pnpm` command** - Replace direct use of pnpm in Rush repository
   - Sets correct PNPM workspace context
   - Supports Rush-specific enhancements
   - Provides compatibility checks with Rush
   - Use cases: When direct PNPM commands are needed

### Install vs Update

| Command | Behavior | When to Use |
|---------|----------|-------------|
| `rush update` | Updates shrinkwrap, installs new dependencies | After cloning, after git pull, after modifying package.json |
| `rush install` | Read-only install from existing shrinkwrap | CI/CD pipelines, ensuring version consistency |

### Build vs Rebuild

| Command | Behavior | When to Use |
|---------|----------|-------------|
| `rush build` | Incremental build, only changed projects | Daily development, quick validation |
| `rush rebuild` | Clean build all projects | Complete rebuild needed, investigating issues |

## Dependency Management

### Package Manager Selection
Choose in `rush.json`:
```json
{
  "pnpmVersion": "8.x.x"     // Preferred - efficient, strict
  // "npmVersion": "8.x.x"   // Alternative
  // "yarnVersion": "1.x.x"  // Alternative
}
```

### Version Constraints
Configure in `common/config/subspaces/<subspace>/common-versions.json`:
```json
{
  "preferredVersions": {
    "react": "17.0.2",
    "typescript": "~4.5.0"
  },
  "implicitlyPreferredVersions": true,
  "allowedAlternativeVersions": {
    "typescript": ["~4.5.0", "~4.6.0"]
  }
}
```

### Adding/Removing Dependencies
Always use Rush commands, not npm/pnpm directly:
```bash
rush add -p lodash --dev      # Add dev dependency
rush add -p react --exact     # Add exact version
rush remove -p lodash         # Remove dependency
```

## Build Cache Configuration

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

## Troubleshooting

### Dependency Issues
- Avoid `npm`, `pnpm`, `yarn` - use Rush commands
- Run `rush purge` to clean environment
- Run `rush update --recheck` to force dependency check

### Build Issues
- Use `rush rebuild` to skip cache
- Check `rushx build` output for specific errors
- Use `--verbose` for detailed logs

### Performance Issues
- Use selection flags (`--to`, `--from`, etc.) to reduce scope
- Enable build cache in rush-project.json
- Consider subspace for very large monorepos

## Subspace for Large Monorepos

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

## Official Resources

### Documentation & References

**Official Websites:**
- [RushStack.io](https://rushstack.io/) - Main documentation site
- [Rush.js.io](https://rushjs.io/) - Rush build orchestrator documentation
- [Heft.rushstack.io](https://heft.rushstack.io/) - Heft build tool documentation
- [API Extractor](https://api-extractor.com/) - API documentation and rollups

**Search Existing Issues:**
- Before creating new issues, search [rush-stack-builds issues](https://github.com/microsoft/rushstack/issues)

### When to Search vs. Ask

**Search these resources first when:**
- Encountering error messages
- Unsure about configuration options
- Looking for examples or tutorials
- Need to understand Rush behavior

**Ask the user for clarification when:**
- The specific use case is unclear
- Multiple approaches are possible
- Context is missing to provide accurate guidance
- The issue might be environment-specific

## Detailed References

For expanded information on specific domains, see:
- `references/core-commands.md` - Detailed command reference
- `references/project-configuration.md` - Configuration file specifications
- `references/dependency-management.md` - Advanced dependency patterns
- `references/build-system.md` - Build optimization and caching
- `references/subspace.md` - Subspace setup and usage
