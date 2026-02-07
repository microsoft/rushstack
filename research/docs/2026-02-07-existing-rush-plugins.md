# Existing Rush Plugins in the rushstack Monorepo

**Date**: 2026-02-07
**Scope**: All plugins under `/workspaces/rushstack/rush-plugins/` and related plugin infrastructure in `libraries/rush-lib/`.

---

## Table of Contents

1. [Overview of All Plugins](#overview-of-all-plugins)
2. [Plugin Infrastructure](#plugin-infrastructure)
3. [Plugin Details](#plugin-details)
   - [rush-amazon-s3-build-cache-plugin](#1-rush-amazon-s3-build-cache-plugin)
   - [rush-azure-storage-build-cache-plugin](#2-rush-azure-storage-build-cache-plugin)
   - [rush-http-build-cache-plugin](#3-rush-http-build-cache-plugin)
   - [rush-redis-cobuild-plugin](#4-rush-redis-cobuild-plugin)
   - [rush-serve-plugin](#5-rush-serve-plugin)
   - [rush-bridge-cache-plugin](#6-rush-bridge-cache-plugin)
   - [rush-buildxl-graph-plugin](#7-rush-buildxl-graph-plugin)
   - [rush-resolver-cache-plugin](#8-rush-resolver-cache-plugin)
   - [rush-litewatch-plugin](#9-rush-litewatch-plugin)
   - [rush-mcp-docs-plugin](#10-rush-mcp-docs-plugin)
4. [Built-in vs Autoinstalled Plugin Loading](#built-in-vs-autoinstalled-plugin-loading)
5. [Test Plugin Examples](#test-plugin-examples)

---

## Overview of All Plugins

The `rush-plugins/` directory contains 10 plugin packages:

| Plugin Package | NPM Name | Version | Status | Plugin Type |
|---|---|---|---|---|
| rush-amazon-s3-build-cache-plugin | `@rushstack/rush-amazon-s3-build-cache-plugin` | 5.167.0 | Published, **Built-in** | Cloud build cache provider |
| rush-azure-storage-build-cache-plugin | `@rushstack/rush-azure-storage-build-cache-plugin` | 5.167.0 | Published, **Built-in** | Cloud build cache provider + auth |
| rush-http-build-cache-plugin | `@rushstack/rush-http-build-cache-plugin` | 5.167.0 | Published, **Built-in** | Cloud build cache provider |
| rush-redis-cobuild-plugin | `@rushstack/rush-redis-cobuild-plugin` | 5.167.0 | Published | Cobuild lock provider |
| rush-serve-plugin | `@rushstack/rush-serve-plugin` | 5.167.0 | Published | Phased command (serve files) |
| rush-bridge-cache-plugin | `@rushstack/rush-bridge-cache-plugin` | 5.167.0 | Published | Phased command (cache read/write) |
| rush-buildxl-graph-plugin | `@rushstack/rush-buildxl-graph-plugin` | 5.167.0 | Published | Phased command (graph export) |
| rush-resolver-cache-plugin | `@rushstack/rush-resolver-cache-plugin` | 5.167.0 | Published | After-install hook |
| rush-litewatch-plugin | `@rushstack/rush-litewatch-plugin` | 0.0.0 | Private, not implemented | N/A |
| rush-mcp-docs-plugin | `@rushstack/rush-mcp-docs-plugin` | 0.2.14 | Published | MCP server plugin (different interface) |

---

## Plugin Infrastructure

### The IRushPlugin Interface

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/IRushPlugin.ts:10-12`

```typescript
export interface IRushPlugin {
  apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void;
}
```

Every Rush plugin must implement this interface. The `apply` method receives a `RushSession` (which provides hooks and registration methods) and the `RushConfiguration`.

### RushSession Hooks (RushLifecycleHooks)

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/RushLifeCycle.ts:53-114`

```typescript
export class RushLifecycleHooks {
  // Runs before executing any Rush CLI Command
  public readonly initialize: AsyncSeriesHook<IRushCommand>;

  // Runs before any global Rush CLI Command
  public readonly runAnyGlobalCustomCommand: AsyncSeriesHook<IGlobalCommand>;

  // Hook map for specific named global commands
  public readonly runGlobalCustomCommand: HookMap<AsyncSeriesHook<IGlobalCommand>>;

  // Runs before any phased Rush CLI Command
  public readonly runAnyPhasedCommand: AsyncSeriesHook<IPhasedCommand>;

  // Hook map for specific named phased commands
  public readonly runPhasedCommand: HookMap<AsyncSeriesHook<IPhasedCommand>>;

  // Runs between preparing common/temp and invoking package manager
  public readonly beforeInstall: AsyncSeriesHook<[command, subspace, variant]>;

  // Runs after a successful install
  public readonly afterInstall: AsyncSeriesHook<[command, subspace, variant]>;

  // Allows plugins to process telemetry data
  public readonly flushTelemetry: AsyncParallelHook<[ReadonlyArray<ITelemetryData>]>;
}
```

### PhasedCommandHooks

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PhasedCommandHooks.ts:146-216`

```typescript
export class PhasedCommandHooks {
  public readonly createOperations: AsyncSeriesWaterfallHook<[Set<Operation>, ICreateOperationsContext]>;
  public readonly beforeExecuteOperations: AsyncSeriesHook<[Map<Operation, IOperationExecutionResult>, IExecuteOperationsContext]>;
  public readonly onOperationStatusChanged: SyncHook<[IOperationExecutionResult]>;
  public readonly afterExecuteOperations: AsyncSeriesHook<[IExecutionResult, IExecuteOperationsContext]>;
  public readonly beforeExecuteOperation: AsyncSeriesBailHook<[IOperationRunnerContext & IOperationExecutionResult], OperationStatus | undefined>;
  public readonly createEnvironmentForOperation: SyncWaterfallHook<[IEnvironment, IOperationRunnerContext & IOperationExecutionResult]>;
  public readonly afterExecuteOperation: AsyncSeriesHook<[IOperationRunnerContext & IOperationExecutionResult]>;
  public readonly shutdownAsync: AsyncParallelHook<void>;
  public readonly waitingForChanges: SyncHook<void>;
  public readonly beforeLog: SyncHook<ITelemetryData, void>;
}
```

### RushSession Registration Methods

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/RushSession.ts:39-104`

```typescript
export class RushSession {
  public readonly hooks: RushLifecycleHooks;

  public getLogger(name: string): ILogger;
  public get terminalProvider(): ITerminalProvider;

  // Register a factory for cloud build cache providers (e.g., 'amazon-s3', 'azure-blob-storage', 'http')
  public registerCloudBuildCacheProviderFactory(
    cacheProviderName: string,
    factory: CloudBuildCacheProviderFactory
  ): void;

  // Register a factory for cobuild lock providers (e.g., 'redis')
  public registerCobuildLockProviderFactory(
    cobuildLockProviderName: string,
    factory: CobuildLockProviderFactory
  ): void;
}
```

### rush-plugin-manifest.json Schema

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/schemas/rush-plugin-manifest.schema.json`

Each plugin package contains a `rush-plugin-manifest.json` at its root. The schema fields:

```json
{
  "plugins": [
    {
      "pluginName": "(required) string",
      "description": "(required) string",
      "entryPoint": "(optional) path to JS module relative to package folder",
      "optionsSchema": "(optional) path to JSON schema for plugin config file",
      "associatedCommands": "(optional) array of command names - plugin only loaded for these commands",
      "commandLineJsonFilePath": "(optional) path to command-line.json for custom CLI commands"
    }
  ]
}
```

### rush-plugins.json Configuration Schema

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/schemas/rush-plugins.schema.json`

Users configure which plugins to load in `common/config/rush/rush-plugins.json`:

```json
{
  "plugins": [
    {
      "packageName": "(required) NPM package name",
      "pluginName": "(required) matches pluginName in rush-plugin-manifest.json",
      "autoinstallerName": "(required) name of Rush autoinstaller"
    }
  ]
}
```

### Plugin Options File Convention

Plugin options are stored in `common/config/rush-plugins/<pluginName>.json`. The schema is validated against the `optionsSchema` path defined in the plugin manifest.

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts:187-189`

```typescript
protected _getPluginOptionsJsonFilePath(): string {
  return path.join(this._rushConfiguration.rushPluginOptionsFolder, `${this.pluginName}.json`);
}
```

---

## Plugin Details

### 1. rush-amazon-s3-build-cache-plugin

**Package**: `@rushstack/rush-amazon-s3-build-cache-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/`
**Built-in**: Yes (loaded by default as a dependency of rush-lib)
**Entry point**: `lib/index.js` (maps to `src/index.ts`)

#### package.json

**Found in**: `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/package.json`

```json
{
  "name": "@rushstack/rush-amazon-s3-build-cache-plugin",
  "version": "5.167.0",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "dependencies": {
    "@rushstack/credential-cache": "workspace:*",
    "@rushstack/node-core-library": "workspace:*",
    "@rushstack/rush-sdk": "workspace:*",
    "@rushstack/terminal": "workspace:*",
    "https-proxy-agent": "~5.0.0"
  }
}
```

#### rush-plugin-manifest.json

**Found in**: `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/rush-plugin-manifest.json`

```json
{
  "plugins": [
    {
      "pluginName": "rush-amazon-s3-build-cache-plugin",
      "description": "Rush plugin for Amazon S3 cloud build cache",
      "entryPoint": "lib/index.js",
      "optionsSchema": "lib/schemas/amazon-s3-config.schema.json"
    }
  ]
}
```

#### Entry Point (src/index.ts)

**Found in**: `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/src/index.ts:1-16`

```typescript
import { RushAmazonS3BuildCachePlugin } from './RushAmazonS3BuildCachePlugin';

export { type IAmazonS3Credentials } from './AmazonS3Credentials';
export { AmazonS3Client } from './AmazonS3Client';
export default RushAmazonS3BuildCachePlugin;
export type {
  IAmazonS3BuildCacheProviderOptionsBase,
  IAmazonS3BuildCacheProviderOptionsAdvanced,
  IAmazonS3BuildCacheProviderOptionsSimple
} from './AmazonS3BuildCacheProvider';
```

#### Plugin Class

**Found in**: `/workspaces/rushstack/rush-plugins/rush-amazon-s3-build-cache-plugin/src/RushAmazonS3BuildCachePlugin.ts:46-100`

```typescript
export class RushAmazonS3BuildCachePlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.registerCloudBuildCacheProviderFactory('amazon-s3', async (buildCacheConfig) => {
        type IBuildCache = typeof buildCacheConfig & {
          amazonS3Configuration: IAmazonS3ConfigurationJson;
        };
        const { amazonS3Configuration } = buildCacheConfig as IBuildCache;
        // ... validation and options construction ...
        const { AmazonS3BuildCacheProvider } = await import('./AmazonS3BuildCacheProvider');
        return new AmazonS3BuildCacheProvider(options, rushSession);
      });
    });
  }
}
```

**Key patterns**:
- Uses `rushSession.hooks.initialize.tap()` to register during initialization
- Calls `rushSession.registerCloudBuildCacheProviderFactory()` with a factory name ('amazon-s3')
- Uses dynamic `import()` inside the factory for lazy loading of the provider implementation
- The default export from `src/index.ts` is the plugin class itself

---

### 2. rush-azure-storage-build-cache-plugin

**Package**: `@rushstack/rush-azure-storage-build-cache-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-azure-storage-build-cache-plugin/`
**Built-in**: Yes
**Entry point**: `lib/index.js`

This package provides **two plugins** in a single package.

#### rush-plugin-manifest.json

**Found in**: `/workspaces/rushstack/rush-plugins/rush-azure-storage-build-cache-plugin/rush-plugin-manifest.json`

```json
{
  "plugins": [
    {
      "pluginName": "rush-azure-storage-build-cache-plugin",
      "description": "Rush plugin for Azure storage cloud build cache",
      "entryPoint": "lib/index.js",
      "optionsSchema": "lib/schemas/azure-blob-storage-config.schema.json"
    },
    {
      "pluginName": "rush-azure-interactive-auth-plugin",
      "description": "Rush plugin for interactive authentication to Azure",
      "entryPoint": "lib/RushAzureInteractiveAuthPlugin.js",
      "optionsSchema": "lib/schemas/azure-interactive-auth.schema.json"
    }
  ]
}
```

#### Primary Plugin (RushAzureStorageBuildCachePlugin)

**Found in**: `/workspaces/rushstack/rush-plugins/rush-azure-storage-build-cache-plugin/src/RushAzureStorageBuildCachePlugin.ts:59-83`

```typescript
export class RushAzureStorageBuildCachePlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.registerCloudBuildCacheProviderFactory('azure-blob-storage', async (buildCacheConfig) => {
        type IBuildCache = typeof buildCacheConfig & {
          azureBlobStorageConfiguration: IAzureBlobStorageConfigurationJson;
        };
        const { azureBlobStorageConfiguration } = buildCacheConfig as IBuildCache;
        const { AzureStorageBuildCacheProvider } = await import('./AzureStorageBuildCacheProvider');
        return new AzureStorageBuildCacheProvider({ /* ... options ... */ });
      });
    });
  }
}
```

#### Secondary Plugin (RushAzureInteractiveAuthPlugin)

**Found in**: `/workspaces/rushstack/rush-plugins/rush-azure-storage-build-cache-plugin/src/RushAzureInteractiveAuthPlugin.ts:62-124`

```typescript
export default class RushAzureInteractieAuthPlugin implements IRushPlugin {
  private readonly _options: IAzureInteractiveAuthOptions | undefined;
  public readonly pluginName: 'AzureInteractiveAuthPlugin' = PLUGIN_NAME;

  public constructor(options: IAzureInteractiveAuthOptions | undefined) {
    this._options = options;
  }

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    const options: IAzureInteractiveAuthOptions | undefined = this._options;
    if (!options) { return; } // Plugin is not enabled if no config.

    const { globalCommands, phasedCommands } = options;
    const { hooks } = rushSession;

    const handler: () => Promise<void> = async () => {
      const { AzureStorageAuthentication } = await import('./AzureStorageAuthentication');
      // ... perform authentication ...
    };

    if (globalCommands) {
      for (const commandName of globalCommands) {
        hooks.runGlobalCustomCommand.for(commandName).tapPromise(PLUGIN_NAME, handler);
      }
    }
    if (phasedCommands) {
      for (const commandName of phasedCommands) {
        hooks.runPhasedCommand.for(commandName).tapPromise(PLUGIN_NAME, handler);
      }
    }
  }
}
```

**Key patterns**:
- One NPM package can expose multiple plugins via `rush-plugin-manifest.json`
- Uses `hooks.runGlobalCustomCommand.for(commandName)` and `hooks.runPhasedCommand.for(commandName)` to target specific commands
- Constructor receives options (from the options JSON file); if options are undefined, the plugin is a no-op
- Uses dynamic `import()` for lazy loading

---

### 3. rush-http-build-cache-plugin

**Package**: `@rushstack/rush-http-build-cache-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-http-build-cache-plugin/`
**Built-in**: Yes
**Entry point**: `lib/index.js`

#### Plugin Class

**Found in**: `/workspaces/rushstack/rush-plugins/rush-http-build-cache-plugin/src/RushHttpBuildCachePlugin.ts:52-82`

```typescript
export class RushHttpBuildCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    rushSession.hooks.initialize.tap(this.pluginName, () => {
      rushSession.registerCloudBuildCacheProviderFactory('http', async (buildCacheConfig) => {
        const config: IRushHttpBuildCachePluginConfig = (
          buildCacheConfig as typeof buildCacheConfig & {
            httpConfiguration: IRushHttpBuildCachePluginConfig;
          }
        ).httpConfiguration;
        // ... extract options ...
        const { HttpBuildCacheProvider } = await import('./HttpBuildCacheProvider');
        return new HttpBuildCacheProvider(options, rushSession);
      });
    });
  }
}
```

Same pattern as the other cache provider plugins: `hooks.initialize.tap` + `registerCloudBuildCacheProviderFactory`.

---

### 4. rush-redis-cobuild-plugin

**Package**: `@rushstack/rush-redis-cobuild-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-redis-cobuild-plugin/`
**Built-in**: No (must be configured as autoinstalled plugin)
**Entry point**: `lib/index.js`

#### Plugin Class

**Found in**: `/workspaces/rushstack/rush-plugins/rush-redis-cobuild-plugin/src/RushRedisCobuildPlugin.ts:24-41`

```typescript
export class RushRedisCobuildPlugin implements IRushPlugin {
  public pluginName: string = PLUGIN_NAME;
  private _options: IRushRedisCobuildPluginOptions;

  public constructor(options: IRushRedisCobuildPluginOptions) {
    this._options = options;
  }

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    rushSession.hooks.initialize.tap(PLUGIN_NAME, () => {
      rushSession.registerCobuildLockProviderFactory('redis', (): RedisCobuildLockProvider => {
        const options: IRushRedisCobuildPluginOptions = this._options;
        return new RedisCobuildLockProviderModule.RedisCobuildLockProvider(options, rushSession);
      });
    });
  }
}
```

**Key patterns**:
- Uses `registerCobuildLockProviderFactory` instead of `registerCloudBuildCacheProviderFactory`
- Uses `Import.lazy()` for lazy loading (different from dynamic `import()`)
- Constructor accepts options from the JSON config file

---

### 5. rush-serve-plugin

**Package**: `@rushstack/rush-serve-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-serve-plugin/`
**Built-in**: No
**Entry point**: `lib-commonjs/index.js` (note: different output directory)
**Has exports map**: Yes

#### package.json Exports

**Found in**: `/workspaces/rushstack/rush-plugins/rush-serve-plugin/package.json:41-60`

```json
{
  "main": "lib-commonjs/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "require": "./lib/index.js",
      "types": "./dist/rush-serve-plugin.d.ts"
    },
    "./api": {
      "types": "./lib/api.types.d.ts"
    },
    "./package.json": "./package.json"
  }
}
```

#### Plugin Class

**Found in**: `/workspaces/rushstack/rush-plugins/rush-serve-plugin/src/RushServePlugin.ts:54-108`

```typescript
export class RushServePlugin implements IRushPlugin {
  public readonly pluginName: 'RushServePlugin' = PLUGIN_NAME;

  private readonly _phasedCommands: Set<string>;
  private readonly _portParameterLongName: string | undefined;
  private readonly _globalRoutingRules: IGlobalRoutingRuleJson[];
  private readonly _logServePath: string | undefined;
  private readonly _buildStatusWebSocketPath: string | undefined;

  public constructor(options: IRushServePluginOptions) {
    this._phasedCommands = new Set(options.phasedCommands);
    this._portParameterLongName = options.portParameterLongName;
    this._globalRoutingRules = options.globalRouting ?? [];
    this._logServePath = options.logServePath;
    this._buildStatusWebSocketPath = options.buildStatusWebSocketPath;
  }

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    const handler: (command: IPhasedCommand) => Promise<void> = async (command: IPhasedCommand) => {
      // ... convert global routing rules ...
      // Defer importing the implementation until this plugin is actually invoked.
      await (
        await import('./phasedCommandHandler')
      ).phasedCommandHandler({
        rushSession, rushConfiguration, command,
        portParameterLongName: this._portParameterLongName,
        logServePath: this._logServePath,
        globalRoutingRules,
        buildStatusWebSocketPath: this._buildStatusWebSocketPath
      });
    };

    for (const commandName of this._phasedCommands) {
      rushSession.hooks.runPhasedCommand.for(commandName).tapPromise(PLUGIN_NAME, handler);
    }
  }
}
```

**Key patterns**:
- Uses `hooks.runPhasedCommand.for(commandName).tapPromise()` to hook specific named phased commands
- Constructor receives options that specify which commands to apply to
- Defers heavy imports until the plugin is actually invoked (lazy loading pattern)
- Has a per-project configuration schema (`rush-project-serve.schema.json`)

#### Per-Project Configuration

**Found in**: `/workspaces/rushstack/rush-plugins/rush-serve-plugin/src/schemas/rush-project-serve.schema.json`

This plugin also uses per-project configuration files with routing rules for individual projects.

---

### 6. rush-bridge-cache-plugin

**Package**: `@rushstack/rush-bridge-cache-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-bridge-cache-plugin/`
**Built-in**: No
**Entry point**: `lib/index.js`

#### Plugin Class

**Found in**: `/workspaces/rushstack/rush-plugins/rush-bridge-cache-plugin/src/BridgeCachePlugin.ts:31-244`

```typescript
export class BridgeCachePlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private readonly _actionParameterName: string;
  private readonly _requireOutputFoldersParameterName: string | undefined;

  public constructor(options: IBridgeCachePluginOptions) {
    this._actionParameterName = options.actionParameterName;
    this._requireOutputFoldersParameterName = options.requireOutputFoldersParameterName;
    if (!this._actionParameterName) {
      throw new Error('The "actionParameterName" option must be provided...');
    }
  }

  public apply(session: RushSession): void {
    session.hooks.runAnyPhasedCommand.tapPromise(PLUGIN_NAME, async (command: IPhasedCommand) => {
      const logger: ILogger = session.getLogger(PLUGIN_NAME);

      command.hooks.createOperations.tap(
        { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
        (operations: Set<Operation>, context: ICreateOperationsContext): Set<Operation> => {
          // Disable all operations so the plugin can handle cache read/write
          const { customParameters } = context;
          cacheAction = this._getCacheAction(customParameters);
          if (cacheAction !== undefined) {
            for (const operation of operations) {
              operation.enabled = false;
            }
          }
          return operations;
        }
      );

      command.hooks.beforeExecuteOperations.tapPromise(PLUGIN_NAME, async (recordByOperation, context) => {
        // Perform cache read or write for each operation
        // ...
      });
    });
  }
}
```

**Key patterns**:
- Uses `hooks.runAnyPhasedCommand.tapPromise()` to hook ALL phased commands
- Inside the command hook, taps into `command.hooks.createOperations` and `command.hooks.beforeExecuteOperations` (nested hooking)
- Uses `{ name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER }` to ensure the hook runs after other plugins
- Reads custom parameters via `context.customParameters.get(parameterName)`
- Validates constructor options and throws if required options are missing

---

### 7. rush-buildxl-graph-plugin

**Package**: `@rushstack/rush-buildxl-graph-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-buildxl-graph-plugin/`
**Built-in**: No
**Entry point**: `lib/index.js`

#### Plugin Class

**Found in**: `/workspaces/rushstack/rush-plugins/rush-buildxl-graph-plugin/src/DropBuildGraphPlugin.ts:46-111`

```typescript
export class DropBuildGraphPlugin implements IRushPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private readonly _buildXLCommandNames: string[];

  public constructor(options: IDropGraphPluginOptions) {
    this._buildXLCommandNames = options.buildXLCommandNames;
  }

  public apply(session: RushSession, rushConfiguration: RushConfiguration): void {
    async function handleCreateOperationsForCommandAsync(
      commandName: string, operations: Set<Operation>, context: ICreateOperationsContext
    ): Promise<Set<Operation>> {
      const dropGraphParameter: CommandLineStringParameter | undefined = context.customParameters.get(
        DROP_GRAPH_PARAMETER_LONG_NAME
      ) as CommandLineStringParameter;
      // ... validate parameter, drop graph, return empty set to skip execution ...
    }

    for (const buildXLCommandName of this._buildXLCommandNames) {
      session.hooks.runPhasedCommand.for(buildXLCommandName).tap(PLUGIN_NAME, (command: IPhasedCommand) => {
        command.hooks.createOperations.tapPromise(
          { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
          async (operations: Set<Operation>, context: ICreateOperationsContext) =>
            await handleCreateOperationsForCommandAsync(command.actionName, operations, context)
        );
      });
    }
  }
}
```

**Key patterns**:
- Iterates over configured command names and hooks each one via `hooks.runPhasedCommand.for(commandName).tap()`
- Inside each command hook, taps `command.hooks.createOperations.tapPromise()` with `stage: Number.MAX_SAFE_INTEGER`
- Returns empty `Set` from `createOperations` to prevent actual execution when graph is being dropped

---

### 8. rush-resolver-cache-plugin

**Package**: `@rushstack/rush-resolver-cache-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-resolver-cache-plugin/`
**Built-in**: No
**Entry point**: `lib/index.js` (exports map also uses `lib-commonjs/index.js`)

#### Plugin Class (Inline in index.ts)

**Found in**: `/workspaces/rushstack/rush-plugins/rush-resolver-cache-plugin/src/index.ts:4-51`

```typescript
export default class RushResolverCachePlugin implements IRushPlugin {
  public readonly pluginName: 'RushResolverCachePlugin' = 'RushResolverCachePlugin';

  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    rushSession.hooks.afterInstall.tapPromise(
      this.pluginName,
      async (command: IRushCommand, subspace: Subspace, variant: string | undefined) => {
        const logger: ILogger = rushSession.getLogger('RushResolverCachePlugin');

        if (rushConfiguration.packageManager !== 'pnpm') {
          logger.emitError(new Error('... currently only supports the "pnpm" package manager'));
          return;
        }

        const pnpmMajorVersion: number = parseInt(rushConfiguration.packageManagerToolVersion, 10);
        if (pnpmMajorVersion < 8) {
          logger.emitError(new Error('... currently only supports pnpm version >=8'));
          return;
        }

        const { afterInstallAsync } = await import('./afterInstallAsync');
        await afterInstallAsync(rushSession, rushConfiguration, subspace, variant, logger);
      }
    );
  }
}
```

**Key patterns**:
- Uses `hooks.afterInstall.tapPromise()` -- the only plugin that hooks into the install lifecycle
- Plugin class is defined directly in `index.ts` (no separate class file)
- Uses dynamic `import()` with webpack chunk hint comments for future-proofing
- Validates prerequisites (pnpm, version >= 8) before running
- No `optionsSchema` in its manifest (no configuration file needed)

---

### 9. rush-litewatch-plugin

**Package**: `@rushstack/rush-litewatch-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-litewatch-plugin/`
**Built-in**: No
**Status**: Private, not implemented

#### Entry Point

**Found in**: `/workspaces/rushstack/rush-plugins/rush-litewatch-plugin/src/index.ts:1-4`

```typescript
throw new Error('Plugin is not implemented yet');
```

---

### 10. rush-mcp-docs-plugin

**Package**: `@rushstack/rush-mcp-docs-plugin`
**Path**: `/workspaces/rushstack/rush-plugins/rush-mcp-docs-plugin/`
**Built-in**: No
**Status**: Published (v0.2.14)

This plugin uses a **different plugin interface** (`IRushMcpPlugin` / `RushMcpPluginFactory` from `@rushstack/mcp-server`) and is not a standard Rush CLI plugin.

#### Entry Point

**Found in**: `/workspaces/rushstack/rush-plugins/rush-mcp-docs-plugin/src/index.ts:1-15`

```typescript
import type { RushMcpPluginSession, RushMcpPluginFactory } from '@rushstack/mcp-server';
import { DocsPlugin, type IDocsPluginConfigFile } from './DocsPlugin';

function createPlugin(
  session: RushMcpPluginSession,
  configFile: IDocsPluginConfigFile | undefined
): DocsPlugin {
  return new DocsPlugin(session, configFile);
}

export default createPlugin satisfies RushMcpPluginFactory<IDocsPluginConfigFile>;
```

#### Plugin Class

**Found in**: `/workspaces/rushstack/rush-plugins/rush-mcp-docs-plugin/src/DocsPlugin.ts:1-29`

```typescript
export class DocsPlugin implements IRushMcpPlugin {
  public session: RushMcpPluginSession;
  public configFile: IDocsPluginConfigFile | undefined = undefined;

  public constructor(session: RushMcpPluginSession, configFile: IDocsPluginConfigFile | undefined) {
    this.session = session;
    this.configFile = configFile;
  }

  public async onInitializeAsync(): Promise<void> {
    this.session.registerTool(
      {
        toolName: 'rush_docs',
        description: 'Search and retrieve relevant sections from the official Rush documentation...'
      },
      new DocsTool(this)
    );
  }
}
```

**Key patterns**:
- Default export is a factory function (not a class) that `satisfies RushMcpPluginFactory`
- Implements `IRushMcpPlugin` with `onInitializeAsync()` method instead of `IRushPlugin.apply()`
- Registers MCP tools via `session.registerTool()`
- This is a distinct plugin system from the Rush CLI plugins

---

## Built-in vs Autoinstalled Plugin Loading

### Built-in Plugins (Loaded by Default)

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginManager.ts:64-91`

Three plugins (plus the secondary Azure auth plugin) are registered as built-in:

```typescript
tryAddBuiltInPlugin('rush-amazon-s3-build-cache-plugin');
tryAddBuiltInPlugin('rush-azure-storage-build-cache-plugin');
tryAddBuiltInPlugin('rush-http-build-cache-plugin');
tryAddBuiltInPlugin(
  'rush-azure-interactive-auth-plugin',
  '@rushstack/rush-azure-storage-build-cache-plugin'
);
```

These are declared as `publishOnlyDependencies` in rush-lib's package.json:

**Found in**: `/workspaces/rushstack/libraries/rush-lib/package.json:93-97`

```json
{
  "publishOnlyDependencies": {
    "@rushstack/rush-amazon-s3-build-cache-plugin": "workspace:*",
    "@rushstack/rush-azure-storage-build-cache-plugin": "workspace:*",
    "@rushstack/rush-http-build-cache-plugin": "workspace:*"
  }
}
```

The `tryAddBuiltInPlugin` function resolves the package from `@microsoft/rush-lib`'s own dependencies:

```typescript
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
```

### BuiltInPluginLoader

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/BuiltInPluginLoader.ts:18-25`

```typescript
export class BuiltInPluginLoader extends PluginLoaderBase<IBuiltInPluginConfiguration> {
  public readonly packageFolder: string;

  public constructor(options: IPluginLoaderOptions<IBuiltInPluginConfiguration>) {
    super(options);
    this.packageFolder = options.pluginConfiguration.pluginPackageFolder;
  }
}
```

### AutoinstallerPluginLoader

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/AutoinstallerPluginLoader.ts:33-48`

```typescript
export class AutoinstallerPluginLoader extends PluginLoaderBase<IRushPluginConfiguration> {
  public readonly packageFolder: string;
  public readonly autoinstaller: Autoinstaller;

  public constructor(options: IAutoinstallerPluginLoaderOptions) {
    super(options);
    this.autoinstaller = new Autoinstaller({
      autoinstallerName: options.pluginConfiguration.autoinstallerName,
      rushConfiguration: this._rushConfiguration,
      restrictConsoleOutput: options.restrictConsoleOutput,
      rushGlobalFolder: options.rushGlobalFolder
    });
    this.packageFolder = path.join(this.autoinstaller.folderFullPath, 'node_modules', this.packageName);
  }
}
```

### Plugin Loading and Apply Flow

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginLoader/PluginLoaderBase.ts:70-80` and `:123-149`

```typescript
// In PluginLoaderBase:
public load(): IRushPlugin | undefined {
  const resolvedPluginPath: string | undefined = this._resolvePlugin();
  if (!resolvedPluginPath) { return undefined; }
  const pluginOptions: JsonObject = this._getPluginOptions();
  RushSdk.ensureInitialized();
  return this._loadAndValidatePluginPackage(resolvedPluginPath, pluginOptions);
}

private _loadAndValidatePluginPackage(resolvedPluginPath: string, options?: JsonObject): IRushPlugin {
  type IRushPluginCtor<T = JsonObject> = new (opts: T) => IRushPlugin;
  let pluginPackage: IRushPluginCtor;
  const loadedPluginPackage: IRushPluginCtor | { default: IRushPluginCtor } = require(resolvedPluginPath);
  pluginPackage = (loadedPluginPackage as { default: IRushPluginCtor }).default || loadedPluginPackage;
  const plugin: IRushPlugin = new pluginPackage(options);
  // validates that plugin.apply is a function
  return plugin;
}
```

**Key patterns**:
- The loader `require()`s the plugin's entry point
- It checks for a `.default` export (supporting `export default` pattern)
- It instantiates the plugin class with the options JSON object
- It validates that the resulting object has an `apply` function

### Plugin Initialization Order in PluginManager

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/pluginFramework/PluginManager.ts:152-165`

```typescript
public async tryInitializeUnassociatedPluginsAsync(): Promise<void> {
  try {
    const autoinstallerPluginLoaders = this._getUnassociatedPluginLoaders(this._autoinstallerPluginLoaders);
    await this._preparePluginAutoinstallersAsync(autoinstallerPluginLoaders);
    const builtInPluginLoaders = this._getUnassociatedPluginLoaders(this._builtInPluginLoaders);
    this._initializePlugins([...builtInPluginLoaders, ...autoinstallerPluginLoaders]);
  } catch (e) {
    this._error = e as Error;
  }
}
```

Built-in plugins are loaded first, then autoinstaller plugins. Plugins without `associatedCommands` are loaded eagerly; plugins with `associatedCommands` are loaded only when the associated command runs.

---

## Test Plugin Examples

### Test Plugin: rush-mock-flush-telemetry-plugin

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/cli/test/rush-mock-flush-telemetry-plugin/index.ts`

```typescript
export default class RushMockFlushTelemetryPlugin {
  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    async function flushTelemetry(data: ReadonlyArray<ITelemetryData>): Promise<void> {
      const targetPath: string = `${rushConfiguration.commonTempFolder}/test-telemetry.json`;
      await JsonFile.saveAsync(data, targetPath, { ignoreUndefinedValues: true });
    }
    rushSession.hooks.flushTelemetry.tapPromise(RushMockFlushTelemetryPlugin.name, flushTelemetry);
  }
}
```

Its rush-plugins.json configuration:

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/cli/test/tapFlushTelemetryAndRunBuildActionRepo/common/config/rush/rush-plugins.json`

```json
{
  "plugins": [
    {
      "packageName": "rush-mock-flush-telemetry-plugin",
      "pluginName": "rush-mock-flush-telemetry-plugin",
      "autoinstallerName": "plugins"
    }
  ]
}
```

Its autoinstaller package.json:

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/cli/test/tapFlushTelemetryAndRunBuildActionRepo/common/autoinstallers/plugins/package.json`

```json
{
  "name": "plugins",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "rush-mock-flush-telemetry-plugin": "file:../../../../rush-mock-flush-telemetry-plugin"
  }
}
```

### Test Plugin: rush-build-command-plugin (CLI Commands Only)

This test plugin demonstrates a plugin that defines only CLI commands (no entry point code).

**Found in**: `/workspaces/rushstack/libraries/rush-lib/src/cli/test/pluginWithBuildCommandRepo/common/autoinstallers/plugins/rush-plugins/rush-build-command-plugin/rush-plugin-manifest.json`

```json
{
  "plugins": [
    {
      "pluginName": "rush-build-command-plugin",
      "description": "Rush plugin for testing command line parameters"
    }
  ]
}
```

Its command-line.json:

**Found in**: `.../rush-build-command-plugin/rush-build-command-plugin/command-line.json`

```json
{
  "commands": [
    {
      "commandKind": "bulk",
      "name": "build",
      "summary": "Override build command summary in plugin",
      "enableParallelism": true,
      "allowWarningsInSuccessfulBuild": true
    }
  ]
}
```

---

## Summary of Hook Usage Patterns Across Plugins

| Hook / Registration Method | Plugins Using It |
|---|---|
| `hooks.initialize.tap()` + `registerCloudBuildCacheProviderFactory()` | amazon-s3, azure-storage, http |
| `hooks.initialize.tap()` + `registerCobuildLockProviderFactory()` | redis-cobuild |
| `hooks.runPhasedCommand.for(name).tapPromise()` | serve, buildxl-graph, azure-interactive-auth |
| `hooks.runPhasedCommand.for(name).tap()` | buildxl-graph |
| `hooks.runAnyPhasedCommand.tapPromise()` | bridge-cache |
| `hooks.runGlobalCustomCommand.for(name).tapPromise()` | azure-interactive-auth |
| `hooks.afterInstall.tapPromise()` | resolver-cache |
| `hooks.flushTelemetry.tapPromise()` | mock-flush-telemetry (test) |
| `command.hooks.createOperations.tap()` | bridge-cache |
| `command.hooks.createOperations.tapPromise()` | buildxl-graph |
| `command.hooks.beforeExecuteOperations.tapPromise()` | bridge-cache |

## Common Structural Patterns

1. **Default export**: All Rush CLI plugins use `export default PluginClass` from their `src/index.ts`
2. **pluginName property**: All plugins define a `public pluginName: string` or `public readonly pluginName: string` property
3. **Lazy imports**: Most plugins defer heavy `import()` calls to inside hook handlers
4. **Options via constructor**: Plugins that need configuration receive options through the constructor (which the plugin loader passes from the JSON config file)
5. **No CLI command definitions**: None of the production plugins in `rush-plugins/` define `commandLineJsonFilePath`; this feature is only demonstrated in test fixtures
6. **Options schema**: Most plugins define an `optionsSchema` in their manifest, pointing to a JSON schema in `src/schemas/`
7. **tapable hooks**: All plugins use the `tapable` library's tap/tapPromise patterns
8. **Stage ordering**: Plugins that need to run last use `{ name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER }`
