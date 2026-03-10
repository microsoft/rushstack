// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema } from '@rushstack/node-core-library';

import {
  HeftLifecyclePluginDefinition,
  type HeftPluginDefinitionBase,
  HeftTaskPluginDefinition,
  type IHeftLifecyclePluginDefinitionJson,
  type IHeftTaskPluginDefinitionJson
} from './HeftPluginDefinition.ts';
import type { IHeftConfigurationJsonPluginSpecifier } from '../utilities/CoreConfigFiles.ts';
import heftPluginSchema from '../schemas/heft-plugin.schema.json';

export interface IHeftPluginConfigurationJson {
  lifecyclePlugins?: IHeftLifecyclePluginDefinitionJson[];
  taskPlugins?: IHeftTaskPluginDefinitionJson[];
}

const HEFT_PLUGIN_CONFIGURATION_FILENAME: 'heft-plugin.json' = 'heft-plugin.json';

/**
 * Loads and validates the heft-plugin.json file.
 */
export class HeftPluginConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(heftPluginSchema);
  private static _pluginConfigurationPromises: Map<string, Promise<HeftPluginConfiguration>> = new Map();

  private readonly _heftPluginConfigurationJson: IHeftPluginConfigurationJson;
  private _lifecyclePluginDefinitions: Set<HeftLifecyclePluginDefinition> | undefined;
  private _lifecyclePluginDefinitionsMap: Map<string, HeftLifecyclePluginDefinition> | undefined;
  private _taskPluginDefinitions: Set<HeftTaskPluginDefinition> | undefined;
  private _taskPluginDefinitionsMap: Map<string, HeftTaskPluginDefinition> | undefined;

  /**
   * The path to the root of the package that contains the heft-plugin.json file.
   */
  public readonly packageRoot: string;

  /**
   * The package name of the package that contains the heft-plugin.json file.
   */
  public readonly packageName: string;

  private constructor(
    heftPluginConfigurationJson: IHeftPluginConfigurationJson,
    packageRoot: string,
    packageName: string
  ) {
    this._heftPluginConfigurationJson = heftPluginConfigurationJson;
    this.packageRoot = packageRoot;
    this.packageName = packageName;
    this._validate(heftPluginConfigurationJson, packageName);
  }

  /**
   * Load the heft-plugin.json file from the specified package.
   */
  public static async loadFromPackageAsync(
    packageRoot: string,
    packageName: string
  ): Promise<HeftPluginConfiguration> {
    const resolvedHeftPluginConfigurationJsonFilename: string = `${packageRoot}/${HEFT_PLUGIN_CONFIGURATION_FILENAME}`;
    let heftPluginConfigurationPromise: Promise<HeftPluginConfiguration> | undefined =
      HeftPluginConfiguration._pluginConfigurationPromises.get(packageRoot);
    if (!heftPluginConfigurationPromise) {
      heftPluginConfigurationPromise = (async () => {
        const heftPluginConfigurationJson: IHeftPluginConfigurationJson = await JsonFile.loadAndValidateAsync(
          resolvedHeftPluginConfigurationJsonFilename,
          HeftPluginConfiguration._jsonSchema
        );
        return new HeftPluginConfiguration(heftPluginConfigurationJson, packageRoot, packageName);
      })();
      HeftPluginConfiguration._pluginConfigurationPromises.set(packageRoot, heftPluginConfigurationPromise);
    }

    return await heftPluginConfigurationPromise;
  }

  /**
   * Returns a loaded plugin definition for the provided specifier. Specifiers are normally obtained from the
   * heft.json file.
   */
  public getPluginDefinitionBySpecifier(
    pluginSpecifier: IHeftConfigurationJsonPluginSpecifier
  ): HeftPluginDefinitionBase {
    if (!pluginSpecifier.pluginName) {
      const pluginDefinitions: HeftPluginDefinitionBase[] = ([] as HeftPluginDefinitionBase[]).concat(
        Array.from(this._getLifecyclePluginDefinitions()),
        Array.from(this._getTaskPluginDefinitions())
      );
      // Make an attempt at resolving the plugin without the name by looking for the first plugin
      if (pluginDefinitions.length > 1) {
        throw new Error(
          `The specified plugin package ${JSON.stringify(pluginSpecifier.pluginPackage)} contains ` +
            'multiple plugins. You must specify a plugin name.'
        );
      }
      return pluginDefinitions[0];
    } else {
      // Try resolving to a lifecycle plugin first
      const pluginDefinition: HeftPluginDefinitionBase | undefined =
        this.tryGetLifecyclePluginDefinitionByName(pluginSpecifier.pluginName) ||
        this.tryGetTaskPluginDefinitionByName(pluginSpecifier.pluginName);
      if (!pluginDefinition) {
        throw new Error(
          `The specified plugin package ${JSON.stringify(pluginSpecifier.pluginPackage)} does not contain ` +
            `a plugin named ${JSON.stringify(pluginSpecifier.pluginName)}.`
        );
      }
      return pluginDefinition;
    }
  }

  /**
   * Returns if the provided plugin definition is a lifecycle plugin definition.
   */
  public isLifecyclePluginDefinition(
    pluginDefinition: HeftPluginDefinitionBase
  ): pluginDefinition is HeftLifecyclePluginDefinition {
    return this._getLifecyclePluginDefinitions().has(pluginDefinition);
  }

  /**
   * Returns if the provided plugin definition is a task plugin definition.
   */
  public isTaskPluginDefinition(
    pluginDefinition: HeftPluginDefinitionBase
  ): pluginDefinition is HeftTaskPluginDefinition {
    return this._getTaskPluginDefinitions().has(pluginDefinition);
  }

  /**
   * Returns a loaded lifecycle plugin definition for the provided plugin name. If one can't be found,
   * returns undefined.
   */
  public tryGetLifecyclePluginDefinitionByName(
    lifecyclePluginName: string
  ): HeftLifecyclePluginDefinition | undefined {
    if (!this._lifecyclePluginDefinitionsMap) {
      this._lifecyclePluginDefinitionsMap = new Map(
        Array.from(this._getLifecyclePluginDefinitions()).map((d: HeftLifecyclePluginDefinition) => [
          d.pluginName,
          d
        ])
      );
    }
    return this._lifecyclePluginDefinitionsMap.get(lifecyclePluginName);
  }

  /**
   * Returns a loaded task plugin definition for the provided plugin name. If one can't be found,
   * returns undefined.
   */
  public tryGetTaskPluginDefinitionByName(taskPluginName: string): HeftTaskPluginDefinition | undefined {
    if (!this._taskPluginDefinitionsMap) {
      this._taskPluginDefinitionsMap = new Map(
        Array.from(this._getTaskPluginDefinitions()).map((d: HeftTaskPluginDefinition) => [d.pluginName, d])
      );
    }
    return this._taskPluginDefinitionsMap.get(taskPluginName);
  }

  private _getLifecyclePluginDefinitions(): ReadonlySet<HeftLifecyclePluginDefinition> {
    if (!this._lifecyclePluginDefinitions) {
      this._lifecyclePluginDefinitions = new Set();
      for (const lifecyclePluginDefinitionJson of this._heftPluginConfigurationJson.lifecyclePlugins || []) {
        this._lifecyclePluginDefinitions.add(
          HeftLifecyclePluginDefinition.loadFromObject({
            heftPluginDefinitionJson: lifecyclePluginDefinitionJson,
            packageRoot: this.packageRoot,
            packageName: this.packageName
          })
        );
      }
    }
    return this._lifecyclePluginDefinitions;
  }

  /**
   * Task plugin definitions sourced from the heft-plugin.json file.
   */
  private _getTaskPluginDefinitions(): ReadonlySet<HeftTaskPluginDefinition> {
    if (!this._taskPluginDefinitions) {
      this._taskPluginDefinitions = new Set();
      for (const taskPluginDefinitionJson of this._heftPluginConfigurationJson.taskPlugins || []) {
        this._taskPluginDefinitions.add(
          HeftTaskPluginDefinition.loadFromObject({
            heftPluginDefinitionJson: taskPluginDefinitionJson,
            packageRoot: this.packageRoot,
            packageName: this.packageName
          })
        );
      }
    }
    return this._taskPluginDefinitions;
  }

  private _validate(heftPluginConfigurationJson: IHeftPluginConfigurationJson, packageName: string): void {
    if (
      !heftPluginConfigurationJson.lifecyclePlugins?.length &&
      !heftPluginConfigurationJson.taskPlugins?.length
    ) {
      throw new Error(
        `The specified plugin package ${JSON.stringify(packageName)} does not contain any plugins.`
      );
    }

    // Prevent duplicate plugin names. This is done because parameter scopes default to the plugin name
    // when none are provided, and we want to avoid conflicting parameter scopes. Additionally, scoped loggers
    // on lifecycle plugins are mapped to "[lifecycle:<pluginName>]", and scoped loggers must be unique.
    const lifecyclePluginNames: Set<string> = new Set();
    for (const lifecyclePluginDefinitionJson of heftPluginConfigurationJson.lifecyclePlugins || []) {
      if (lifecyclePluginNames.has(lifecyclePluginDefinitionJson.pluginName)) {
        throw new Error(`Duplicate plugin name: ${lifecyclePluginDefinitionJson.pluginName}`);
      }
      lifecyclePluginNames.add(lifecyclePluginDefinitionJson.pluginName);
    }

    const taskPluginNames: Set<string> = new Set();
    for (const taskPluginDefinitionJson of heftPluginConfigurationJson.taskPlugins || []) {
      // Also check that the name doesn't conflict with the lifecycle plugins
      if (
        taskPluginNames.has(taskPluginDefinitionJson.pluginName) ||
        lifecyclePluginNames.has(taskPluginDefinitionJson.pluginName)
      ) {
        throw new Error(`Duplicate plugin name: ${taskPluginDefinitionJson.pluginName}`);
      }
      taskPluginNames.add(taskPluginDefinitionJson.pluginName);
    }
  }
}
