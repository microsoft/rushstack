---
date: 2026-02-07 23:04:49 UTC
researcher: Claude
git_commit: d61ddd6d2652ce142803db3c73058c06415edaab
branch: feat/claude-workflow
repository: rushstack
topic: "Extracting rush upgrade-interactive from rush-lib into an auto-installed Rush plugin"
tags: [research, codebase, upgrade-interactive, rush-plugins, autoinstaller, rush-lib]
status: complete
last_updated: 2026-02-07
last_updated_by: Claude
---

# Research: Extracting `rush upgrade-interactive` into an Auto-Installed Plugin

## Research Question

How is `rush upgrade-interactive` currently implemented in rush-lib, and how are other Rush features extracted into auto-installed plugins, so that `upgrade-interactive` can be similarly extracted?

## Summary

`rush upgrade-interactive` is a **hardcoded built-in CLI action** registered directly in `RushCommandLineParser._populateActions()`. It spans two main packages: `@microsoft/rush-lib` (action class, interactive prompts, package.json update logic) and `@rushstack/npm-check-fork` (npm registry queries and version comparison). The feature uses `inquirer`, `cli-table`, `rxjs`, and `figures` as dependencies, all of which are bundled in rush-lib today.

Rush has a well-established plugin architecture with two loading mechanisms: **built-in plugins** (bundled as `publishOnlyDependencies` of rush-lib, loaded via `BuiltInPluginLoader`) and **autoinstaller plugins** (user-configured in `rush-plugins.json`, loaded via `AutoinstallerPluginLoader`). Three build cache plugins are currently shipped as built-in plugins. Seven additional plugins exist as autoinstaller-based plugins.

The `upgrade-interactive` feature is unique among the built-in actions because it does not interact with the hook system or the operation pipeline -- it is a self-contained interactive workflow. This makes it a candidate for extraction since it doesn't need deep integration with Rush internals beyond `RushConfiguration` and `PackageJsonUpdater`.

## Detailed Findings

### 1. Current `upgrade-interactive` Implementation

#### Command Registration

The command is registered as a hardcoded built-in action (not via `command-line.json`):

- [`libraries/rush-lib/src/cli/RushCommandLineParser.ts:50`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L50) -- Import statement
- [`libraries/rush-lib/src/cli/RushCommandLineParser.ts:348`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/cli/RushCommandLineParser.ts#L348) -- `this.addAction(new UpgradeInteractiveAction(this))` inside `_populateActions()`

#### Action Class

[`libraries/rush-lib/src/cli/actions/UpgradeInteractiveAction.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/cli/actions/UpgradeInteractiveAction.ts) (87 lines)

- Extends `BaseRushAction` (which extends `BaseConfiglessRushAction` -> `CommandLineAction`)
- Defines three parameters: `--make-consistent` (flag), `--skip-update` / `-s` (flag), `--variant` (string)
- `runAsync()` (line 51): Dynamically imports `PackageJsonUpdater` and `InteractiveUpgrader`, runs the interactive prompts, then delegates to `doRushUpgradeAsync()`
- `safeForSimultaneousRushProcesses: false` -- acquires a repo-level lock

#### Interactive Prompts

[`libraries/rush-lib/src/logic/InteractiveUpgrader.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/logic/InteractiveUpgrader.ts) (78 lines) -- Orchestrates three steps:
1. Project selection via a custom `SearchListPrompt` (filterable list)
2. Dependency status check via `@rushstack/npm-check-fork`
3. Dependency selection via checkbox UI

[`libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts) (222 lines) -- Builds the checkbox prompt with 6 color-coded dependency groups (mismatch, missing, patch, minor, major, non-semver) using `cli-table` for column alignment.

[`libraries/rush-lib/src/utilities/prompts/SearchListPrompt.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/utilities/prompts/SearchListPrompt.ts) (295 lines) -- Custom Inquirer.js prompt extending the `list` type with type-to-filter using `rxjs` event streams.

#### Package.json Update Logic

[`libraries/rush-lib/src/logic/PackageJsonUpdater.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/logic/PackageJsonUpdater.ts) (905 lines) -- The `doRushUpgradeAsync()` method (line 120) handles version resolution, package.json modification, cross-project consistency propagation, and optional `rush update` execution. **This class is shared with `rush add` and `rush remove`**, so it cannot be moved wholesale into the plugin.

[`libraries/rush-lib/src/logic/PackageJsonUpdaterTypes.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/logic/PackageJsonUpdaterTypes.ts) (88 lines) -- Shared types (`SemVerStyle`, `IPackageForRushAdd`, etc.)

#### npm-check-fork Package

[`libraries/npm-check-fork/`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/npm-check-fork) -- A maintained fork of `npm-check` with 7 source files:
- `NpmCheck.ts` -- Entry point, reads deps and creates summaries concurrently
- `NpmRegistryClient.ts` -- Zero-dependency HTTP(S) client for npm registry
- `CreatePackageSummary.ts` -- Per-dependency analysis (bump type, mismatch detection)
- `GetLatestFromRegistry.ts` -- Registry query with version sorting
- `FindModulePath.ts`, `ReadPackageJson.ts`, `BestGuessHomepage.ts`

Runtime dependencies: `giturl`, `lodash`, `semver`, `@rushstack/node-core-library`

#### Feature-Specific Dependencies in rush-lib

| Package | Version | Usage |
|---------|---------|-------|
| `inquirer` | ~8.2.7 | Interactive prompts (checkbox, list via internal APIs) |
| `cli-table` | ~0.3.1 | Dependency info column formatting |
| `figures` | 3.0.0 | Terminal pointer character in list prompt |
| `rxjs` | ~6.6.7 | Observable-based keyboard handling in `SearchListPrompt` |
| `@rushstack/npm-check-fork` | workspace:* | Core dependency checking |

#### Complete Data Flow

```
User runs: rush upgrade-interactive [--make-consistent] [--skip-update] [--variant VARIANT]
    |
    v
RushCommandLineParser._populateActions() (line 348)
    |
    v
UpgradeInteractiveAction.runAsync() (line 51)
    |
    +---> InteractiveUpgrader.upgradeAsync()
    |       |
    |       +---> SearchListPrompt: user selects a Rush project
    |       +---> NpmCheck(): queries npm registry for each dependency
    |       +---> upgradeInteractive(): user selects deps to upgrade (checkbox)
    |       |
    |       +---> Returns: { projects: [selectedProject], depsToUpgrade }
    |
    +---> PackageJsonUpdater.doRushUpgradeAsync()
            |
            +---> DependencyAnalyzer.getAnalysis()
            +---> For each dep: detect semver style, resolve version
            +---> updateProject() for target + optionally other projects
            +---> saveIfModified() for all updated projects
            +---> If !skipUpdate: run rush update via InstallManagerFactory
```

### 2. Rush Plugin Architecture

#### Plugin Interface

[`libraries/rush-lib/src/pluginFramework/IRushPlugin.ts:10-12`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/pluginFramework/IRushPlugin.ts#L10-L12):

```typescript
export interface IRushPlugin {
  apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void;
}
```

#### Plugin Manifest

Each plugin package ships a `rush-plugin-manifest.json` with fields:
- `pluginName` (required), `description` (required)
- `entryPoint` (optional) -- path to JS module exporting the plugin class
- `optionsSchema` (optional) -- JSON Schema for plugin config
- `associatedCommands` (optional) -- plugin only loaded for these commands
- `commandLineJsonFilePath` (optional) -- contributes CLI commands

#### Two Plugin Loader Types

1. **`BuiltInPluginLoader`** ([`libraries/rush-lib/src/pluginFramework/PluginLoader/BuiltInPluginLoader.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/pluginFramework/PluginLoader/BuiltInPluginLoader.ts)):
   - Package resolved from rush-lib's own dependencies via `Import.resolvePackage()`
   - Registered in `PluginManager` constructor with `tryAddBuiltInPlugin()`
   - Dependencies declared as `publishOnlyDependencies` in rush-lib's `package.json`

2. **`AutoinstallerPluginLoader`** ([`libraries/rush-lib/src/pluginFramework/PluginLoader/AutoinstallerPluginLoader.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/pluginFramework/PluginLoader/AutoinstallerPluginLoader.ts)):
   - User-configured in `common/config/rush/rush-plugins.json`
   - Dependencies managed by autoinstallers under `common/autoinstallers/<name>/`
   - Package folder: `<autoinstallerFolder>/node_modules/<packageName>`

#### Plugin Manager

[`libraries/rush-lib/src/pluginFramework/PluginManager.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/pluginFramework/PluginManager.ts) orchestrates:
- Built-in plugin registration (lines 64-98)
- Autoinstaller plugin registration (lines 100-110)
- Two-phase initialization: unassociated plugins (eager) and associated plugins (deferred per command)
- Error deferral so repair commands (`update`, `init-autoinstaller`, etc.) still work

#### Built-In Plugin Registration Pattern

At [`PluginManager.ts:65-90`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/pluginFramework/PluginManager.ts#L65-L90):

```typescript
tryAddBuiltInPlugin('rush-amazon-s3-build-cache-plugin');
tryAddBuiltInPlugin('rush-azure-storage-build-cache-plugin');
tryAddBuiltInPlugin('rush-http-build-cache-plugin');
tryAddBuiltInPlugin('rush-azure-interactive-auth-plugin', '@rushstack/rush-azure-storage-build-cache-plugin');
```

These packages are listed as `publishOnlyDependencies` in [`libraries/rush-lib/package.json:93-97`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/package.json#L93-L97).

### 3. Existing Plugin Examples

#### Built-In Plugins (auto-loaded, no user config needed)

| Plugin | Package | Registration Pattern |
|--------|---------|---------------------|
| `rush-amazon-s3-build-cache-plugin` | `@rushstack/rush-amazon-s3-build-cache-plugin` | `hooks.initialize.tap()` + `registerCloudBuildCacheProviderFactory('amazon-s3')` |
| `rush-azure-storage-build-cache-plugin` | `@rushstack/rush-azure-storage-build-cache-plugin` | Same pattern with `'azure-blob-storage'` |
| `rush-http-build-cache-plugin` | `@rushstack/rush-http-build-cache-plugin` | Same pattern with `'http'` |
| `rush-azure-interactive-auth-plugin` | (secondary in azure storage package) | `hooks.runGlobalCustomCommand.for(name).tapPromise()` |

#### Autoinstaller Plugins (user-configured)

| Plugin | Package | Hook Pattern |
|--------|---------|-------------|
| `rush-redis-cobuild-plugin` | `@rushstack/rush-redis-cobuild-plugin` | `hooks.initialize.tap()` + `registerCobuildLockProviderFactory('redis')` |
| `rush-serve-plugin` | `@rushstack/rush-serve-plugin` | `hooks.runPhasedCommand.for(name).tapPromise()` |
| `rush-bridge-cache-plugin` | `@rushstack/rush-bridge-cache-plugin` | `hooks.runAnyPhasedCommand.tapPromise()` |
| `rush-buildxl-graph-plugin` | `@rushstack/rush-buildxl-graph-plugin` | `hooks.runPhasedCommand.for(name).tap()` |
| `rush-resolver-cache-plugin` | `@rushstack/rush-resolver-cache-plugin` | `hooks.afterInstall.tapPromise()` |

#### Common Structural Patterns Across All Plugins

1. **Default export**: All plugins use `export default PluginClass` from `src/index.ts`
2. **`pluginName` property**: All define `public pluginName: string` or `public readonly pluginName: string`
3. **Lazy imports**: Most defer heavy `import()` calls to inside hook handlers
4. **Options via constructor**: Plugins receive options from JSON config via constructor
5. **`rush-plugin-manifest.json`** at package root with `pluginName`, `description`, `entryPoint`
6. **`optionsSchema`**: Most define a JSON Schema for their config file

### 4. Plugin Command Registration

Plugins can contribute CLI commands by:
1. Including `commandLineJsonFilePath` in their `rush-plugin-manifest.json`
2. The file uses the same format as `command-line.json` (commands, phases, parameters)
3. During `rush update`, `AutoinstallerPluginLoader.update()` copies this to the store at `<autoinstallerFolder>/rush-plugins/<packageName>/<pluginName>/command-line.json`
4. At parse time, `RushCommandLineParser` reads cached files via `pluginManager.tryGetCustomCommandLineConfigurationInfos()`
5. Commands are registered as `GlobalScriptAction` or `PhasedScriptAction`

Currently, **no production plugin defines `commandLineJsonFilePath`** -- this is only used in test fixtures. All existing plugins interact via hooks rather than defining new CLI commands.

### 5. Key Architectural Observations for Extraction

#### What `upgrade-interactive` shares with other built-in commands

- `PackageJsonUpdater` is shared with `rush add` and `rush remove` -- it cannot be moved into the plugin. The plugin would need to access this via `@rushstack/rush-sdk`.
- The `--variant` parameter uses a shared `VARIANT_PARAMETER` definition from `Variants.ts`.
- The action extends `BaseRushAction`, which provides `rushConfiguration`, plugin initialization, and lock file handling.

#### What is unique to `upgrade-interactive`

- `InteractiveUpgrader.ts` -- only used by this command
- `InteractiveUpgradeUI.ts` -- only used by this command
- `SearchListPrompt.ts` -- only used by this command
- `@rushstack/npm-check-fork` -- only used by this command
- Dependencies: `inquirer`, `cli-table`, `figures`, `rxjs` -- these could be moved out of rush-lib

#### How the upgrade-interactive plugin would differ from existing plugins

Existing plugins use **hooks** (`initialize`, `runPhasedCommand`, `afterInstall`, etc.) to extend Rush behavior. The `upgrade-interactive` command is a **standalone CLI action** -- it doesn't hook into any lifecycle events; it runs its own workflow.

The plugin system currently supports adding commands via `commandLineJsonFilePath` in the manifest, which creates `GlobalScriptAction` or `PhasedScriptAction` that execute **shell commands**. The `upgrade-interactive` command is not a shell command -- it's an interactive TypeScript workflow that needs programmatic access to `RushConfiguration` and `PackageJsonUpdater`.

This means the plugin would need to either:
- Define a `global` command in `command-line.json` pointing to a shell script/binary that uses `@rushstack/rush-sdk` for Rush API access
- Or implement a new pattern where the plugin's `apply()` method hooks into the `initialize` or command-specific hooks to intercept execution

#### Autoinstaller system

The autoinstaller system at [`libraries/rush-lib/src/logic/Autoinstaller.ts`](https://github.com/microsoft/rushstack/blob/d61ddd6d2652ce142803db3c73058c06415edaab/libraries/rush-lib/src/logic/Autoinstaller.ts) manages isolated dependency folders under `common/autoinstallers/`. It:
- Acquires file locks to prevent concurrent installs
- Checks `LastInstallFlag` for staleness
- Runs `<packageManager> install --frozen-lockfile` when needed
- Global commands with `autoinstallerName` automatically get the autoinstaller's `node_modules/.bin` on PATH

## Code References

### upgrade-interactive implementation files
- `libraries/rush-lib/src/cli/actions/UpgradeInteractiveAction.ts` -- CLI action class (87 lines)
- `libraries/rush-lib/src/cli/RushCommandLineParser.ts:348` -- Registration point
- `libraries/rush-lib/src/logic/InteractiveUpgrader.ts` -- Interactive prompt orchestration (78 lines)
- `libraries/rush-lib/src/utilities/InteractiveUpgradeUI.ts` -- Checkbox dependency selection UI (222 lines)
- `libraries/rush-lib/src/utilities/prompts/SearchListPrompt.ts` -- Filterable list prompt (295 lines)
- `libraries/rush-lib/src/logic/PackageJsonUpdater.ts:120-244` -- `doRushUpgradeAsync()` (shared with `rush add`/`rush remove`)
- `libraries/rush-lib/src/logic/PackageJsonUpdaterTypes.ts` -- Shared types (88 lines)
- `libraries/npm-check-fork/` -- npm registry client and dependency comparison (7 source files)

### Plugin infrastructure files
- `libraries/rush-lib/src/pluginFramework/IRushPlugin.ts:10-12` -- Plugin interface
- `libraries/rush-lib/src/pluginFramework/PluginManager.ts` -- Plugin orchestration
- `libraries/rush-lib/src/pluginFramework/PluginLoader/BuiltInPluginLoader.ts` -- Built-in plugin loading
- `libraries/rush-lib/src/pluginFramework/PluginLoader/AutoinstallerPluginLoader.ts` -- Autoinstaller plugin loading
- `libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts` -- Base loader with manifest handling
- `libraries/rush-lib/src/pluginFramework/RushSession.ts` -- Session object with hooks and registration APIs
- `libraries/rush-lib/src/pluginFramework/RushLifeCycle.ts` -- Lifecycle hooks (8 hooks)
- `libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts` -- Operation-level hooks (10 hooks)
- `libraries/rush-lib/src/schemas/rush-plugin-manifest.schema.json` -- Plugin manifest schema
- `libraries/rush-lib/src/schemas/rush-plugins.schema.json` -- User plugin config schema

### Example plugins to model after
- `rush-plugins/rush-amazon-s3-build-cache-plugin/` -- Simplest built-in plugin pattern
- `rush-plugins/rush-serve-plugin/` -- Hooks phased commands, receives options
- `rush-plugins/rush-redis-cobuild-plugin/` -- Autoinstaller plugin with options
- `rush-plugins/rush-resolver-cache-plugin/` -- Plugin defined inline in index.ts

## Architecture Documentation

### Plugin loading flow (at Rush startup)
1. `RushCommandLineParser` constructor creates `PluginManager`
2. `PluginManager` registers built-in plugins (from rush-lib dependencies) and autoinstaller plugins (from `rush-plugins.json`)
3. Plugin command-line configs are read from cached manifests (no autoinstaller install needed yet)
4. Plugin commands are registered as `GlobalScriptAction` or `PhasedScriptAction`
5. At `executeAsync()`, unassociated plugins are initialized (autoinstallers prepared, plugins loaded and `apply()` called)
6. At action execution, associated plugins are initialized for the specific command

### Built-in plugin bundling pattern
1. Plugin package lives in `rush-plugins/` directory
2. Plugin is listed as `publishOnlyDependencies` in `libraries/rush-lib/package.json`
3. `PluginManager.tryAddBuiltInPlugin()` registers it by resolving from rush-lib's dependencies
4. `BuiltInPluginLoader` loads it directly (no autoinstaller needed)

## Historical Context (from research/)

The following sub-research documents were created during this investigation:
- `research/docs/2026-02-07-upgrade-interactive-implementation.md` -- Full implementation analysis of the upgrade-interactive command
- `research/docs/2026-02-07-rush-plugin-architecture.md` -- Complete documentation of the Rush plugin/autoinstaller architecture
- `research/docs/2026-02-07-existing-rush-plugins.md` -- Survey of all 10 existing Rush plugins with code examples
- `research/docs/2026-02-07-plugin-command-registration.md` -- Plugin command discovery, loading, and registration flow

## Related Research

- `research/docs/2026-02-07-upgrade-interactive-implementation.md`
- `research/docs/2026-02-07-rush-plugin-architecture.md`
- `research/docs/2026-02-07-existing-rush-plugins.md`
- `research/docs/2026-02-07-plugin-command-registration.md`

## Open Questions

1. **Plugin command mechanism**: The `upgrade-interactive` command is an interactive TypeScript workflow, not a shell command. Existing plugin commands (via `commandLineJsonFilePath`) create `GlobalScriptAction` / `PhasedScriptAction` that execute shell commands. A new plugin would need to determine how to expose a programmatic TypeScript command -- either via the shell command + `@rushstack/rush-sdk` pattern, or via a new hook/registration mechanism.

2. **Shared code boundary**: `PackageJsonUpdater.doRushUpgradeAsync()` is shared with `rush add` and `rush remove`. The plugin would need to either: (a) access `PackageJsonUpdater` via `@rushstack/rush-sdk`, (b) duplicate the relevant logic, or (c) expose it as a public API from rush-lib.

3. **Built-in vs autoinstaller**: Should the plugin be a **built-in plugin** (bundled with rush-lib like the cache plugins) or a fully external **autoinstaller plugin**? Built-in would be simpler for users (no config needed) but wouldn't reduce rush-lib's dependency footprint. Autoinstaller would truly decouple the dependencies but require user configuration.

4. **`@rushstack/npm-check-fork` disposition**: This package is currently only used by `upgrade-interactive`. It could either become a dependency of the new plugin package directly, or remain a standalone library that the plugin depends on.

5. **Dependencies like `inquirer`, `cli-table`, `rxjs`, `figures`**: Are these used anywhere else in rush-lib? If they are exclusively for `upgrade-interactive`, they can be removed from rush-lib when the feature is extracted. This needs verification.

6. **`SearchListPrompt` reusability**: The custom filterable list prompt is currently only used by `upgrade-interactive`. Could it be useful to other features, or should it move entirely into the plugin?
