# Project Configuration Reference

## Standard Directory Structure

```
/
├── common/                          # Rush common files directory
│   ├── autoinstallers/              # Autoinstaller tool configuration
│   ├── config/                      # Configuration files directory
│   │   ├── rush/                    # Rush core configuration
│   │   │   ├── command-line.json    # Command line configuration
│   │   │   ├── build-cache.json     # Build cache configuration
│   │   │   ├── experiments.json     # Feature experiments
│   │   │   └── subspaces.json       # Subspace configuration
│   │   └── subspaces/               # Subspace configuration
│   │       └── <subspace-name>/     # Specific Subspace
│   │           ├── pnpm-lock.yaml   # Subspace dependency lock file
│   │           ├── .pnpmfile.cjs    # PNPM hook script
│   │           ├── common-versions.json  # Subspace version configuration
│   │           ├── pnpm-config.json # PNPM configuration
│   │           └── repo-state.json  # Subspace state hash value
│   ├── scripts/                     # Common scripts
│   └── temp/                        # Temporary files
├── apps/                            # Application projects
│   └── <app-name>/                  # 2 levels deep required
├── libraries/                       # Library projects
│   └── <lib-name>/                  # 2 levels deep required
├── tools/                           # Tool projects
│   └── <tool-name>/                 # 2 levels deep required
├── rush.json                        # Rush main configuration file
└── pnpm-lock.yaml                   # Root lock file (if not using subspaces)
```

**Important:** Projects must be exactly 2 levels deep (`projectFolderMinDepth: 2`, `projectFolderMaxDepth: 2`)

## rush.json

**Purpose:** Main Rush configuration file

**Location:** Repository root

### Basic Structure

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush.schema.json",
  "rushVersion": "5.x.x",

  // Package Manager Selection (choose one)
  "pnpmVersion": "8.x.x",
  // "npmVersion": "8.x.x",
  // "yarnVersion": "1.x.x",

  // Project Folder Depth
  "projectFolderMinDepth": 2,
  "projectFolderMaxDepth": 2,

  // Node.js Version Requirement
  "nodeSupportedVersionRange": ">=14.15.0",

  // Projects Array
  "projects": []
}
```

### Project Configuration

```json
{
  "projects": [
    {
      "packageName": "@my-scope/my-project",     // npm package name
      "projectFolder": "libraries/my-project",    // Path from repo root
      "shouldPublish": true,                      // Should this be published?
      "decoupledLocalDependencies": [],           // For cyclic dependencies
      "subspaceName": "my-subspace",              // Optional: subspace assignment
      "reviewCategory": "production"              // Optional: review category
    }
  ]
}
```

**Project Fields:**
- `packageName` - The npm package name (must match package.json)
- `projectFolder` - Relative path from repository root
- `shouldPublish` - Whether package should be published to npm
- `decoupledLocalDependencies` - Array of local packages to exclude from link (for cyclic deps)
- `subspaceName` - Which subspace this project belongs to
- `reviewCategory` - Category for review purposes

### Git Policy

```json
{
  "gitPolicy": {
    "allowedBranchRegExps": [
      "main",
      "release/*",
      "hotfix/*"
    ],
    "sampleEmail": "example@example.com"
  }
}
```

## command-line.json

**Purpose:** Define custom Rush commands

**Location:** `common/config/rush/command-line.json`

### Bulk Commands

Execute separately for each project:

```json
{
  "commandKind": "bulk",
  "name": "build",
  "summary": "Build all projects",
  "description": "Builds all projects in dependency order",
  "enableParallelism": true,
  "ignoreMissingScript": false,
  "safeForSimultaneousRushProcesses": false
}
```

**Bulk Command Fields:**
- `commandKind` - Must be "bulk"
- `name` - Command name
- `summary` - Short description
- `description` - Long description
- `enableParallelism` - Allow parallel execution
- `ignoreMissingScript` - Don't fail if project lacks this script
- `safeForSimultaneousRushProcesses` - Can multiple Rush instances run this?

### Global Commands

Execute once for entire repository:

```json
{
  "commandKind": "global",
  "name": "deploy",
  "summary": "Deploy application",
  "description": "Deploys the application to production",
  "shellCommand": "node common/scripts/deploy.js",
  "safeForSimultaneousRushProcesses": false
}
```

### Parameters

Six parameter types supported:

**Flag Parameter:**
```json
{
  "parameterKind": "flag",
  "longName": "--production",
  "shortName": "-p",
  "description": "Production mode",
  "required": false
}
```

**String Parameter:**
```json
{
  "parameterKind": "string",
  "longName": "--environment",
  "shortName": "-e",
  "description": "Environment name",
  "required": false,
  "defaultValue": "development"
}
```

**String List Parameter:**
```json
{
  "parameterKind": "stringList",
  "longName": "--tag",
  "description": "Tags for the build",
  "required": false
}
```

**Choice Parameter:**
```json
{
  "parameterKind": "choice",
  "longName": "--locale",
  "description": "Locale for the build",
  "alternatives": ["en-us", "zh-cn", "ja-jp"],
  "required": false,
  "defaultValue": "en-us"
}
```

**Integer Parameter:**
```json
{
  "parameterKind": "integer",
  "longName": "--timeout",
  "description": "Timeout in milliseconds",
  "required": false
}
```

**Integer List Parameter:**
```json
{
  "parameterKind": "integerList",
  "longName": "--pr",
  "description": "Pull request numbers",
  "required": false
}
```

## rush-project.json

**Purpose:** Project-specific Rush configuration

**Location:** `<project>/config/rush-project.json`

### Build Cache Configuration

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush-project.schema.json",
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["lib", "dist"],
      "disableBuildCacheForOperation": false,
      "dependsOnEnvVars": ["MY_ENVIRONMENT_VARIABLE"]
    }
  ]
}
```

**Fields:**
- `operationName` - Name of the operation (matches package.json script)
- `outputFolderNames` - Folders to cache
- `disableBuildCacheForOperation` - Disable caching for this operation
- `dependsOnEnvVars` - Environment variables that affect build

## Example Complete Configuration

### rush.json
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush.schema.json",
  "rushVersion": "5.109.0",
  "pnpmVersion": "8.15.0",
  "projectFolderMinDepth": 2,
  "projectFolderMaxDepth": 2,
  "nodeSupportedVersionRange": ">=18.17.0 <19.0.0",
  "projects": [
    {
      "packageName": "@my-scope/my-app",
      "projectFolder": "apps/my-app",
      "shouldPublish": true,
      "subspaceName": "default"
    },
    {
      "packageName": "@my-scope/my-lib",
      "projectFolder": "libraries/my-lib",
      "shouldPublish": true,
      "subspaceName": "default"
    }
  ]
}
```

### command-line.json
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/command-line.schema.json",
  "commands": [
    {
      "commandKind": "bulk",
      "name": "build",
      "summary": "Build projects",
      "enableParallelism": true
    },
    {
      "commandKind": "bulk",
      "name": "test",
      "summary": "Test projects",
      "enableParallelism": true
    },
    {
      "commandKind": "global",
      "name": "clean",
      "summary": "Clean build outputs",
      "shellCommand": "node common/scripts/clean.js"
    }
  ],
  "parameters": [
    {
      "parameterKind": "flag",
      "longName": "--production",
      "shortName": "-p",
      "description": "Production mode"
    }
  ]
}
```

### Project config/rush-project.json
```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush-project.schema.json",
  "operationSettings": [
    {
      "operationName": "build",
      "outputFolderNames": ["dist"],
      "disableBuildCacheForOperation": false
    }
  ]
}
```
