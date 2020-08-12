// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema, JsonFile } from '@rushstack/node-core-library';

import { Utilities } from './Utilities';
import { ResolveUtilities } from './ResolveUtilities';

interface IConfigJson {
  extends?: string;
}

export enum InheritanceType {
  append = 'append',
  replace = 'replace'
}

export enum ResolutionMethod {
  resolvePathRelativeToConfigFile,
  resolvePathRelativeToProjectRoot,
  NodeResolve
}

export interface IConfigMeta<TConfigFile> {
  schemaPath: string;
  propertyPathResolution?: {
    [TConfigFileProperty in keyof TConfigFile]?: PathHandling<TConfigFile[TConfigFileProperty]>;
  };
  propertyInheritance?: {
    [TConfigFileProperty in keyof TConfigFile]?: InheritanceType;
  };
}

export type PathHandling<TObject> = TObject extends object
  ? IUnstructuredObjectPropertyPathHandling<TObject> | IStructuredObjectPropertyPathHandling<TObject>
  : TObject extends string
  ? IStringPropertyPathHandling
  : never;

export interface IStructuredObjectPropertyPathHandling<TObject extends object> {
  childPropertyHandling: {
    [TObjectProperty in keyof TObject]?: PathHandling<TObject[TObjectProperty]>;
  };
}

export interface IUnstructuredObjectPropertyPathHandling<TObject> {
  /**
   * Specify a value here to handle the way object or array elements are processed
   */
  objectEntriesHandling: PathHandling<TObject[keyof TObject]>;
}

export interface IStringPropertyPathHandling {
  resolutionMethod: ResolutionMethod;
}

const HAS_BEEN_NORMALIZED: unique symbol = Symbol('has been sorted');

interface IConfigFileCacheEntry {
  configFile?: unknown;
  error?: Error;
}

export class ConfigLoader {
  public static _configFileCache: Map<string, IConfigFileCacheEntry> = new Map<
    string,
    IConfigFileCacheEntry
  >();
  public static _schemaCache: Map<string, JsonSchema> = new Map<string, JsonSchema>();

  public static clearCache(): void {
    ConfigLoader._configFileCache.clear();
    ConfigLoader._schemaCache.clear();
  }

  public static async loadConfigFileAsync<TConfigFile>(
    configFilePath: string,
    configMeta: IConfigMeta<TConfigFile>
  ): Promise<TConfigFile> {
    const normalizedConfigMeta: IConfigMeta<TConfigFile> = ConfigLoader._sortObjectProperties(configMeta);
    return await ConfigLoader._loadConfigFileAsyncInner(
      path.resolve(configFilePath),
      normalizedConfigMeta,
      JSON.stringify(normalizedConfigMeta),
      new Set<string>()
    );
  }

  private static async _loadConfigFileAsyncInner<TConfigFile>(
    resolvedConfigFilePath: string,
    normalizedConfigMeta: IConfigMeta<TConfigFile>,
    serializedConfigMeta: string,
    visitedConfigFiles: Set<string>
  ): Promise<TConfigFile> {
    const cacheKey: string = `${resolvedConfigFilePath}?${serializedConfigMeta}`;

    let cacheEntry: IConfigFileCacheEntry | undefined = ConfigLoader._configFileCache.get(cacheKey);
    if (!cacheEntry) {
      try {
        if (visitedConfigFiles.has(resolvedConfigFilePath)) {
          throw new Error(
            'A loop has been detected in the "extends" properties of config file at ' +
              `"${resolvedConfigFilePath}".`
          );
        }

        visitedConfigFiles.add(resolvedConfigFilePath);

        let schema: JsonSchema | undefined = ConfigLoader._schemaCache.get(normalizedConfigMeta.schemaPath);
        if (!schema) {
          schema = JsonSchema.fromFile(normalizedConfigMeta.schemaPath);
          ConfigLoader._schemaCache.set(normalizedConfigMeta.schemaPath, schema);
        }

        const configJson: IConfigJson & TConfigFile = await JsonFile.loadAndValidateAsync(
          resolvedConfigFilePath,
          schema
        );

        let parentConfig: TConfigFile | undefined = undefined;
        if (configJson.extends) {
          const resolvedParentConfigPath: string = path.resolve(
            path.dirname(resolvedConfigFilePath),
            configJson.extends
          );
          parentConfig = await ConfigLoader._loadConfigFileAsyncInner(
            resolvedParentConfigPath,
            normalizedConfigMeta,
            serializedConfigMeta,
            visitedConfigFiles
          );
        }

        const propertyNames: Set<string> = new Set<string>([
          ...Object.keys(parentConfig || {}),
          ...Object.keys(configJson)
        ]);

        const result: TConfigFile = {} as TConfigFile;
        for (const propertyName of propertyNames) {
          if (propertyName === '$schema' || propertyName === 'extends') {
            continue;
          }

          result[propertyName] = ConfigLoader._processProperty(
            resolvedConfigFilePath,
            propertyName,
            configJson[propertyName],
            parentConfig ? parentConfig[propertyName] : undefined,
            normalizedConfigMeta.propertyInheritance
              ? normalizedConfigMeta.propertyInheritance[propertyName]
              : undefined,
            normalizedConfigMeta.propertyPathResolution
              ? normalizedConfigMeta.propertyPathResolution[propertyName]
              : undefined
          );
        }

        cacheEntry = { configFile: result };
      } catch (e) {
        cacheEntry = { error: e };
      }
    }

    if (cacheEntry.error) {
      throw cacheEntry.error;
    } else {
      return cacheEntry.configFile! as TConfigFile;
    }
  }

  private static _sortObjectProperties<TObj>(obj: TObj): TObj {
    if (obj[HAS_BEEN_NORMALIZED]) {
      return obj;
    } else {
      const result: TObj = ({ [HAS_BEEN_NORMALIZED]: true } as unknown) as TObj;

      const sortedKeys: string[] = Object.keys(obj).sort();
      for (const key of sortedKeys) {
        const value: unknown = obj[key];
        const normalizedValue: unknown =
          typeof value === 'object' ? ConfigLoader._sortObjectProperties(value) : value;
        result[key] = normalizedValue;
      }

      return result;
    }
  }

  private static _processProperty<TProperty>(
    configFilePath: string,
    propertyName: string,
    propertyValue: TProperty | undefined,
    parentPropertyValue: TProperty | undefined,
    inheritanceType: InheritanceType | undefined,
    pathHandling: PathHandling<TProperty> | undefined
  ): TProperty | undefined {
    propertyValue = ConfigLoader._handlePropertyInheritance(
      propertyName,
      propertyValue,
      parentPropertyValue,
      inheritanceType
    );

    if (propertyValue) {
      return ConfigLoader._handlePropertyPathResolution(
        configFilePath,
        propertyName,
        propertyValue,
        pathHandling
      );
    } else {
      return propertyValue;
    }
  }

  private static _handlePropertyInheritance<TProperty>(
    propertyName: string,
    propertyValue: TProperty | undefined,
    parentPropertyValue: TProperty | undefined,
    inheritanceType: InheritanceType | undefined
  ): TProperty | undefined {
    inheritanceType = inheritanceType || InheritanceType.append;
    if (parentPropertyValue) {
      switch (inheritanceType) {
        case InheritanceType.replace: {
          return propertyValue;
        }

        case InheritanceType.append: {
          if (!Array.isArray(propertyValue) || !Array.isArray(parentPropertyValue)) {
            throw new Error(
              `Issue in processing config file property "${propertyName}". ` +
                `Property is not an array, but the inheritance type is set as "${InheritanceType.append}"`
            );
          }

          const parentPropertyValueAsArray: unknown[] = parentPropertyValue;
          parentPropertyValueAsArray.push(...propertyValue);

          return (parentPropertyValueAsArray as unknown) as TProperty;
        }

        default: {
          throw new Error(`Unknown inheritance type "${inheritanceType}"`);
        }
      }
    } else {
      return propertyValue || parentPropertyValue;
    }
  }

  private static _handlePropertyPathResolution<TProperty>(
    configFilePath: string,
    propertyName: string,
    propertyValue: TProperty,
    pathHandling: PathHandling<TProperty> | undefined
  ): TProperty {
    const stringPropertyHandling:
      | IStringPropertyPathHandling
      | undefined = pathHandling as IStringPropertyPathHandling;
    const structuredPropertyHandling:
      | (TProperty extends object ? IStructuredObjectPropertyPathHandling<TProperty> : never)
      | undefined = pathHandling as TProperty extends object
      ? IStructuredObjectPropertyPathHandling<TProperty>
      : never;
    const unstructuredPropertyHandling:
      | (TProperty extends object ? IUnstructuredObjectPropertyPathHandling<TProperty> : never)
      | undefined = pathHandling as TProperty extends object
      ? IUnstructuredObjectPropertyPathHandling<TProperty>
      : never;

    switch (typeof propertyValue) {
      case 'string': {
        if (structuredPropertyHandling?.childPropertyHandling) {
          throw new Error(
            `Property "${propertyName}" is a string, but "childPropertyHandling" is specified.`
          );
        }

        if (unstructuredPropertyHandling?.objectEntriesHandling) {
          throw new Error(
            `Property "${propertyName}" is a string, but "objectEntriesHandling" is specified.`
          );
        }

        return (ConfigLoader._resolvePathProperty(
          configFilePath,
          propertyValue,
          stringPropertyHandling?.resolutionMethod
        ) as unknown) as TProperty;
      }

      case 'object': {
        if (stringPropertyHandling?.resolutionMethod) {
          throw new Error(`Property "${propertyName}" is an object, but a resolutionMethod is specified.`);
        }

        if (
          structuredPropertyHandling?.childPropertyHandling &&
          unstructuredPropertyHandling?.objectEntriesHandling
        ) {
          throw new Error(
            'Both a "childPropertyHandling" and a "objectEntriesHandling" are specified. ' +
              'Only one is allowed.'
          );
        }

        if (unstructuredPropertyHandling?.objectEntriesHandling) {
          for (const [key, value] of Object.entries(propertyValue)) {
            propertyValue[key] = ConfigLoader._handlePropertyPathResolution(
              configFilePath,
              key,
              value,
              unstructuredPropertyHandling.objectEntriesHandling
            );
          }
        } else if (structuredPropertyHandling?.childPropertyHandling) {
          for (const [childPropertyName, handling] of Object.entries(
            structuredPropertyHandling.childPropertyHandling
          )) {
            if (propertyValue[childPropertyName]) {
              propertyValue[childPropertyName] = ConfigLoader._handlePropertyPathResolution(
                configFilePath,
                childPropertyName,
                propertyValue[childPropertyName],
                handling as PathHandling<unknown>
              );
            }
          }
        }

        return propertyValue;
      }

      default: {
        if (pathHandling) {
          throw new Error(
            `Property "${propertyName}" is a ${typeof propertyValue}, but a pathHandling is specified.`
          );
        }

        return propertyValue;
      }
    }
  }

  private static _resolvePathProperty(
    configFilePath: string,
    propertyValue: string,
    resolutionMethod: ResolutionMethod | undefined
  ): string {
    switch (resolutionMethod) {
      case ResolutionMethod.resolvePathRelativeToConfigFile: {
        return path.resolve(path.dirname(configFilePath), propertyValue);
      }

      case ResolutionMethod.resolvePathRelativeToProjectRoot: {
        const packageRoot: string | undefined = Utilities.packageJsonLookup.tryGetPackageFolderFor(
          configFilePath
        );
        if (!packageRoot) {
          throw new Error(`Could not find a package root for path "${configFilePath}"`);
        }

        return path.resolve(packageRoot, propertyValue);
      }

      case ResolutionMethod.NodeResolve: {
        return ResolveUtilities.resolvePackagePath(propertyValue, configFilePath);
      }

      default: {
        return propertyValue;
      }
    }
  }
}
