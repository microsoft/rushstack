# Rush Autoinstaller and Plugin Architecture

## Overview

Rush provides a plugin system that allows extending its CLI and build pipeline through two mechanisms: **built-in plugins** (bundled as dependencies of `@microsoft/rush-lib`) and **autoinstaller-based plugins** (installed on-demand via the autoinstaller system into `common/autoinstallers/<name>/` folders). Plugins implement the `IRushPlugin` interface and interact with Rush through a hook-based lifecycle system powered by the `tapable` library. The `@rushstack/rush-sdk` package acts as a shim that gives plugins access to Rush's own instance of `@microsoft/rush-lib` at runtime.

---

## 1. The Autoinstaller System

The autoinstaller system provides a way to manage sets of NPM dependencies outside of the main `rush install` workflow. Autoinstallers live in folders under `common/autoinstallers/` and each has its own `package.json` and shrinkwrap file.

### 1.1 Core Class: `Autoinstaller`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/logic/Autoinstaller.ts`

The `Autoinstaller` class (lines 34-276) encapsulates the logic for installing and updating an autoinstaller's dependencies.

**Constructor** (lines 41-48): Takes an `IAutoinstallerOptions` object containing:
- `autoinstallerName` -- the folder name under `common/autoinstallers/`
- `rushConfiguration` -- the loaded Rush configuration
- `rushGlobalFolder` -- global Rush folder for caching
- `restrictConsoleOutput` -- whether to suppress log output

The constructor validates the autoinstaller name at line 48 via `Autoinstaller.validateName()`.

**Key properties:**
- `folderFullPath` (line 52-54): Resolves to `<rushJsonFolder>/common/autoinstallers/<name>`
- `shrinkwrapFilePath` (line 57-63): Resolves to `<folderFullPath>/<shrinkwrapFilename>` (e.g., `pnpm-lock.yaml`)
- `packageJsonPath` (line 66-68): Resolves to `<folderFullPath>/package.json`

**`prepareAsync()` method** (lines 80-171): This is the core installation logic invoked when plugins need their dependencies:
1. Verifies the autoinstaller folder exists (line 83)
2. Calls `InstallHelpers.ensureLocalPackageManagerAsync()` to ensure the package manager is available (line 89)
3. Acquires a file lock via `LockFile.acquireAsync()` at line 104 to prevent concurrent installs
4. Computes a `LastInstallFlag` at lines 117-123 that encodes the current Node version, package manager version, and `package.json` contents
5. Checks whether the flag is valid and whether a sentinel file `rush-autoinstaller.flag` exists in `node_modules/` (lines 128-129)
6. If stale or dirty: clears `node_modules`, syncs `.npmrc` from `common/config/rush/`, and runs `<packageManager> install --frozen-lockfile` (lines 132-153)
7. Creates the `last-install.flag` file and sentinel file on success (lines 156-161)
8. Releases the lock in a `finally` block (line 169)

**`updateAsync()` method** (lines 173-268): Used by `rush update-autoinstaller` to regenerate the shrinkwrap file:
1. Ensures the package manager is available (line 174)
2. Deletes the existing shrinkwrap file (line 196)
3. For PNPM, also deletes the internal shrinkwrap at `node_modules/.pnpm/lock.yaml` (lines 204-209)
4. Runs `<packageManager> install` (without `--frozen-lockfile`) to generate a fresh shrinkwrap (line 230)
5. For NPM, additionally runs `npm shrinkwrap` (lines 239-249)
6. Reports whether the shrinkwrap file changed (lines 260-267)

**`validateName()` static method** (lines 70-78): Ensures the name is a valid NPM package name without a scope.

### 1.2 CLI Actions for Autoinstallers

Three CLI actions manage autoinstallers:

**`InitAutoinstallerAction`** (`/workspaces/rushstack/libraries/rush-lib/src/cli/actions/InitAutoinstallerAction.ts`):
- Command: `rush init-autoinstaller --name <NAME>`
- Creates the autoinstaller folder with a minimal `package.json` (lines 51-56: `name`, `version: "1.0.0"`, `private: true`, empty `dependencies`)

**`InstallAutoinstallerAction`** (`/workspaces/rushstack/libraries/rush-lib/src/cli/actions/InstallAutoinstallerAction.ts`):
- Command: `rush install-autoinstaller --name <NAME>`
- Delegates to `autoinstaller.prepareAsync()` (line 18-20)

**`UpdateAutoinstallerAction`** (`/workspaces/rushstack/libraries/rush-lib/src/cli/actions/UpdateAutoinstallerAction.ts`):
- Command: `rush update-autoinstaller --name <NAME>`
- Delegates to `autoinstaller.updateAsync()` (line 18-23)
- Explicitly does NOT call `prepareAsync()` first because that uses `--frozen-lockfile`

**`BaseAutoinstallerAction`** (`/workspaces/rushstack/libraries/rush-lib/src/cli/actions/BaseAutoinstallerAction.ts`):
- Shared base class for `InstallAutoinstallerAction` and `UpdateAutoinstallerAction`
- Defines the `--name` parameter at lines 15-21
- Creates the `Autoinstaller` instance and calls the subclass `prepareAsync()` at lines 26-34

### 1.3 Autoinstallers in Custom Commands

Global custom commands defined in `command-line.json` can reference an autoinstaller via the `autoinstallerName` field.

**File:** `/workspaces/rushstack/libraries/rush-lib/src/api/CommandLineJson.ts`, line 16
```typescript
export interface IBaseCommandJson {
  autoinstallerName?: string;
  shellCommand?: string;
  // ...
}
```

**File:** `/workspaces/rushstack/libraries/rush-lib/src/schemas/command-line.schema.json`, lines 148-152
The `autoinstallerName` property is defined for global commands and specifies which autoinstaller's dependencies to install before running the shell command.

**`GlobalScriptAction`** (`/workspaces/rushstack/libraries/rush-lib/src/cli/scriptActions/GlobalScriptAction.ts`):
- At construction (lines 53-91): Validates the autoinstaller name, checks that the folder and `package.json` exist, and verifies the package name matches
- At execution in `runAsync()` (lines 106-196): If `_autoinstallerName` is set, calls `_prepareAutoinstallerNameAsync()` (lines 96-104) which creates a new `Autoinstaller` instance and calls `prepareAsync()`, then adds `<autoinstaller>/node_modules/.bin` to the PATH (lines 128-129)
- The shell command is then executed with the autoinstaller's binaries available on PATH (line 163)

---

## 2. The Plugin Loading System

### 2.1 Plugin Configuration: `rush-plugins.json`

Users configure third-party plugins in `common/config/rush/rush-plugins.json`.

**Schema:** `/workspaces/rushstack/libraries/rush-lib/src/schemas/rush-plugins.schema.json`

Each plugin entry requires three fields (lines 18-33):
- `packageName` -- the NPM package name of the plugin
- `pluginName` -- the specific plugin name within that package
- `autoinstallerName` -- the autoinstaller that provides the plugin's dependencies

**Example** (from test fixture at `/workspaces/rushstack/libraries/rush-lib/src/cli/test/pluginWithBuildCommandRepo/common/config/rush/rush-plugins.json`):
```json
{
  "plugins": [
    {
      "packageName": "rush-build-command-plugin",
      "pluginName": "rush-build-command-plugin",
      "autoinstallerName": "plugins"
    }
  ]
}
```

**Loader class:** `RushPluginsConfiguration` at `/workspaces/rushstack/libraries/rush-lib/src/api/RushPluginsConfiguration.ts`

- Constructor (lines 31-40): Loads and validates the JSON file against the schema. Defaults to `{ plugins: [] }` if the file does not exist.
- Exposes `configuration.plugins` as a readonly array of `IRushPluginConfiguration` objects.

**Interfaces** (lines 11-18):
```typescript
export interface IRushPluginConfigurationBase {
  packageName: string;
  pluginName: string;
}

export interface IRushPluginConfiguration extends IRushPluginConfigurationBase {
  autoinstallerName: string;
}
```

**Integration with `RushConfiguration`** (at `/workspaces/rushstack/libraries/rush-lib/src/api/RushConfiguration.ts`, lines 673-678):
The `RushConfiguration` constructor loads `rush-plugins.json` from `common/config/rush/rush-plugins.json` and stores it as `_rushPluginsConfiguration`.

### 2.2 Plugin Manifest: `rush-plugin-manifest.json`

Each plugin NPM package includes a `rush-plugin-manifest.json` file at its root that declares what plugins it provides.

**Schema:** `/workspaces/rushstack/libraries/rush-lib/src/schemas/rush-plugin-manifest.schema.json`

Each plugin entry in the manifest supports these fields (lines 19-46):
- `pluginName` (required) -- unique name for the plugin
- `description` (required) -- human-readable description
- `entryPoint` (optional) -- path to the JS file exporting the plugin class, relative to the package folder
- `optionsSchema` (optional) -- path to a JSON Schema file for plugin options
- `associatedCommands` (optional) -- array of command names; the plugin will only be loaded when one of these commands runs
- `commandLineJsonFilePath` (optional) -- path to a `command-line.json` file that defines custom commands contributed by this plugin

**Filename constant:** `RushConstants.rushPluginManifestFilename` = `'rush-plugin-manifest.json'` at `/workspaces/rushstack/libraries/rush-lib/src/logic/RushConstants.ts`, lines 207-208.

**TypeScript interface** at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts`, lines 23-34:
```typescript
export interface IRushPluginManifest {
  pluginName: string;
  description: string;
  entryPoint?: string;
  optionsSchema?: string;
  associatedCommands?: string[];
  commandLineJsonFilePath?: string;
}

export interface IRushPluginManifestJson {
  plugins: IRushPluginManifest[];
}
```

### 2.3 Plugin Loader Hierarchy

Three classes form the plugin loader hierarchy:

#### `PluginLoaderBase` (abstract)

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts`

This is the abstract base class (lines 42-234) that handles:

- **Manifest loading** (`_getRushPluginManifest()`, lines 200-229): Reads and validates the `rush-plugin-manifest.json` from `_getManifestPath()`, then finds the entry matching `pluginName`.
- **Plugin resolution** (`_resolvePlugin()`, lines 151-164): Joins the `packageFolder` with the manifest's `entryPoint` to get the full module path.
- **Plugin loading** (`load()`, lines 70-80): Resolves the plugin path, gets plugin options, calls `RushSdk.ensureInitialized()` (line 77), and then loads the module.
- **Module instantiation** (`_loadAndValidatePluginPackage()`, lines 123-149): Uses `require()` to load the module (line 127), handles both default and named exports (line 128), validates the plugin is not null (lines 133-135), instantiates it with options (line 139), and verifies the `apply` method exists (lines 141-146).
- **Plugin options** (`_getPluginOptions()`, lines 166-185): Loads a JSON file from `<rushPluginOptionsFolder>/<pluginName>.json` (line 187-188) and optionally validates it against the schema specified in the manifest.
- **Command-line configuration** (`getCommandLineConfiguration()`, lines 86-105): If the manifest specifies `commandLineJsonFilePath`, loads a `CommandLineConfiguration` from that path, prepends additional PATH folders, and sets the `shellCommandTokenContext` to allow `<packageFolder>` token expansion.

Abstract member: `packageFolder` (line 57) -- each subclass determines where the plugin's NPM package is located.

#### `BuiltInPluginLoader`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/BuiltInPluginLoader.ts`

A minimal subclass (lines 18-25) that sets `packageFolder` from `pluginConfiguration.pluginPackageFolder`, which is resolved at registration time via `Import.resolvePackage()`.

#### `AutoinstallerPluginLoader`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/AutoinstallerPluginLoader.ts`

This subclass (lines 33-166) adds autoinstaller integration:

- **Constructor** (lines 38-48): Creates an `Autoinstaller` instance from the `autoinstallerName` in the plugin config. Sets `packageFolder` to `<autoinstaller.folderFullPath>/node_modules/<packageName>` (line 47).
- **`update()` method** (lines 58-112): Copies the `rush-plugin-manifest.json` from the installed package into a persistent store location at `<autoinstallerFolder>/rush-plugins/<packageName>/rush-plugin-manifest.json` (lines 70-80). Also copies the `command-line.json` file if specified (lines 91-111). Both files get their POSIX permissions set to `AllRead | UserWrite` for consistent Git behavior.
- **`_getManifestPath()` override** (lines 150-156): Returns the cached manifest path at `<autoinstallerFolder>/rush-plugins/<packageName>/rush-plugin-manifest.json` instead of reading from `node_modules` directly.
- **`_getCommandLineJsonFilePath()` override** (lines 158-165): Returns the cached command-line.json path at `<autoinstallerFolder>/rush-plugins/<packageName>/<pluginName>/command-line.json`.
- **`_getPluginOptions()` override** (lines 123-148): Unlike the base class, this override throws an error if the options file is missing but the manifest specifies an `optionsSchema` (lines 132-134).
- **`_getCommandLineAdditionalPathFolders()` override** (lines 114-121): Adds both `<packageFolder>/node_modules/.bin` and `<autoinstallerFolder>/node_modules/.bin` to the PATH.

**Static method `getPluginAutoinstallerStorePath()`** (lines 54-56): Returns `<autoinstallerFolder>/rush-plugins` -- the folder where manifest and command-line files are cached.

### 2.4 RushSdk Integration

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/RushSdk.ts`

The `RushSdk` class (lines 9-23) has a single static method `ensureInitialized()` that:
1. Requires Rush's own `../../index` module (line 14)
2. Assigns it to `global.___rush___rushLibModule` (line 18)

This global variable is then read by `@rushstack/rush-sdk` at load time.

**File:** `/workspaces/rushstack/libraries/rush-sdk/src/index.ts`

The rush-sdk package resolves `@microsoft/rush-lib` through a cascading series of scenarios (lines 47-213):

1. **Scenario 1** (lines 47-53): Checks `global.___rush___rushLibModule` -- set by `RushSdk.ensureInitialized()` when Rush loads a plugin
2. **Scenario 2** (lines 57-93): Checks if the calling package has a direct dependency on `@microsoft/rush-lib` and resolves it from there (used for Jest tests)
3. **Scenario 3** (lines 97-118): Checks `process.env._RUSH_LIB_PATH` for a path to rush-lib (for child processes spawned by Rush)
4. **Scenario 4** (lines 123-203): Locates `rush.json`, reads the `rushVersion`, and tries to load rush-lib from the Rush global folder or via `install-run-rush.js`

Once resolved, the module's exports are re-exported via `Object.defineProperty()` at lines 217-228, making `rush-sdk` a transparent proxy to `rush-lib`.

**File:** `/workspaces/rushstack/libraries/rush-sdk/src/helpers.ts`

Helper functions (lines 1-72):
- `tryFindRushJsonLocation()` (lines 28-48): Walks up to 10 parent directories looking for `rush.json`
- `requireRushLibUnderFolderPath()` (lines 65-71): Uses `Import.resolveModule()` to find `@microsoft/rush-lib` under a given folder path

---

## 3. The `IRushPlugin` Interface

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/IRushPlugin.ts`

```typescript
export interface IRushPlugin {
  apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void;
}
```

This is the sole contract that all Rush plugins must implement. The `apply` method receives:
- `rushSession` -- provides access to hooks, logger, and registration APIs
- `rushConfiguration` -- the loaded Rush workspace configuration

Plugins are instantiated by `PluginLoaderBase._loadAndValidatePluginPackage()` (at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts`, line 139) with their options JSON as the constructor argument, then `apply()` is called by `PluginManager._applyPlugin()`.

---

## 4. The `RushSession` and Hook System

### 4.1 `RushSession`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/RushSession.ts`

The `RushSession` class (lines 39-104) is the primary API surface for plugins. It provides:

- **`hooks`** (line 44): An instance of `RushLifecycleHooks` -- the main hook registry
- **`getLogger(name)`** (lines 52-64): Returns an `ILogger` with a `Terminal` instance for plugin logging
- **`terminalProvider`** (lines 66-68): The terminal provider from the current Rush process
- **`registerCloudBuildCacheProviderFactory()`** (lines 70-79): Registers a factory function for cloud build cache providers, keyed by provider name (e.g., `'amazon-s3'`)
- **`getCloudBuildCacheProviderFactory()`** (lines 81-84): Retrieves a registered factory
- **`registerCobuildLockProviderFactory()`** (lines 87-97): Registers a factory for cobuild lock providers (e.g., `'redis'`)
- **`getCobuildLockProviderFactory()`** (lines 99-103): Retrieves a registered cobuild lock factory

### 4.2 `RushLifecycleHooks`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/RushLifeCycle.ts`

The `RushLifecycleHooks` class (lines 53-114) defines the following hooks using `tapable`:

| Hook | Type | Trigger | Lines |
|------|------|---------|-------|
| `initialize` | `AsyncSeriesHook<IRushCommand>` | Before executing any Rush CLI command | 57-60 |
| `runAnyGlobalCustomCommand` | `AsyncSeriesHook<IGlobalCommand>` | Before any global custom command | 65-66 |
| `runGlobalCustomCommand` | `HookMap<AsyncSeriesHook<IGlobalCommand>>` | Before a specific named global command | 71-76 |
| `runAnyPhasedCommand` | `AsyncSeriesHook<IPhasedCommand>` | Before any phased command | 81-84 |
| `runPhasedCommand` | `HookMap<AsyncSeriesHook<IPhasedCommand>>` | Before a specific named phased command | 89-91 |
| `beforeInstall` | `AsyncSeriesHook<[IGlobalCommand, Subspace, string \| undefined]>` | Between prep and package manager invocation during install/update | 96-98 |
| `afterInstall` | `AsyncSeriesHook<[IRushCommand, Subspace, string \| undefined]>` | After a successful install | 103-105 |
| `flushTelemetry` | `AsyncParallelHook<[ReadonlyArray<ITelemetryData>]>` | When telemetry data is ready to be flushed | 110-113 |

**Hook parameter interfaces** (lines 14-46):
- `IRushCommand` -- base interface with `actionName: string`
- `IGlobalCommand` -- extends `IRushCommand` (no additional fields)
- `IPhasedCommand` -- extends `IRushCommand` with `hooks: PhasedCommandHooks` and `sessionAbortController: AbortController`

### 4.3 `PhasedCommandHooks`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts`

The `PhasedCommandHooks` class (lines 146-216) provides fine-grained hooks into the operation execution pipeline:

| Hook | Type | Purpose | Lines |
|------|------|---------|-------|
| `createOperations` | `AsyncSeriesWaterfallHook<[Set<Operation>, ICreateOperationsContext]>` | Create/modify the set of operations to execute | 151-152 |
| `beforeExecuteOperations` | `AsyncSeriesHook<[Map<Operation, IOperationExecutionResult>, IExecuteOperationsContext]>` | Before operations start executing | 158-160 |
| `onOperationStatusChanged` | `SyncHook<[IOperationExecutionResult]>` | When an operation's status changes | 166 |
| `afterExecuteOperations` | `AsyncSeriesHook<[IExecutionResult, IExecuteOperationsContext]>` | After all operations complete | 173-174 |
| `beforeExecuteOperation` | `AsyncSeriesBailHook<[IOperationRunnerContext & IOperationExecutionResult], OperationStatus \| undefined>` | Before a single operation executes (can bail) | 179-182 |
| `createEnvironmentForOperation` | `SyncWaterfallHook<[IEnvironment, IOperationRunnerContext & IOperationExecutionResult]>` | Define environment variables for an operation | 188-190 |
| `afterExecuteOperation` | `AsyncSeriesHook<[IOperationRunnerContext & IOperationExecutionResult]>` | After a single operation completes | 195-197 |
| `shutdownAsync` | `AsyncParallelHook<void>` | Shutdown long-lived plugin work | 202 |
| `waitingForChanges` | `SyncHook<void>` | After a run finishes in watch mode | 209 |
| `beforeLog` | `SyncHook<ITelemetryData, void>` | Before writing a telemetry log entry | 215 |

The `ICreateOperationsContext` interface (lines 47-123) provides plugins with extensive context including build cache configuration, cobuild configuration, custom parameters, project selection, phase selection, and parallelism settings.

### 4.4 Logger

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/logging/Logger.ts`

The `ILogger` interface (lines 9-21) provides:
- `terminal: Terminal` -- for writing output
- `emitError(error: Error)` -- records and prints an error
- `emitWarning(warning: Error)` -- records and prints a warning

The `Logger` class (lines 29-78) implements this with stack trace printing controlled by Rush's debug mode.

---

## 5. The `PluginManager`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginManager.ts`

The `PluginManager` class (lines 31-237) orchestrates the entire plugin loading lifecycle.

### 5.1 Construction (lines 44-111)

The constructor:
1. Receives `IPluginManagerOptions` containing terminal, configuration, session, built-in plugin configs, and global folder
2. **Registers built-in plugins** (lines 64-98):
   - Calls `tryAddBuiltInPlugin()` for each built-in plugin name
   - The function checks if the plugin package exists in `rush-lib`'s own `dependencies` field (line 69)
   - If found, resolves the package folder via `Import.resolvePackage()` and adds it to `builtInPluginConfigurations`
   - Creates `BuiltInPluginLoader` instances for each (lines 92-98)
3. **Registers autoinstaller plugins** (lines 100-110):
   - Reads `_rushPluginsConfiguration.configuration.plugins` from `rush-plugins.json`
   - Creates `AutoinstallerPluginLoader` instances for each

### 5.2 Plugin Initialization Flow

The plugin lifecycle has two phases based on `associatedCommands`:

**`tryInitializeUnassociatedPluginsAsync()`** (lines 152-165):
- Filters both built-in and autoinstaller loaders to those WITHOUT `associatedCommands` in their manifest
- Prepares autoinstallers (installs their dependencies)
- Calls `_initializePlugins()` with all unassociated loaders
- Catches and saves any error to `this._error`

**`tryInitializeAssociatedCommandPluginsAsync(commandName)`** (lines 167-182):
- Filters both built-in and autoinstaller loaders to those whose `associatedCommands` includes `commandName`
- Prepares autoinstallers and initializes matching plugins
- Catches and saves any error to `this._error`

**`_initializePlugins(pluginLoaders)`** (lines 199-211):
- Iterates over loaders
- Checks for duplicate plugin names (line 203)
- Calls `pluginLoader.load()` to get an `IRushPlugin` instance (line 205)
- Calls `_applyPlugin()` to invoke `plugin.apply(rushSession, rushConfiguration)` (line 208)

**`_applyPlugin(plugin, pluginName)`** (lines 230-236):
- Calls `plugin.apply(this._rushSession, this._rushConfiguration)` wrapped in a try/catch

**`_preparePluginAutoinstallersAsync(pluginLoaders)`** (lines 143-150):
- For each loader, calls `autoinstaller.prepareAsync()` if that autoinstaller has not been prepared yet
- Tracks prepared autoinstaller names in `_installedAutoinstallerNames` to avoid re-installing

### 5.3 Command-Line Configuration from Plugins

**`tryGetCustomCommandLineConfigurationInfos()`** (lines 184-197):
- Iterates over autoinstaller plugin loaders
- Calls `pluginLoader.getCommandLineConfiguration()` for each
- Returns an array of `{ commandLineConfiguration, pluginLoader }` objects
- This is called during `RushCommandLineParser` construction to register plugin-provided commands

### 5.4 Update Flow

**`updateAsync()`** (lines 122-135):
- Prepares all autoinstallers
- Clears the `rush-plugins` store folder for each autoinstaller (line 128)
- Calls `pluginLoader.update()` on each autoinstaller plugin loader, which copies the manifest and command-line files into the store

### 5.5 Error Handling

The `error` property (lines 118-120) stores the first error encountered during plugin loading. This error is deferred and only thrown later by `BaseRushAction._throwPluginErrorIfNeed()` (at `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/BaseRushAction.ts`, lines 148-166), which exempts certain commands (`update`, `init-autoinstaller`, `update-autoinstaller`, `setup`) that are used to fix plugin problems.

---

## 6. How Plugins Register Commands with the Rush CLI

### 6.1 `RushCommandLineParser`

**File:** `/workspaces/rushstack/libraries/rush-lib/src/cli/RushCommandLineParser.ts`

The `RushCommandLineParser` class (lines 76-537) extends `CommandLineParser` from `@rushstack/ts-command-line`.

**Constructor flow** (lines 98-194):
1. Loads `RushConfiguration` from `rush.json` (lines 134-143)
2. Creates a `RushSession` (lines 156-159) and `PluginManager` (lines 160-167)
3. **Gets plugin command-line configurations** (lines 169-170):
   ```typescript
   const pluginCommandLineConfigurations = this.pluginManager.tryGetCustomCommandLineConfigurationInfos();
   ```
   This reads the cached `command-line.json` files from each autoinstaller plugin's store folder.
4. Checks if any plugin defines a `build` command (lines 172-177). If so, sets `_autocreateBuildCommand = false` to suppress the default `build` command.
5. Calls `_populateActions()` (line 179) to register all built-in actions
6. Iterates over `pluginCommandLineConfigurations` and calls `_addCommandLineConfigActions()` for each (lines 181-193)

**`_populateActions()`** (lines 324-358): Registers all built-in Rush CLI actions alphabetically (lines 327-352), then calls `_populateScriptActions()`.

**`_populateScriptActions()`** (lines 360-379): Loads the user's `command-line.json` from `common/config/rush/command-line.json`. If a plugin already defined a `build` command, passes `doNotIncludeDefaultBuildCommands = true` to suppress the default.

**`_addCommandLineConfigActions()`** (lines 381-386): Iterates over all commands in a `CommandLineConfiguration` and registers each.

**`_addCommandLineConfigAction()`** (lines 388-416): Routes commands by `commandKind`:
- `'global'` -> creates a `GlobalScriptAction`
- `'phased'` -> creates a `PhasedScriptAction`

**`executeAsync()`** (lines 230-240): Before executing the selected action:
1. Calls `pluginManager.tryInitializeUnassociatedPluginsAsync()` (line 236) to load plugins that are not command-specific

**Action execution** (at `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/BaseRushAction.ts`, lines 120-142):
The `BaseRushAction.onExecuteAsync()` method:
1. Calls `pluginManager.tryInitializeAssociatedCommandPluginsAsync(this.actionName)` (line 128) to load command-specific plugins
2. Fires the `initialize` hook if tapped (lines 133-138)
3. Then delegates to the parent class

### 6.2 Plugin-Provided Commands

Plugins can contribute new CLI commands by:
1. Including a `commandLineJsonFilePath` in their `rush-plugin-manifest.json`
2. That file follows the same format as `command-line.json` (commands, phases, parameters)
3. During `rush update`, the `AutoinstallerPluginLoader.update()` method copies this file into the store at `<autoinstallerFolder>/rush-plugins/<packageName>/<pluginName>/command-line.json`
4. At parse time, `RushCommandLineParser` reads these cached files via `pluginManager.tryGetCustomCommandLineConfigurationInfos()`
5. Shell commands from plugin-provided command-line configs get a `<packageFolder>` token that expands to the plugin's installed location (at `PluginLoaderBase.getCommandLineConfiguration()`, line 102)

---

## 7. Built-In Plugins

Built-in plugins are registered in the `PluginManager` constructor at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginManager.ts`, lines 81-90.

The `tryAddBuiltInPlugin()` function (lines 65-79) checks if the plugin package exists in `rush-lib`'s own `package.json` dependencies before registering it.

### 7.1 Currently Registered Built-In Plugins

| Plugin Name | Package | Line |
|-------------|---------|------|
| `rush-amazon-s3-build-cache-plugin` | `@rushstack/rush-amazon-s3-build-cache-plugin` | 81 |
| `rush-azure-storage-build-cache-plugin` | `@rushstack/rush-azure-storage-build-cache-plugin` | 82 |
| `rush-http-build-cache-plugin` | `@rushstack/rush-http-build-cache-plugin` | 83 |
| `rush-azure-interactive-auth-plugin` | `@rushstack/rush-azure-storage-build-cache-plugin` (secondary plugin) | 87-90 |

Note: The azure interactive auth plugin is a secondary plugin inside the azure storage package. The comment at lines 84-86 explains: "This is a secondary plugin inside the `@rushstack/rush-azure-storage-build-cache-plugin` package. Because that package comes with Rush (for now), it needs to get registered here."

---

## 8. All Rush Plugins in the Repository

The `rush-plugins/` directory contains the following plugin packages, each implementing `IRushPlugin`:

| Package | Plugin Class | File | Manifest |
|---------|-------------|------|----------|
| `rush-amazon-s3-build-cache-plugin` | `RushAmazonS3BuildCachePlugin` | `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/src/RushAmazonS3BuildCachePlugin.ts:46` | Registers `'amazon-s3'` cloud build cache provider factory |
| `rush-azure-storage-build-cache-plugin` | `RushAzureStorageBuildCachePlugin` | `/workspaces/rushstack/rush-plugins/rush-azure-storage-build-cache-plugin/src/RushAzureStorageBuildCachePlugin.ts:59` | Registers azure storage build cache provider |
| `rush-azure-storage-build-cache-plugin` (secondary) | `RushAzureInteractieAuthPlugin` | `/workspaces/rushstack/rush-plugins/rush-azure-storage-build-cache-plugin/src/RushAzureInteractiveAuthPlugin.ts:62` | Interactive Azure authentication |
| `rush-http-build-cache-plugin` | `RushHttpBuildCachePlugin` | `/workspaces/rushstack/rush-plugins/rush-http-build-cache-plugin/src/RushHttpBuildCachePlugin.ts:52` | Registers generic HTTP build cache provider |
| `rush-redis-cobuild-plugin` | `RushRedisCobuildPlugin` | `/workspaces/rushstack/rush-plugins/rush-redis-cobuild-plugin/src/RushRedisCobuildPlugin.ts:24` | Registers `'redis'` cobuild lock provider factory |
| `rush-buildxl-graph-plugin` | `DropBuildGraphPlugin` | `/workspaces/rushstack/rush-plugins/rush-buildxl-graph-plugin/src/DropBuildGraphPlugin.ts:46` | Taps `runPhasedCommand` to intercept `createOperations` and drop a build graph file |
| `rush-bridge-cache-plugin` | `BridgeCachePlugin` | `/workspaces/rushstack/rush-plugins/rush-bridge-cache-plugin/src/BridgeCachePlugin.ts:31` | Adds cache bridge functionality |
| `rush-serve-plugin` | `RushServePlugin` | `/workspaces/rushstack/rush-plugins/rush-serve-plugin/src/RushServePlugin.ts:54` | Serves built files from localhost |
| `rush-resolver-cache-plugin` | `RushResolverCachePlugin` | `/workspaces/rushstack/rush-plugins/rush-resolver-cache-plugin/src/index.ts:17` | Generates resolver cache after install |
| `rush-litewatch-plugin` | *(not yet implemented)* | `/workspaces/rushstack/rush-plugins/rush-litewatch-plugin/src/index.ts:4` | Throws "Plugin is not implemented yet" |

### 8.1 Example Plugin Implementation: Amazon S3

**File:** `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/src/RushAmazonS3BuildCachePlugin.ts`

The `RushAmazonS3BuildCachePlugin` class (lines 46-100):
1. Implements `IRushPlugin` with `pluginName = 'AmazonS3BuildCachePlugin'`
2. In `apply()` (line 49): Taps the `initialize` hook
3. Inside the `initialize` tap: Calls `rushSession.registerCloudBuildCacheProviderFactory('amazon-s3', ...)` (line 51)
4. The factory receives `buildCacheConfig`, extracts the `amazonS3Configuration` section, validates parameters, and lazily imports and constructs an `AmazonS3BuildCacheProvider`

**Entry point:** `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/src/index.ts`
- Uses `export default RushAmazonS3BuildCachePlugin` (line 10) -- the default export pattern

### 8.2 Example Plugin Implementation: BuildXL Graph

**File:** `/workspaces/rushstack/rush-plugins/rush-buildxl-graph-plugin/src/DropBuildGraphPlugin.ts`

The `DropBuildGraphPlugin` class (lines 46-111) demonstrates hooking into phased commands:
1. Takes `buildXLCommandNames` options in constructor (line 50)
2. In `apply()` (line 54): For each command name, taps `session.hooks.runPhasedCommand.for(commandName)` (line 99)
3. Inside that tap, hooks `command.hooks.createOperations.tapPromise()` with `stage: Number.MAX_SAFE_INTEGER` (lines 100-107) to run last
4. Reads the `--drop-graph` parameter from `context.customParameters` and, if present, writes the build graph to a file and returns an empty operation set to skip execution

### 8.3 Example Plugin Implementation: Redis Cobuild

**File:** `/workspaces/rushstack/rush-plugins/rush-redis-cobuild-plugin/src/RushRedisCobuildPlugin.ts`

The `RushRedisCobuildPlugin` class (lines 24-41):
1. Takes `IRushRedisCobuildPluginOptions` in constructor (line 29)
2. In `apply()`: Taps `initialize` hook (line 34), then registers a cobuild lock provider factory for `'redis'` (line 35) that constructs a `RedisCobuildLockProvider`

---

## 9. Data Flow Summary

### Plugin Discovery and Loading (at Rush startup)

```
RushCommandLineParser constructor
  |
  +-> RushConfiguration.loadFromConfigurationFile()
  |     +-> Loads common/config/rush/rush-plugins.json via RushPluginsConfiguration
  |
  +-> new PluginManager()
  |     +-> For each built-in plugin name:
  |     |     +-> Check rush-lib's own package.json dependencies
  |     |     +-> Import.resolvePackage() to find package folder
  |     |     +-> Create BuiltInPluginLoader
  |     |
  |     +-> For each entry in rush-plugins.json:
  |           +-> Create AutoinstallerPluginLoader
  |                 +-> Create Autoinstaller instance
  |                 +-> packageFolder = <autoinstallerFolder>/node_modules/<packageName>
  |
  +-> pluginManager.tryGetCustomCommandLineConfigurationInfos()
  |     +-> For each AutoinstallerPluginLoader:
  |           +-> Read cached rush-plugin-manifest.json from <autoinstallerFolder>/rush-plugins/
  |           +-> If commandLineJsonFilePath specified, load cached command-line.json
  |           +-> Return CommandLineConfiguration objects
  |
  +-> Register plugin-provided commands as CLI actions
  |
  +-> _populateScriptActions() -- register user's command-line.json commands
```

### Plugin Execution (at action run time)

```
RushCommandLineParser.executeAsync()
  |
  +-> pluginManager.tryInitializeUnassociatedPluginsAsync()
  |     +-> For each loader without associatedCommands:
  |           +-> autoinstaller.prepareAsync() (install deps if needed)
  |           +-> pluginLoader.load()
  |           |     +-> RushSdk.ensureInitialized() -- set global.___rush___rushLibModule
  |           |     +-> require(entryPoint) -- load plugin module
  |           |     +-> new PluginClass(options) -- instantiate with JSON options
  |           +-> plugin.apply(rushSession, rushConfiguration)
  |                 +-> Plugin taps hooks on rushSession.hooks
  |
  +-> CommandLineParser dispatches to selected action
        |
        +-> BaseRushAction.onExecuteAsync()
              |
              +-> pluginManager.tryInitializeAssociatedCommandPluginsAsync(actionName)
              |     +-> Same flow as above, but filtered to matching associatedCommands
              |
              +-> rushSession.hooks.initialize.promise(this)
              |
              +-> action.runAsync()
                    +-> Hooks fire as the command executes
```

### Autoinstaller Installation Flow

```
Autoinstaller.prepareAsync()
  |
  +-> Verify folder exists
  +-> InstallHelpers.ensureLocalPackageManagerAsync()
  +-> LockFile.acquireAsync() -- prevent concurrent installs
  +-> Compute LastInstallFlag (node version, pkg mgr, package.json)
  +-> Check: is last-install.flag valid AND rush-autoinstaller.flag exists?
  |
  +-- YES: Skip install ("already up to date")
  |
  +-- NO:
        +-> Clear node_modules/
        +-> Sync .npmrc from common/config/rush/
        +-> Run: <packageManager> install --frozen-lockfile
        +-> Create last-install.flag
        +-> Create rush-autoinstaller.flag sentinel
  |
  +-> Release lock
```

---

## 10. Key Configuration Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `rush-plugins.json` | `common/config/rush/rush-plugins.json` | Declares which third-party plugins to load and their autoinstaller |
| `rush-plugin-manifest.json` | Root of each plugin NPM package | Declares plugin names, entry points, schemas, associated commands |
| `command-line.json` | `common/config/rush/command-line.json` | User-defined custom commands and parameters |
| Plugin command-line.json | Specified by `commandLineJsonFilePath` in manifest | Plugin-provided custom commands |
| Plugin options | `common/config/rush-plugins/<pluginName>.json` | Per-plugin options validated against `optionsSchema` |
| Autoinstaller package.json | `common/autoinstallers/<name>/package.json` | Dependencies for an autoinstaller |
| Autoinstaller shrinkwrap | `common/autoinstallers/<name>/<shrinkwrapFilename>` | Locked dependency versions for an autoinstaller |

---

## 11. Key Constants

**File:** `/workspaces/rushstack/libraries/rush-lib/src/logic/RushConstants.ts`

| Constant | Value | Line |
|----------|-------|------|
| `commandLineFilename` | `'command-line.json'` | 185 |
| `rushPluginsConfigFilename` | `'rush-plugins.json'` | 202 |
| `rushPluginManifestFilename` | `'rush-plugin-manifest.json'` | 207-208 |
