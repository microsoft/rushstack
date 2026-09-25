// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import type { JsonSchema } from '@rushstack/node-core-library';

import {
  HeftLifecyclePluginDefinition,
  type HeftPluginDefinitionBase,
  HeftTaskPluginDefinition,
  type IHeftLifecyclePluginDefinitionJson,
  type IHeftTaskPluginDefinitionJson
} from './HeftPluginDefinition';
import type { IHeftConfigurationJsonPluginSpecifier } from '../utilities/CoreConfigFiles';
import type { tryParseJsonLean } from './lean/LeanJson';
import type { tryValidateSchemaObject } from './lean/SchemaFastPath';

export interface IHeftPluginConfigurationJson {
  lifecyclePlugins?: IHeftLifecyclePluginDefinitionJson[];
  taskPlugins?: IHeftTaskPluginDefinitionJson[];
}

const HEFT_PLUGIN_CONFIGURATION_FILENAME: 'heft-plugin.json' = 'heft-plugin.json';

let _jsonSchema: JsonSchema | undefined;

function getHeftPluginSchema(): object {
  return require('../schemas/heft-plugin.schema.json');
}

const _pluginConfigurationPromises: Map<string, Promise<HeftPluginConfiguration>> = new Map();
const _seededHeftPluginConfigurationJsonByPackageRoot: Map<string, IHeftPluginConfigurationJson> = new Map();

/**
 * Loads and validates the heft-plugin.json file without loading ajv, if the result is guaranteed to be identical
 * to `JsonFile.loadAndValidateAsync()`. Returns `undefined` otherwise (including for all error conditions).
 */
function _tryLoadHeftPluginConfigurationJsonLean(filePath: string): IHeftPluginConfigurationJson | undefined {
  let fileText: string;
  try {
    fileText = fs.readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }

  const { tryParseJsonLean: tryParseJsonLeanFunction } = require('./lean/LeanJson') as {
    tryParseJsonLean: typeof tryParseJsonLean;
  };
  const parsed: { value: unknown } | undefined = tryParseJsonLeanFunction(fileText);
  const { tryValidateSchemaObject: tryValidateSchemaObjectFunction } = require('./lean/SchemaFastPath') as {
    tryValidateSchemaObject: typeof tryValidateSchemaObject;
  };
  if (parsed && tryValidateSchemaObjectFunction(getHeftPluginSchema(), parsed.value)) {
    return parsed.value as IHeftPluginConfigurationJson;
  }
}

async function _loadHeftPluginConfigurationJsonAsync(
  filePath: string
): Promise<IHeftPluginConfigurationJson> {
  const leanResult: IHeftPluginConfigurationJson | undefined =
    _tryLoadHeftPluginConfigurationJsonLean(filePath);
  if (leanResult) {
    return leanResult;
  }

  // Use the original implementation, which produces the canonical errors
  const { JsonFile, JsonSchema: JsonSchemaClass } = await import('@rushstack/node-core-library');
  if (!_jsonSchema) {
    _jsonSchema = JsonSchemaClass.fromLoadedObject(getHeftPluginSchema());
  }

  return await JsonFile.loadAndValidateAsync(filePath, _jsonSchema);
}

/**
 * Loads and validates the heft-plugin.json file.
 */
export class HeftPluginConfiguration {
  readonly #heftPluginConfigurationJson: IHeftPluginConfigurationJson;
  #lifecyclePluginDefinitions: Set<HeftLifecyclePluginDefinition> | undefined;
  #lifecyclePluginDefinitionsMap: Map<string, HeftLifecyclePluginDefinition> | undefined;
  #taskPluginDefinitions: Set<HeftTaskPluginDefinition> | undefined;
  #taskPluginDefinitionsMap: Map<string, HeftTaskPluginDefinition> | undefined;

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
    this.#heftPluginConfigurationJson = heftPluginConfigurationJson;
    this.packageRoot = packageRoot;
    this.packageName = packageName;
    this.#validate(heftPluginConfigurationJson, packageName);
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
      _pluginConfigurationPromises.get(packageRoot);
    if (!heftPluginConfigurationPromise) {
      heftPluginConfigurationPromise = (async () => {
        const heftPluginConfigurationJson: IHeftPluginConfigurationJson =
          _seededHeftPluginConfigurationJsonByPackageRoot.get(packageRoot) ??
          (await _loadHeftPluginConfigurationJsonAsync(resolvedHeftPluginConfigurationJsonFilename));
        return new HeftPluginConfiguration(heftPluginConfigurationJson, packageRoot, packageName);
      })();
      _pluginConfigurationPromises.set(packageRoot, heftPluginConfigurationPromise);
    }

    return await heftPluginConfigurationPromise;
  }

  public static _seedHeftPluginConfigurationJson(
    packageRoot: string,
    heftPluginConfigurationJson: IHeftPluginConfigurationJson
  ): void {
    _seededHeftPluginConfigurationJsonByPackageRoot.set(packageRoot, heftPluginConfigurationJson);
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
        Array.from(this.#getLifecyclePluginDefinitions()),
        Array.from(this.#getTaskPluginDefinitions())
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
    return this.#getLifecyclePluginDefinitions().has(pluginDefinition);
  }

  /**
   * Returns if the provided plugin definition is a task plugin definition.
   */
  public isTaskPluginDefinition(
    pluginDefinition: HeftPluginDefinitionBase
  ): pluginDefinition is HeftTaskPluginDefinition {
    return this.#getTaskPluginDefinitions().has(pluginDefinition);
  }

  /**
   * Returns a loaded lifecycle plugin definition for the provided plugin name. If one can't be found,
   * returns undefined.
   */
  public tryGetLifecyclePluginDefinitionByName(
    lifecyclePluginName: string
  ): HeftLifecyclePluginDefinition | undefined {
    if (!this.#lifecyclePluginDefinitionsMap) {
      this.#lifecyclePluginDefinitionsMap = new Map(
        Array.from(this.#getLifecyclePluginDefinitions()).map((d: HeftLifecyclePluginDefinition) => [
          d.pluginName,
          d
        ])
      );
    }
    return this.#lifecyclePluginDefinitionsMap.get(lifecyclePluginName);
  }

  /**
   * Returns a loaded task plugin definition for the provided plugin name. If one can't be found,
   * returns undefined.
   */
  public tryGetTaskPluginDefinitionByName(taskPluginName: string): HeftTaskPluginDefinition | undefined {
    if (!this.#taskPluginDefinitionsMap) {
      this.#taskPluginDefinitionsMap = new Map(
        Array.from(this.#getTaskPluginDefinitions()).map((d: HeftTaskPluginDefinition) => [d.pluginName, d])
      );
    }
    return this.#taskPluginDefinitionsMap.get(taskPluginName);
  }

  #getLifecyclePluginDefinitions(): ReadonlySet<HeftLifecyclePluginDefinition> {
    if (!this.#lifecyclePluginDefinitions) {
      this.#lifecyclePluginDefinitions = new Set();
      for (const lifecyclePluginDefinitionJson of this.#heftPluginConfigurationJson.lifecyclePlugins || []) {
        this.#lifecyclePluginDefinitions.add(
          HeftLifecyclePluginDefinition.loadFromObject({
            heftPluginDefinitionJson: lifecyclePluginDefinitionJson,
            packageRoot: this.packageRoot,
            packageName: this.packageName
          })
        );
      }
    }
    return this.#lifecyclePluginDefinitions;
  }

  /**
   * Task plugin definitions sourced from the heft-plugin.json file.
   */
  #getTaskPluginDefinitions(): ReadonlySet<HeftTaskPluginDefinition> {
    if (!this.#taskPluginDefinitions) {
      this.#taskPluginDefinitions = new Set();
      for (const taskPluginDefinitionJson of this.#heftPluginConfigurationJson.taskPlugins || []) {
        this.#taskPluginDefinitions.add(
          HeftTaskPluginDefinition.loadFromObject({
            heftPluginDefinitionJson: taskPluginDefinitionJson,
            packageRoot: this.packageRoot,
            packageName: this.packageName
          })
        );
      }
    }
    return this.#taskPluginDefinitions;
  }

  #validate(heftPluginConfigurationJson: IHeftPluginConfigurationJson, packageName: string): void {
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
