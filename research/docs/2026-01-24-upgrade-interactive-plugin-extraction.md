---
date: 2026-01-24 11:44:41 PST
researcher: Claude Code
git_commit: daada7cfa94ab0b3eaeca355706ba95f876fceb4
branch: extract-web-client
repository: rushstack
topic: "Extracting rush upgrade-interactive into a standalone auto-bundled Rush plugin"
tags: [research, codebase, upgrade-interactive, rush-plugin, extraction, cli-command]
status: complete
last_updated: 2026-01-24
last_updated_by: Claude Code
---

# Research: Extracting `rush upgrade-interactive` into a Standalone Rush Plugin

## Research Question

How can `rush upgrade-interactive` be extracted from rush-lib into a standalone Rush plugin that is automatically bundled with Rush (similar to how build cache plugins work), including: (1) the current implementation architecture, (2) existing Rush plugin patterns for autoload/bundling, (3) required changes to make the plugin self-contained, and (4) how to ensure it's available without user configuration?

## Summary

The extraction of `rush upgrade-interactive` into a standalone auto-bundled plugin is feasible using the existing Rush plugin infrastructure. Rush already bundles three build cache plugins (`rush-amazon-s3-build-cache-plugin`, `rush-azure-storage-build-cache-plugin`, `rush-http-build-cache-plugin`) using the `publishOnlyDependencies` pattern. The same mechanism can be used to bundle an upgrade-interactive plugin.

**Key findings:**

1. **Current Architecture**: The `upgrade-interactive` command spans 5 files in rush-lib with ~1,500 lines of code, plus the `npm-check-fork` library (~1,200 lines). It's tightly coupled to rush-lib internals via direct imports.

2. **Built-in Plugin Pattern**: Rush uses `publishOnlyDependencies` in package.json to declare plugins that should be bundled at publish time, avoiding circular workspace dependencies. A `plugins-prepublish.js` script converts these to regular dependencies during publishing.

3. **Plugin Loading**: The `PluginManager` auto-detects built-in plugins by scanning rush-lib's dependencies and creates `BuiltInPluginLoader` instances for each. No user configuration required.

4. **New Challenge**: Current built-in plugins don't add CLI commands - they register providers via hooks. To extract upgrade-interactive, the plugin system needs to support adding commands from built-in plugins (currently only autoinstaller plugins can add commands).

5. **Recommended Approach**: Create a new `@rushstack/rush-upgrade-interactive-plugin` package that uses `rushSession.hooks` to register itself, with the command logic exposed via a new hook or command registration API.

## Detailed Findings

### 1. Current `upgrade-interactive` Implementation Architecture

The command is implemented across multiple files in rush-lib:

#### File Structure

| File | Lines | Purpose |
|------|-------|---------|
| `libraries/rush-lib/src/cli/actions/UpgradeInteractiveAction.ts` | ~75 | CLI command action - parameter definitions and orchestration |
| `libraries/rush-lib/src/logic/InteractiveUpgrader.ts` | ~200 | Core upgrade workflow - project selection, NpmCheck invocation |
| `libraries/rush-lib/src/logic/PackageJsonUpdater.ts` | ~500 | Package.json modifications and `rush update` invocation |
| `libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts` | ~200 | Interactive UI using inquirer + cli-table |
| `libraries/rush-lib/src/utilities/prompts/SearchListPrompt.ts` | ~265 | Custom inquirer prompt for searchable selection |
| `libraries/npm-check-fork/src/` | ~1,200 | Forked npm-check library for dependency analysis |

#### Command Registration

The command is registered in `RushCommandLineParser._populateActions()` at line 346:

```typescript
// libraries/rush-lib/src/cli/RushCommandLineParser.ts:346
this.addAction(new UpgradeInteractiveAction(this));
```

#### Dependencies on rush-lib Internals

The `UpgradeInteractiveAction` uses:
- `this.rushConfiguration` - Rush configuration object
- `this.rushGlobalFolder` - Global Rush folder for caching
- `this.terminal` - Terminal output
- `this.parser.isDebug` - Debug flag

The `InteractiveUpgrader` uses:
- `RushConfiguration` - Project list, variants
- `RushConfigurationProject` - Project metadata

The `PackageJsonUpdater` uses:
- `RushConfiguration` - Multiple properties
- `DependencySpecifier` - Dependency parsing
- `VersionMismatchFinder` - Version consistency
- `InstallManagerFactory` - Running `rush update`
- Several other internal APIs

### 2. How Built-in Plugins Are Bundled (Pattern to Follow)

#### Step 1: Declare in `publishOnlyDependencies`

**File**: `libraries/rush-lib/package.json:94-98`

```json
{
  "publishOnlyDependencies": {
    "@rushstack/rush-amazon-s3-build-cache-plugin": "workspace:*",
    "@rushstack/rush-azure-storage-build-cache-plugin": "workspace:*",
    "@rushstack/rush-http-build-cache-plugin": "workspace:*"
  }
}
```

This special field:
- Is not processed by pnpm during normal `rush install`
- Avoids circular dependencies in the workspace (plugins have devDependencies on rush-lib)
- Contains workspace references during development

#### Step 2: Convert at Publish Time

**File**: `libraries/rush-lib/scripts/plugins-prepublish.js`

```javascript
const packageJson = JsonFile.load(packageJsonPath);
delete packageJson['publishOnlyDependencies'];
packageJson.dependencies['@rushstack/rush-amazon-s3-build-cache-plugin'] = packageJson.version;
packageJson.dependencies['@rushstack/rush-azure-storage-build-cache-plugin'] = packageJson.version;
packageJson.dependencies['@rushstack/rush-http-build-cache-plugin'] = packageJson.version;
JsonFile.save(packageJson, packageJsonPath, { updateExistingFile: true });
```

This script:
- Runs during the publish process
- Removes `publishOnlyDependencies` field
- Moves plugins to regular `dependencies` with matching version numbers
- Ensures plugins are bundled in the published npm package

#### Step 3: Auto-detect and Load at Runtime

**File**: `libraries/rush-lib/src/pluginFramework/PluginManager.ts:53-91`

```typescript
const ownPackageJsonDependencies: Record<string, string> = Rush._rushLibPackageJson.dependencies || {};

function tryAddBuiltInPlugin(builtInPluginName: string, pluginPackageName?: string): void {
  if (!pluginPackageName) {
    pluginPackageName = `@rushstack/${builtInPluginName}`;
  }
  if (ownPackageJsonDependencies[pluginPackageName]) {
    builtInPluginConfigurations.push({
      packageName: pluginPackageName,
      pluginName: builtInPluginName,
      pluginPackageFolder: Import.resolvePackage({
        packageName: pluginPackageName,
        baseFolderPath: __dirname
      })
    });
  }
}

tryAddBuiltInPlugin('rush-amazon-s3-build-cache-plugin');
tryAddBuiltInPlugin('rush-azure-storage-build-cache-plugin');
tryAddBuiltInPlugin('rush-http-build-cache-plugin');
```

This mechanism:
- Scans rush-lib's own dependencies at runtime
- Creates configuration objects for found plugins
- Uses `Import.resolvePackage()` to locate plugin folder
- Passes configurations to `BuiltInPluginLoader`

#### Step 4: Development Mode Support

**File**: `apps/rush/src/start-dev.ts`

```typescript
function includePlugin(pluginName: string, pluginPackageName?: string): void {
  if (!pluginPackageName) {
    pluginPackageName = `@rushstack/${pluginName}`;
  }
  builtInPluginConfigurations.push({
    packageName: pluginPackageName,
    pluginName: pluginName,
    pluginPackageFolder: Import.resolvePackage({
      packageName: pluginPackageName,
      baseFolderPath: __dirname,
      useNodeJSResolver: true
    })
  });
}

includePlugin('rush-amazon-s3-build-cache-plugin');
// ... other plugins
```

This ensures plugins work during local development without the publish conversion.

### 3. Plugin Manifest and Interface Requirements

#### Plugin Manifest File

Every Rush plugin needs a `rush-plugin-manifest.json`:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/rush/v5/rush-plugin-manifest.schema.json",
  "plugins": [
    {
      "pluginName": "rush-upgrade-interactive-plugin",
      "description": "Rush plugin providing the upgrade-interactive command",
      "entryPoint": "lib/index.js"
    }
  ]
}
```

#### IRushPlugin Interface

**File**: `libraries/rush-lib/src/pluginFramework/IRushPlugin.ts`

```typescript
export interface IRushPlugin {
  apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void;
}
```

### 4. Current Limitation: Built-in Plugins Cannot Add Commands

**Key Challenge**: The current plugin system only allows autoinstaller plugins to add CLI commands via `commandLineJsonFilePath` in their manifest. Built-in plugins can only:
- Register cloud build cache providers (`rushSession.registerCloudBuildCacheProviderFactory()`)
- Register cobuild lock providers (`rushSession.registerCobuildLockProviderFactory()`)
- Hook into lifecycle events (`rushSession.hooks.*`)

**Evidence** from `PluginManager.tryGetCustomCommandLineConfigurationInfos()`:

```typescript
// libraries/rush-lib/src/pluginFramework/PluginManager.ts:184-197
public tryGetCustomCommandLineConfigurationInfos(): ICustomCommandLineConfigurationInfo[] {
  const commandLineConfigurationInfos: ICustomCommandLineConfigurationInfo[] = [];
  // NOTE: Only iterates autoinstallerPluginLoaders, NOT builtInPluginLoaders
  for (const pluginLoader of this._autoinstallerPluginLoaders) {
    const commandLineConfiguration: CommandLineConfiguration | undefined =
      pluginLoader.getCommandLineConfiguration();
    if (commandLineConfiguration) {
      commandLineConfigurationInfos.push({
        commandLineConfiguration,
        pluginLoader
      });
    }
  }
  return commandLineConfigurationInfos;
}
```

### 5. Proposed Solution Architecture

#### Option A: Extend Plugin System for Built-in Commands (Recommended)

Modify the plugin system to allow built-in plugins to register CLI commands:

1. **Add command registration to RushSession**:
   ```typescript
   // New method on RushSession
   rushSession.registerCommand({
     actionName: 'upgrade-interactive',
     summary: 'Provides interactive prompt for upgrading package dependencies',
     documentation: '...',
     action: async (options) => { /* implementation */ }
   });
   ```

2. **Update PluginManager** to collect commands from built-in plugins
3. **Update RushCommandLineParser** to add plugin-registered commands

#### Option B: Hook-Based Command Delegation

Keep the command registration in rush-lib but delegate to the plugin:

1. **Keep `UpgradeInteractiveAction` in rush-lib** as a thin shell
2. **Add new hook** `rushSession.hooks.upgradeInteractive`
3. **Plugin taps the hook** to provide the implementation
4. **Action invokes hook** instead of internal implementation

This approach:
- Minimizes changes to the plugin system
- Keeps backward compatibility
- Allows the plugin to be optional (fallback to built-in if not present)

#### Option C: Use Existing PhasedCommand Hook Pattern

Model after `rush-serve-plugin` which hooks into phased commands:

1. **Define upgrade-interactive as a phased command** in command-line.json (shipped with rush-lib)
2. **Plugin hooks via** `rushSession.hooks.runPhasedCommand.for('upgrade-interactive')`
3. **Plugin provides the implementation** via the hook

### 6. Required Files for New Plugin Package

```
rush-plugins/rush-upgrade-interactive-plugin/
├── package.json
├── rush-plugin-manifest.json
├── config/
│   └── rig.json
├── src/
│   ├── index.ts                    # Plugin entry point
│   ├── RushUpgradeInteractivePlugin.ts  # IRushPlugin implementation
│   ├── InteractiveUpgrader.ts      # Moved from rush-lib
│   ├── InteractiveUpgradeUI.ts     # Moved from rush-lib
│   ├── prompts/
│   │   └── SearchListPrompt.ts     # Moved from rush-lib
│   └── test/
│       └── *.test.ts
└── tsconfig.json
```

#### package.json

```json
{
  "name": "@rushstack/rush-upgrade-interactive-plugin",
  "version": "5.166.0",
  "description": "Rush plugin providing the upgrade-interactive command",
  "main": "lib/index.js",
  "typings": "dist/rush-upgrade-interactive-plugin.d.ts",
  "license": "MIT",
  "dependencies": {
    "@rushstack/rush-sdk": "workspace:*",
    "@rushstack/npm-check-fork": "workspace:*",
    "@rushstack/node-core-library": "workspace:*",
    "@rushstack/terminal": "workspace:*",
    "inquirer": "~8.2.7",
    "cli-table": "~0.3.1",
    "figures": "3.0.0"
  },
  "devDependencies": {
    "@microsoft/rush-lib": "workspace:*",
    "decoupled-local-node-rig": "workspace:*"
  }
}
```

### 7. Changes Required in rush-lib

#### A. Add to publishOnlyDependencies

```json
{
  "publishOnlyDependencies": {
    "@rushstack/rush-amazon-s3-build-cache-plugin": "workspace:*",
    "@rushstack/rush-azure-storage-build-cache-plugin": "workspace:*",
    "@rushstack/rush-http-build-cache-plugin": "workspace:*",
    "@rushstack/rush-upgrade-interactive-plugin": "workspace:*"  // NEW
  }
}
```

#### B. Update plugins-prepublish.js

```javascript
packageJson.dependencies['@rushstack/rush-upgrade-interactive-plugin'] = packageJson.version;
```

#### C. Update PluginManager

```typescript
tryAddBuiltInPlugin('rush-upgrade-interactive-plugin');
```

#### D. Update start-dev.ts

```typescript
includePlugin('rush-upgrade-interactive-plugin');
```

#### E. Expose Required APIs via rush-sdk

The plugin will need access to certain rush-lib APIs. These should be exported via rush-sdk:
- `RushConfiguration`
- `RushConfigurationProject`
- `DependencySpecifier`
- `PackageJsonEditor`
- `InstallManagerFactory` or equivalent

### 8. API Exposure Considerations

Currently, plugins access rush-lib APIs through `@rushstack/rush-sdk`. The SDK re-exports rush-lib's public API. For the upgrade-interactive plugin, these APIs need to be available:

**Already Public (in rush-lib's index.ts exports):**
- `RushConfiguration`
- `RushConfigurationProject`
- `RushSession`

**Currently Internal (need exposure decision):**
- `PackageJsonUpdater` - Used to modify package.json and run `rush update`
- `VersionMismatchFinder` - Used for version consistency checks
- `DependencySpecifier` - Used for parsing dependency versions
- `InstallManagerFactory` - Used to invoke `rush update`

**Options:**
1. **Export as @beta APIs** - Make internal APIs available with stability warnings
2. **Create facade APIs** - Expose new stable APIs that wrap internal functionality
3. **Use hooks** - Plugin delegates back to rush-lib via hooks for sensitive operations

## Code References

### Current Implementation Files
- `libraries/rush-lib/src/cli/actions/UpgradeInteractiveAction.ts` - Command action
- `libraries/rush-lib/src/logic/InteractiveUpgrader.ts` - Upgrade orchestrator
- `libraries/rush-lib/src/logic/PackageJsonUpdater.ts` - Package.json modifications
- `libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts` - Interactive UI
- `libraries/rush-lib/src/utilities/prompts/SearchListPrompt.ts` - Custom prompt
- `libraries/rush-lib/src/cli/RushCommandLineParser.ts:346` - Command registration

### Plugin System Files
- `libraries/rush-lib/src/pluginFramework/PluginManager.ts:53-91` - Built-in plugin loading
- `libraries/rush-lib/src/pluginFramework/PluginLoader/BuiltInPluginLoader.ts` - Plugin loader
- `libraries/rush-lib/src/pluginFramework/IRushPlugin.ts` - Plugin interface
- `libraries/rush-lib/src/pluginFramework/RushSession.ts` - Session API for plugins
- `libraries/rush-lib/src/pluginFramework/RushLifeCycle.ts` - Lifecycle hooks

### Bundling Mechanism Files
- `libraries/rush-lib/package.json:94-98` - publishOnlyDependencies
- `libraries/rush-lib/scripts/plugins-prepublish.js` - Publish conversion script
- `apps/rush/src/start-dev.ts` - Development mode plugin loading

### Example Plugin Implementations
- `rush-plugins/rush-amazon-s3-build-cache-plugin/` - Build cache plugin example
- `rush-plugins/rush-serve-plugin/` - Plugin with phased command hooks

## Architecture Documentation

### Plugin Loading Flow

```
1. Rush CLI starts
   └── RushCommandLineParser constructor
       └── Creates PluginManager
           └── Scans rush-lib/package.json dependencies
               └── For each @rushstack/* dependency:
                   └── Check if package exists (Import.resolvePackage)
                   └── Create BuiltInPluginLoader
                       └── Read rush-plugin-manifest.json
                       └── Prepare to load on demand

2. Before command execution
   └── PluginManager.tryInitializeUnassociatedPluginsAsync()
       └── For each plugin without associatedCommands:
           └── PluginLoader.load()
               └── require(entryPoint)
               └── new PluginClass(options)
               └── plugin.apply(rushSession, rushConfiguration)
                   └── Plugin taps into hooks
                   └── Plugin registers providers
```

### Command Registration Flow (Current)

```
RushCommandLineParser._populateActions()
├── Built-in commands: new XxxAction(this) then addAction()
├── Script commands: _populateScriptActions() from command-line.json
└── Plugin commands: _addCommandLineConfigActions() from autoinstaller plugins only
```

### Proposed Command Registration Flow (With Plugin)

```
RushCommandLineParser._populateActions()
├── Built-in commands (reduced - upgrade-interactive removed)
├── Script commands from command-line.json
├── Plugin commands from autoinstaller plugins
└── [NEW] Plugin commands from built-in plugins
    └── PluginManager.tryGetBuiltInCommandLineConfigurations()
        └── Returns configurations from built-in plugin manifests
```

## Related Research

- `research/specs/2026-01-23-interactive-upgrade-ui-rewrite.md` - Spec for rewriting the UI using Ink
- `research/docs/2026-01-24-webclient-extraction-analysis.md` - Similar extraction analysis for WebClient

## Open Questions

1. **API Stability**: Which internal rush-lib APIs should be exposed via rush-sdk for the plugin? Should they be `@beta` or `@public`?

2. **Command Registration**: Should the plugin system be extended to allow built-in plugins to register commands, or should a hook-based delegation approach be used?

3. **Backward Compatibility**: Should there be a fallback if the plugin fails to load, or should the command simply not be available?

4. **UI Rewrite Timing**: Should the extraction happen before or after the Ink UI rewrite (spec in `research/specs/2026-01-23-interactive-upgrade-ui-rewrite.md`)? Doing the UI rewrite first would reduce the code to extract.

5. **npm-check-fork**: Should `npm-check-fork` remain a separate package or be bundled into the plugin? It's currently only used by upgrade-interactive.

6. **Version Coupling**: The plugin version must match rush-lib version (same as build cache plugins). Is this acceptable for upgrade-interactive?

7. **Testing Strategy**: How should the plugin be tested? Current tests are integration tests in rush-lib.
