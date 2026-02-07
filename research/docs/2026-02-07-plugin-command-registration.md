# Rush Plugin Command Discovery, Loading, and Registration

## Overview

Rush supports two distinct sources of CLI commands: **built-in commands** (hardcoded action classes like `InstallAction`, `BuildAction`, etc.) and **plugin/custom commands** (defined via JSON configuration files). Plugin commands travel through a multi-stage pipeline: discovery from configuration files, loading via plugin loader classes, parsing into `CommandLineConfiguration` objects, and registration as `CommandLineAction` subclasses on the `RushCommandLineParser`. Plugins can also hook into Rush's lifecycle via the `RushSession.hooks` tapable hooks without necessarily defining commands.

---

## 1. The `command-line.json` Schema and How It Defines Commands

### Schema Location

- **Schema file:** `/workspaces/rushstack/libraries/rush-lib/src/schemas/command-line.schema.json`
- **TypeScript interfaces:** `/workspaces/rushstack/libraries/rush-lib/src/api/CommandLineJson.ts`

### Top-Level Structure (`ICommandLineJson`)

Defined at `CommandLineJson.ts:277-281`:

```typescript
export interface ICommandLineJson {
  commands?: CommandJson[];
  phases?: IPhaseJson[];
  parameters?: ParameterJson[];
}
```

The JSON file has three top-level arrays: `commands`, `phases`, and `parameters`.

### Command Kinds

Three command kinds exist, each with its own JSON interface (schema definition `command-line.schema.json:12-275`):

1. **`bulk`** (`IBulkCommandJson` at `CommandLineJson.ts:23-33`) -- A legacy per-project command. At runtime, bulk commands are **translated into phased commands** with a synthetic single phase (see Section 6).
   - Required fields: `commandKind: "bulk"`, `name`, `summary`, `enableParallelism`
   - Optional: `ignoreDependencyOrder`, `ignoreMissingScript`, `incremental`, `watchForChanges`, `disableBuildCache`, `shellCommand`, `allowWarningsInSuccessfulBuild`

2. **`global`** (`IGlobalCommandJson` at `CommandLineJson.ts:64-67`) -- A command run once for the entire repo.
   - Required fields: `commandKind: "global"`, `name`, `summary`, `shellCommand`
   - Optional: `autoinstallerName`

3. **`phased`** (`IPhasedCommandJson` at `CommandLineJson.ts:49-59`) -- A multi-phase per-project command (the modern approach).
   - Required fields: `commandKind: "phased"`, `name`, `summary`, `enableParallelism`, `phases`
   - Optional: `incremental`, `watchOptions` (containing `alwaysWatch`, `debounceMs`, `watchPhases`), `installOptions` (containing `alwaysInstall`)

### Phase Definitions

Defined in `IPhaseJson` at `CommandLineJson.ts:90-111`:
- Required: `name` (must start with `_phase:` prefix, enforced at `CommandLineConfiguration.ts:235-254`)
- Optional: `dependencies` (with `self` and `upstream` arrays), `ignoreMissingScript`, `missingScriptBehavior`, `allowWarningsOnSuccess`

### Parameter Definitions

Seven parameter kinds are supported (`CommandLineJson.ts:117-272`, schema `command-line.schema.json:338-694`):
- `flag` (`IFlagParameterJson`) -- boolean on/off
- `choice` (`IChoiceParameterJson`) -- select from `alternatives` list
- `string` (`IStringParameterJson`) -- arbitrary string with `argumentName`
- `integer` (`IIntegerParameterJson`) -- integer with `argumentName`
- `stringList` (`IStringListParameterJson`) -- repeated string values
- `integerList` (`IIntegerListParameterJson`) -- repeated integer values
- `choiceList` (`IChoiceListParameterJson`) -- repeated choice values

All parameters share the base fields defined in `IBaseParameterJson` at `CommandLineJson.ts:117-146`:
- `parameterKind`, `longName` (required, pattern `^-(-[a-z0-9]+)+$`), `shortName` (optional), `description` (required), `associatedCommands`, `associatedPhases`, `required`

---

## 2. How Rush's CLI Parser Loads Commands: Built-in vs Plugin

### Entry Point: `Rush.launch()`

At `/workspaces/rushstack/libraries/rush-lib/src/api/Rush.ts:79-100`, `Rush.launch()` creates a `RushCommandLineParser` and calls `parser.executeAsync()`.

```
Rush.launch()
  -> new RushCommandLineParser(options)  [line 93-96]
  -> parser.executeAsync()               [line 99]
```

### `RushCommandLineParser` Constructor

At `/workspaces/rushstack/libraries/rush-lib/src/cli/RushCommandLineParser.ts:98-194`, the constructor performs these steps in order:

**Step 1: Load Rush Configuration** (lines 132-146)
- Finds `rush.json` via `RushConfiguration.tryFindRushJsonLocation()`
- Loads `RushConfiguration` from the file if found

**Step 2: Create `PluginManager`** (lines 160-167)
- Instantiates `PluginManager` with `builtInPluginConfigurations` (passed from the launcher), `rushConfiguration`, `rushSession`, and `terminal`

**Step 3: Retrieve plugin command-line configurations** (lines 169-177)
- Calls `this.pluginManager.tryGetCustomCommandLineConfigurationInfos()` which iterates only over **autoinstaller plugin loaders** (not built-in ones)
- Each loader reads its `rush-plugin-manifest.json` for a `commandLineJsonFilePath`, then loads and parses that file into a `CommandLineConfiguration`
- Checks if any plugin defines a `build` command; if so, sets `_autocreateBuildCommand = false` (line 177)

**Step 4: Populate built-in actions** (line 179)
- Calls `this._populateActions()` which adds all hardcoded Rush actions

**Step 5: Register plugin command actions** (lines 181-193)
- Iterates over each plugin's `CommandLineConfiguration` and calls `this._addCommandLineConfigActions()` for each
- Errors are caught and attributed to the responsible plugin

### Built-in Actions Registration

At `_populateActions()` (lines 324-358), Rush adds 25 hardcoded action classes:

```
AddAction, ChangeAction, CheckAction, DeployAction, InitAction,
InitAutoinstallerAction, InitDeployAction, InitSubspaceAction,
InstallAction, LinkAction, ListAction, PublishAction, PurgeAction,
RemoveAction, ScanAction, SetupAction, UnlinkAction, UpdateAction,
InstallAutoinstallerAction, UpdateAutoinstallerAction,
UpdateCloudCredentialsAction, UpgradeInteractiveAction,
VersionAction, AlertAction, BridgePackageAction, LinkPackageAction
```

After these, `_populateScriptActions()` (lines 360-379) loads the repo's own `common/config/rush/command-line.json` file and registers its commands. If `_autocreateBuildCommand` is `false` (a plugin already defined `build`), the `doNotIncludeDefaultBuildCommands` flag is passed to `CommandLineConfiguration.loadFromFileOrDefault()`.

### Plugin Command Registration

At lines 381-416, `_addCommandLineConfigActions()` iterates over each command in the `CommandLineConfiguration` and dispatches to:
- `_addGlobalScriptAction()` (lines 434-459) for `global` commands
- `_addPhasedCommandLineConfigAction()` (lines 462-492) for `phased` commands

Each method constructs the appropriate action class (`GlobalScriptAction` or `PhasedScriptAction`) and registers it via `this.addAction()`.

---

## 3. Plugin Lifecycle: From Discovery to Execution

### 3a. How Rush Knows Which Plugins to Load

**User-configured plugins** are declared in `common/config/rush/rush-plugins.json`, governed by the schema at `/workspaces/rushstack/libraries/rush-lib/src/schemas/rush-plugins.schema.json`.

The `RushPluginsConfiguration` class at `/workspaces/rushstack/libraries/rush-lib/src/api/RushPluginsConfiguration.ts:24-41` loads this file. Each plugin entry requires:
- `packageName` -- the NPM package name
- `pluginName` -- the specific plugin name within the package
- `autoinstallerName` -- which autoinstaller manages the plugin's dependencies

This configuration is read by `RushConfiguration` at `/workspaces/rushstack/libraries/rush-lib/src/api/RushConfiguration.ts:674-678`:
```typescript
const rushPluginsConfigFilename = path.join(this.commonRushConfigFolder, RushConstants.rushPluginsConfigFilename);
this._rushPluginsConfiguration = new RushPluginsConfiguration(rushPluginsConfigFilename);
```

**Built-in plugins** are discovered by the `PluginManager` constructor at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginManager.ts:62-98`. It calls `tryAddBuiltInPlugin()` for each known built-in plugin name, checking if the package exists as a dependency of `@microsoft/rush-lib`:
- `rush-amazon-s3-build-cache-plugin`
- `rush-azure-storage-build-cache-plugin`
- `rush-http-build-cache-plugin`
- `rush-azure-interactive-auth-plugin` (secondary plugin in the azure storage package)

### 3b. How Rush Resolves the Plugin Package

**Built-in plugins** are resolved via `Import.resolvePackage()` relative to rush-lib's own `__dirname` at `PluginManager.ts:72-77`. The resolved folder path is stored in the `IBuiltInPluginConfiguration.pluginPackageFolder` field.

The `BuiltInPluginLoader` class at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/BuiltInPluginLoader.ts:18-25` simply uses `pluginConfiguration.pluginPackageFolder` as its `packageFolder`.

**Autoinstaller plugins** are resolved by `AutoinstallerPluginLoader` at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/AutoinstallerPluginLoader.ts:38-48`. The `packageFolder` is computed as:
```
<autoinstaller.folderFullPath>/node_modules/<packageName>
```
For example: `common/autoinstallers/my-plugins/node_modules/@scope/my-plugin`.

The autoinstaller creates an `Autoinstaller` instance (line 40-45) which can be prepared (i.e., `npm install`/`pnpm install` run) before the plugin is loaded.

### 3c. How Rush Reads the Plugin Manifest

Every plugin package must contain a `rush-plugin-manifest.json` file (constant `RushConstants.rushPluginManifestFilename`). The manifest schema is at `/workspaces/rushstack/libraries/rush-lib/src/schemas/rush-plugin-manifest.schema.json`.

The `PluginLoaderBase._getRushPluginManifest()` method at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts:200-229` loads and validates this manifest. It finds the specific plugin entry matching `this.pluginName` from the manifest's `plugins` array. The manifest entry (`IRushPluginManifest` at lines 23-30) contains:
- `pluginName` (required)
- `description` (required)
- `entryPoint` (optional) -- path to the JS module exporting the plugin class
- `optionsSchema` (optional) -- path to a JSON schema for plugin options
- `associatedCommands` (optional) -- array of command names; the plugin is only loaded when one of these commands runs
- `commandLineJsonFilePath` (optional) -- path to a `command-line.json` file defining additional commands

For **autoinstaller plugins**, the manifest is read from a cached location (the `rush-plugins` store folder) rather than from `node_modules` directly. `AutoinstallerPluginLoader._getManifestPath()` at `AutoinstallerPluginLoader.ts:150-156` returns:
```
<autoinstaller.folderFullPath>/rush-plugins/<packageName>/rush-plugin-manifest.json
```

This cached manifest is populated during `rush update` by `AutoinstallerPluginLoader.update()` at lines 58-112, which copies the manifest from the package's `node_modules` location to the store.

### 3d. How Plugin Commands Are Discovered (Without Instantiating the Plugin)

Plugin commands are discovered **before** the plugin is instantiated. The `PluginManager.tryGetCustomCommandLineConfigurationInfos()` method at `PluginManager.ts:184-197` iterates over all **autoinstaller plugin loaders** and calls `pluginLoader.getCommandLineConfiguration()`.

`PluginLoaderBase.getCommandLineConfiguration()` at `PluginLoaderBase.ts:86-105`:
1. Reads `commandLineJsonFilePath` from the plugin manifest
2. If present, resolves it relative to the `packageFolder`
3. Calls `CommandLineConfiguration.tryLoadFromFile()` to parse and validate it
4. Prepends additional PATH folders (the plugin package's `node_modules/.bin`) to the configuration
5. Sets `shellCommandTokenContext` with the plugin's `packageFolder` for token expansion

This means a plugin can define commands via its `command-line.json` file **without even having an entry point**. The `entryPoint` field is optional.

### 3e. How Rush Instantiates the Plugin

Plugin instantiation happens in two phases, controlled by the `associatedCommands` manifest property:

**Phase 1: Unassociated plugins** -- Loaded during `parser.executeAsync()` at `RushCommandLineParser.ts:235-237`:
```typescript
await this.pluginManager.tryInitializeUnassociatedPluginsAsync();
```

`PluginManager.tryInitializeUnassociatedPluginsAsync()` at `PluginManager.ts:152-165`:
1. Filters plugin loaders to those **without** `associatedCommands` in their manifest (`_getUnassociatedPluginLoaders` at lines 213-219)
2. Prepares autoinstallers (runs `npm install` if needed)
3. Calls `_initializePlugins()` for both built-in and autoinstaller loaders

**Phase 2: Associated plugins** -- Loaded when a specific command executes, triggered by `BaseRushAction.onExecuteAsync()` at `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/BaseRushAction.ts:127-129`:
```typescript
await this.parser.pluginManager.tryInitializeAssociatedCommandPluginsAsync(this.actionName);
```

`PluginManager.tryInitializeAssociatedCommandPluginsAsync()` at `PluginManager.ts:167-182` filters to plugins whose `associatedCommands` includes the current command name.

The actual loading happens in `_initializePlugins()` at `PluginManager.ts:199-211`:
1. Checks for duplicate plugin names (line 202-203)
2. Calls `pluginLoader.load()` -- this returns the plugin instance
3. Adds the name to `_loadedPluginNames` to prevent re-loading
4. Calls `_applyPlugin(plugin, pluginName)` if the plugin was loaded

### 3f. Plugin Loading Internals

`PluginLoaderBase.load()` at `PluginLoaderBase.ts:70-80`:
1. Calls `_resolvePlugin()` (lines 151-164) which reads the `entryPoint` from the manifest and resolves it to an absolute path within the `packageFolder`. Returns `undefined` if no entry point.
2. Calls `_getPluginOptions()` (lines 166-185) which loads the options JSON from `<rushPluginOptionsFolder>/<pluginName>.json` and validates against the plugin's `optionsSchema` if present.
3. Calls `RushSdk.ensureInitialized()` (at `RushSdk.ts:12-22`) which sets `global.___rush___rushLibModule` so plugins using `@rushstack/rush-sdk` can access the same rush-lib instance.
4. Calls `_loadAndValidatePluginPackage()` (lines 123-149) which:
   - `require()`s the resolved path
   - Handles both default exports and direct exports
   - Instantiates the plugin class with the loaded options: `new pluginPackage(options)`
   - Validates that the instance has an `apply` method

### 3g. How the Plugin's `apply()` Method Works

`PluginManager._applyPlugin()` at `PluginManager.ts:230-236`:
```typescript
plugin.apply(this._rushSession, this._rushConfiguration);
```

The `IRushPlugin` interface at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/IRushPlugin.ts:10-12`:
```typescript
export interface IRushPlugin {
  apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void;
}
```

Plugins use the `rushSession.hooks` object (a `RushLifecycleHooks` instance) to tap into lifecycle events. They do **not** directly add commands to the CLI -- command definition happens via the `command-line.json` file in the plugin package (see Section 3d).

---

## 4. `RushCommandLineParser` Class Architecture

### Class Hierarchy

`RushCommandLineParser` at `/workspaces/rushstack/libraries/rush-lib/src/cli/RushCommandLineParser.ts:76` extends `CommandLineParser` from `@rushstack/ts-command-line`.

### Key Public Properties
- `rushConfiguration: RushConfiguration` (line 79)
- `rushSession: RushSession` (line 80)
- `pluginManager: PluginManager` (line 81)
- `telemetry: Telemetry | undefined` (line 77)
- `rushGlobalFolder: RushGlobalFolder` (line 78)

### Constructor Flow Summary (lines 98-194)

1. Calls `super()` with `toolFilename: 'rush'`
2. Defines global `--debug` and `--quiet` parameters (lines 113-123)
3. Normalizes options; finds and loads `rush.json` (lines 129-146)
4. Creates `RushGlobalFolder`, `RushSession`, `PluginManager` (lines 154-167)
5. Gets plugin `CommandLineConfiguration` objects (line 169-177)
6. Calls `_populateActions()` for built-in actions (line 179)
7. Iterates plugin configurations and calls `_addCommandLineConfigActions()` (lines 181-193)

### Execution Flow

`executeAsync()` at lines 230-240:
1. Manually parses `--debug` flag from `process.argv`
2. Calls `pluginManager.tryInitializeUnassociatedPluginsAsync()` -- loads plugins without `associatedCommands`
3. Calls `super.executeAsync()` which triggers argument parsing and routes to the matched action

`onExecuteAsync()` at lines 242-300:
1. Sets `process.exitCode = 1` defensively
2. Invokes the selected action via `super.onExecuteAsync()`
3. Handles Rush alerts display after successful execution
4. Resets `process.exitCode = 0` on success

---

## 5. Command Definition Types and Interfaces

### Action Base Classes

**`BaseConfiglessRushAction`** at `/workspaces/rushstack/libraries/rush-lib/src/cli/actions/BaseRushAction.ts:41-102`:
- Extends `CommandLineAction` from `@rushstack/ts-command-line`
- Implements `IRushCommand` (provides `actionName`)
- Manages lock file acquisition for non-safe-for-simultaneous commands
- Defines abstract `runAsync()` method

**`BaseRushAction`** at `BaseRushAction.ts:107-167`:
- Extends `BaseConfiglessRushAction`
- Requires `rushConfiguration` to exist (throws if missing)
- Calls `pluginManager.tryInitializeAssociatedCommandPluginsAsync(this.actionName)` before execution (line 128)
- Fires `rushSession.hooks.initialize` hook (lines 133-139)
- Implements deferred plugin error reporting via `_throwPluginErrorIfNeed()` (lines 148-166)
  - Skips error reporting for `update`, `init-autoinstaller`, `update-autoinstaller`, `setup` commands (line 160)

**`BaseScriptAction`** at `/workspaces/rushstack/libraries/rush-lib/src/cli/scriptActions/BaseScriptAction.ts:28-47`:
- Extends `BaseRushAction`
- Holds `commandLineConfiguration`, `customParameters` map, and `command` reference
- Has `defineScriptParameters()` which delegates to `defineCustomParameters()` (line 45)

### Concrete Action Classes for Custom Commands

**`GlobalScriptAction`** at `/workspaces/rushstack/libraries/rush-lib/src/cli/scriptActions/GlobalScriptAction.ts:43-227`:
- Handles `global` commands
- Executes `shellCommand` via OS shell (`Utilities.executeLifecycleCommand`)
- Supports autoinstaller dependencies
- Fires `rushSession.hooks.runAnyGlobalCustomCommand` and `rushSession.hooks.runGlobalCustomCommand.get(actionName)` hooks before execution (lines 107-118)
- Appends custom parameter values to the shell command string (lines 133-153)
- Expands `<packageFolder>` tokens from plugin context (lines 154-159, 198-226)

**`PhasedScriptAction`** at `/workspaces/rushstack/libraries/rush-lib/src/cli/scriptActions/PhasedScriptAction.ts:137-1180`:
- Handles `phased` (and translated `bulk`) commands
- Implements `IPhasedCommand` interface (provides `hooks: PhasedCommandHooks` and `sessionAbortController`)
- Defines many built-in parameters: `--parallelism`, `--timeline`, `--verbose`, `--changed-projects-only`, `--ignore-hooks`, `--watch`, `--install`, `--include-phase-deps`, `--node-diagnostic-dir`, `--debug-build-cache-ids` (lines 205-330)
- Calls `defineScriptParameters()` at line 331 and `associateParametersByPhase()` at line 334
- Fires `rushSession.hooks.runAnyPhasedCommand` and `rushSession.hooks.runPhasedCommand.get(actionName)` hooks (lines 437-453)
- Creates and executes operations via `PhasedCommandHooks.createOperations` waterfall hook

### Command Type Union

At `CommandLineConfiguration.ts:132`:
```typescript
export type Command = IGlobalCommandConfig | IPhasedCommandConfig;
```

`IGlobalCommandConfig` (line 130): extends `IGlobalCommandJson` + `ICommandWithParameters`
`IPhasedCommandConfig` (lines 96-128): extends `IPhasedCommandWithoutPhasesJson` + `ICommandWithParameters`, adding `isSynthetic`, `disableBuildCache`, `originalPhases`, `phases`, `alwaysWatch`, `watchPhases`, `watchDebounceMs`, `alwaysInstall`

---

## 6. Parameter Definition and Parsing for Plugin Commands

### Parameter Definition Flow

1. **In `CommandLineConfiguration` constructor** (`CommandLineConfiguration.ts:484-561`): Each parameter from the JSON `parameters` array is normalized. Its `associatedCommands` are resolved to actual `Command` objects, and the parameter is added to each command's `associatedParameters` set (line 533). If the command was a translated bulk command, the parameter is also associated with the synthetic phase (lines 517-523).

2. **In `BaseScriptAction.defineScriptParameters()`** (`BaseScriptAction.ts:39-46`): Calls `defineCustomParameters()` with the command's `associatedParameters` set.

3. **In `defineCustomParameters()`** (`/workspaces/rushstack/libraries/rush-lib/src/cli/parsing/defineCustomParameters.ts:18-100`): For each `IParameterJson` in the set, creates the corresponding `CommandLineParameter` on the action using `ts-command-line`'s define methods (`defineFlagParameter`, `defineChoiceParameter`, `defineStringParameter`, `defineIntegerParameter`, `defineStringListParameter`, `defineIntegerListParameter`, `defineChoiceListParameter`). The resulting `CommandLineParameter` instance is stored in the `customParameters` map keyed by its `IParameterJson` definition.

4. **In `PhasedScriptAction` constructor** (`PhasedScriptAction.ts:334`): After `defineScriptParameters()`, calls `associateParametersByPhase()` to link `CommandLineParameter` instances to their respective `IPhase` objects.

### Phase-Parameter Association

`associateParametersByPhase()` at `/workspaces/rushstack/libraries/rush-lib/src/cli/parsing/associateParametersByPhase.ts:17-32`:
- Iterates each `(IParameterJson, CommandLineParameter)` pair
- For each `associatedPhases` name on the parameter definition, finds the `IPhase` and adds the `CommandLineParameter` to `phase.associatedParameters`
- This allows per-phase parameter filtering during operation execution

### Parameter Consumption

- **Global commands**: `GlobalScriptAction.runAsync()` at `GlobalScriptAction.ts:133-153` iterates `this.customParameters.values()` and calls `tsCommandLineParameter.appendToArgList()` to build the argument string appended to `shellCommand`.
- **Phased commands**: `PhasedScriptAction.runAsync()` at `PhasedScriptAction.ts:487-490` builds a `customParametersByName` map from `this.customParameters` and passes it as `ICreateOperationsContext.customParameters`. These are then available to operation runners (e.g., `ShellOperationRunnerPlugin`) and plugins via `PhasedCommandHooks`.

---

## 7. Differences Between Built-in Commands and Plugin-Provided Commands

### Registration Timing

| Aspect | Built-in Commands | Plugin Commands |
|--------|------------------|-----------------|
| **Registration** | `_populateActions()` in `RushCommandLineParser` constructor (line 179) | After `_populateActions()`, via `_addCommandLineConfigActions()` loop (lines 181-193) |
| **Source** | Hardcoded imports of action classes | `command-line.json` files from plugin packages or `common/config/rush/command-line.json` |
| **Class** | Direct subclasses of `BaseRushAction` or `BaseConfiglessRushAction` | `GlobalScriptAction` or `PhasedScriptAction` (both extend `BaseScriptAction<T>`) |

### Configuration Source

- **Built-in commands**: Defined as TypeScript classes imported in `RushCommandLineParser.ts` lines 28-63. Their parameters are defined programmatically in each action's constructor.
- **Repo custom commands**: Defined in `common/config/rush/command-line.json`, loaded by `CommandLineConfiguration.loadFromFileOrDefault()` at line 374.
- **Plugin commands**: Defined in a `command-line.json` file inside the plugin package, referenced by `commandLineJsonFilePath` in `rush-plugin-manifest.json`, loaded by `PluginLoaderBase.getCommandLineConfiguration()` at line 86.

### Name Conflict Handling

At `_addCommandLineConfigAction()` (line 392-397), if a command name already exists (from a built-in or previously registered plugin), an error is thrown. Plugin commands are registered **after** built-in commands and **after** repo custom commands, so they cannot shadow existing names.

### The `build` and `rebuild` Special Cases

- If no `build` command is defined anywhere (not by plugins, not by `command-line.json`), a default `build` command is auto-created from `DEFAULT_BUILD_COMMAND_JSON` at `CommandLineConfiguration.ts:147-163`.
- Similarly, if `build` exists but `rebuild` does not, a default `rebuild` is synthesized at lines 461-481.
- The `_autocreateBuildCommand` flag at `RushCommandLineParser.ts:172-177` prevents the default build command from being created if any plugin already defines one.
- `build` and `rebuild` cannot be `global` commands (enforced at `CommandLineConfiguration.ts:427-432` and `RushCommandLineParser.ts:438-447`).

### Bulk-to-Phased Translation

Bulk commands are a legacy concept. `CommandLineConfiguration._translateBulkCommandToPhasedCommand()` at `CommandLineConfiguration.ts:707-746` converts them:
1. Creates a synthetic `IPhase` with the same name as the bulk command (line 708-721)
2. If `ignoreDependencyOrder` is not set, adds a self-upstream dependency (lines 723-725)
3. Registers the synthetic phase in `this.phases` and `_syntheticPhasesByTranslatedBulkCommandName` (lines 727-728)
4. Returns an `IPhasedCommandConfig` with `isSynthetic: true` (line 735)

### Plugin Error Handling

Plugin loading errors are **deferred** rather than immediately fatal. They are stored in `PluginManager.error` (line 42, 118-120) and only thrown when a command actually executes, via `BaseRushAction._throwPluginErrorIfNeed()` at `BaseRushAction.ts:148-166`. The commands `update`, `init-autoinstaller`, `update-autoinstaller`, and `setup` skip this check (line 160) since they are used to fix plugin installation problems.

### Lifecycle Hooks Available to Plugins

The `RushSession.hooks` property provides `RushLifecycleHooks` at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/RushLifeCycle.ts:53-114`:
- `initialize` -- before any Rush command executes
- `runAnyGlobalCustomCommand` -- before any global custom command
- `runGlobalCustomCommand` -- HookMap keyed by command name
- `runAnyPhasedCommand` -- before any phased command
- `runPhasedCommand` -- HookMap keyed by command name
- `beforeInstall` / `afterInstall` -- around package manager invocation
- `flushTelemetry` -- for custom telemetry processing

Additionally, `PhasedCommandHooks` at `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts:146-216` provides operation-level hooks:
- `createOperations` -- waterfall hook to build the operation graph
- `beforeExecuteOperations` / `afterExecuteOperations` -- around operation execution
- `beforeExecuteOperation` / `afterExecuteOperation` -- per-operation hooks
- `createEnvironmentForOperation` -- define environment variables
- `onOperationStatusChanged` -- sync notification of status changes
- `shutdownAsync` -- cleanup for long-lived plugins
- `waitingForChanges` -- notification in watch mode
- `beforeLog` -- augment telemetry data

---

## Data Flow Summary

```
rush.json
  |
  v
RushConfiguration
  |-- loads common/config/rush/rush-plugins.json -> RushPluginsConfiguration
  |                                                  (list of IRushPluginConfiguration)
  |
  v
RushCommandLineParser constructor
  |
  |-- creates PluginManager
  |     |
  |     |-- creates BuiltInPluginLoader[] (from rush-lib dependencies)
  |     |     each resolves packageFolder via Import.resolvePackage()
  |     |
  |     |-- creates AutoinstallerPluginLoader[] (from rush-plugins.json)
  |     |     each computes packageFolder = autoinstaller/node_modules/<pkg>
  |     |
  |     |-- tryGetCustomCommandLineConfigurationInfos()
  |           for each AutoinstallerPluginLoader:
  |             reads rush-plugin-manifest.json -> commandLineJsonFilePath
  |             loads and parses that command-line.json
  |             returns CommandLineConfiguration + PluginLoaderBase
  |
  |-- _populateActions()
  |     registers 25 hardcoded action classes
  |     then _populateScriptActions():
  |       loads common/config/rush/command-line.json
  |       registers GlobalScriptAction / PhasedScriptAction for each command
  |
  |-- for each plugin CommandLineConfiguration:
  |     _addCommandLineConfigActions()
  |       for each command:
  |         _addCommandLineConfigAction()
  |           creates GlobalScriptAction or PhasedScriptAction
  |           registers via this.addAction()
  |
  v
parser.executeAsync()
  |
  |-- pluginManager.tryInitializeUnassociatedPluginsAsync()
  |     for plugins without associatedCommands:
  |       prepares autoinstallers
  |       pluginLoader.load() -> require() entry point -> new Plugin(options)
  |       plugin.apply(rushSession, rushConfiguration) -> taps hooks
  |
  |-- super.executeAsync() -> routes to matched CommandLineAction
  |
  v
BaseRushAction.onExecuteAsync()
  |
  |-- pluginManager.tryInitializeAssociatedCommandPluginsAsync(actionName)
  |     for plugins with matching associatedCommands:
  |       same load/apply flow as above
  |
  |-- rushSession.hooks.initialize.promise(this)
  |
  |-- action.runAsync()
        (GlobalScriptAction or PhasedScriptAction)
        fires command-specific hooks, executes shell command or operation graph
```
