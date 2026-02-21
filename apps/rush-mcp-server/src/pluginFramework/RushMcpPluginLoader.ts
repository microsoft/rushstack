// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';

import { FileSystem, Import, JsonFile, type JsonObject, JsonSchema } from '@rushstack/node-core-library';
import { Autoinstaller } from '@rushstack/rush-sdk/lib/logic/Autoinstaller';
import { RushGlobalFolder } from '@rushstack/rush-sdk/lib/api/RushGlobalFolder';
import { RushConfiguration } from '@rushstack/rush-sdk/lib/api/RushConfiguration';

import type { IRushMcpPlugin, RushMcpPluginFactory } from './IRushMcpPlugin.ts';
import { RushMcpPluginSessionInternal } from './RushMcpPluginSession.ts';
import rushMcpJsonSchemaObject from '../schemas/rush-mcp.schema.json';
import rushMcpPluginSchemaObject from '../schemas/rush-mcp-plugin.schema.json';

/**
 * Configuration for @rushstack/mcp-server in a monorepo.
 * Corresponds to the contents of common/config/rush-mcp/rush-mcp.json
 */
export interface IJsonRushMcpConfig {
  /**
   * The list of plugins that @rushstack/mcp-server should load when processing this monorepo.
   */
  mcpPlugins: IJsonRushMcpPlugin[];
}

/**
 * Describes a single MCP plugin entry.
 */
export interface IJsonRushMcpPlugin {
  /**
   * The name of an NPM package that appears in the package.json "dependencies" for the autoinstaller.
   */
  packageName: string;

  /**
   * The name of a Rush autoinstaller with this package as its dependency.
   * @rushstack/mcp-server will ensure this folder is installed before loading the plugin.
   */
  autoinstaller: string;
}

/**
 * Manifest file for a Rush MCP plugin.
 * Every plugin package must contain a "rush-mcp-plugin.json" manifest in the top-level folder.
 */
export interface IJsonRushMcpPluginManifest {
  /**
   * A name that uniquely identifies your plugin.
   * Generally this should match the NPM package name; two plugins with the same pluginName cannot be loaded together.
   */
  pluginName: string;

  /**
   * Optional. Indicates that your plugin accepts a config file.
   * The MCP server will load this schema file and provide it to the plugin.
   * Path is typically `<rush-repo>/common/config/rush-mcp/<plugin-name>.json`.
   */
  configFileSchema?: string;

  /**
   * The module path to the plugin's entry point.
   * Its default export must be a class implementing the MCP plugin interface.
   */
  entryPoint: string;
}

export class RushMcpPluginLoader {
  private static readonly _rushMcpJsonSchema: JsonSchema =
    JsonSchema.fromLoadedObject(rushMcpJsonSchemaObject);
  private static readonly _rushMcpPluginSchemaObject: JsonSchema =
    JsonSchema.fromLoadedObject(rushMcpPluginSchemaObject);

  private readonly _rushWorkspacePath: string;
  private readonly _mcpServer: McpServer;

  public constructor(rushWorkspacePath: string, mcpServer: McpServer) {
    this._rushWorkspacePath = rushWorkspacePath;
    this._mcpServer = mcpServer;
  }

  private static _formatError(e: Error): string {
    return e.stack ?? RushMcpPluginLoader._formatError(e);
  }

  public async loadAsync(): Promise<void> {
    const rushMcpFilePath: string = path.join(
      this._rushWorkspacePath,
      'common/config/rush-mcp/rush-mcp.json'
    );

    if (!(await FileSystem.existsAsync(rushMcpFilePath))) {
      return;
    }

    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
      startingFolder: this._rushWorkspacePath
    });

    const jsonRushMcpConfig: IJsonRushMcpConfig = await JsonFile.loadAndValidateAsync(
      rushMcpFilePath,
      RushMcpPluginLoader._rushMcpJsonSchema
    );

    if (jsonRushMcpConfig.mcpPlugins.length === 0) {
      return;
    }

    const rushGlobalFolder: RushGlobalFolder = new RushGlobalFolder();

    for (const jsonMcpPlugin of jsonRushMcpConfig.mcpPlugins) {
      // Ensure the autoinstaller is installed
      const autoinstaller: Autoinstaller = new Autoinstaller({
        autoinstallerName: jsonMcpPlugin.autoinstaller,
        rushConfiguration,
        rushGlobalFolder,
        restrictConsoleOutput: false
      });
      await autoinstaller.prepareAsync();

      // Load the manifest

      // Suppose the autoinstaller is "my-autoinstaller" and the package is "rush-mcp-example-plugin".
      // Then the folder will be:
      // "/path/to/my-repo/common/autoinstallers/my-autoinstaller/node_modules/rush-mcp-example-plugin"
      const installedPluginPackageFolder: string = await Import.resolvePackageAsync({
        baseFolderPath: autoinstaller.folderFullPath,
        packageName: jsonMcpPlugin.packageName
      });

      const manifestFilePath: string = path.join(installedPluginPackageFolder, 'rush-mcp-plugin.json');
      if (!(await FileSystem.existsAsync(manifestFilePath))) {
        throw new Error(
          'The "rush-mcp-plugin.json" manifest file was not found under ' + installedPluginPackageFolder
        );
      }

      const jsonManifest: IJsonRushMcpPluginManifest = await JsonFile.loadAndValidateAsync(
        manifestFilePath,
        RushMcpPluginLoader._rushMcpPluginSchemaObject
      );

      let rushMcpPluginOptions: JsonObject = {};
      if (jsonManifest.configFileSchema) {
        const mcpPluginSchemaFilePath: string = path.resolve(
          installedPluginPackageFolder,
          jsonManifest.configFileSchema
        );
        const mcpPluginSchema: JsonSchema = await JsonSchema.fromFile(mcpPluginSchemaFilePath);
        const rushMcpPluginOptionsFilePath: string = path.resolve(
          this._rushWorkspacePath,
          `common/config/rush-mcp/${jsonManifest.pluginName}.json`
        );
        // Example: /path/to/my-repo/common/config/rush-mcp/rush-mcp-example-plugin.json
        rushMcpPluginOptions = await JsonFile.loadAndValidateAsync(
          rushMcpPluginOptionsFilePath,
          mcpPluginSchema
        );
      }

      const fullEntryPointPath: string = path.join(installedPluginPackageFolder, jsonManifest.entryPoint);
      let pluginFactory: RushMcpPluginFactory;
      try {
        const entryPointModule: { default?: RushMcpPluginFactory } = require(fullEntryPointPath);
        if (entryPointModule.default === undefined) {
          throw new Error('The commonJS "default" export is missing');
        }
        pluginFactory = entryPointModule.default;
      } catch (e) {
        throw new Error(
          `Unable to load plugin entry point at ${fullEntryPointPath}:\n` +
            RushMcpPluginLoader._formatError(e)
        );
      }

      const session: RushMcpPluginSessionInternal = new RushMcpPluginSessionInternal(this._mcpServer);

      let plugin: IRushMcpPlugin;
      try {
        plugin = pluginFactory(session, rushMcpPluginOptions);
      } catch (e) {
        throw new Error(
          `Error invoking entry point for plugin ${jsonManifest.pluginName}:\n` +
            RushMcpPluginLoader._formatError(e)
        );
      }

      try {
        await plugin.onInitializeAsync();
      } catch (e) {
        throw new Error(
          `Error occurred in onInitializeAsync() for plugin ${jsonManifest.pluginName}:\n` +
            RushMcpPluginLoader._formatError(e)
        );
      }
    }
  }
}
