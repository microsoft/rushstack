// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema, JsonFile, PackageJsonLookup, Resolve } from '@rushstack/node-core-library';

interface IConfigurationJson {
  extends?: string;
}

/**
 * @beta
 */
export enum InheritanceType {
  /**
   * Append additional elements after elements from the parent file's property
   */
  append = 'append',

  /**
   * Discard elements from the parent file's property
   */
  replace = 'replace'
}

/**
 * @beta
 */
export enum ResolutionMethod {
  /**
   * Resolve a path relative to the configuration file
   */
  resolvePathRelativeToConfigurationFile,

  /**
   * Resolve a path relative to the root of the project containing the configuration file
   */
  resolvePathRelativeToProjectRoot,

  /**
   * Treat the property as a NodeJS-style require/import reference and resolve using standard
   * NodeJS filesystem resolution
   */
  NodeResolve
}

/**
 * @beta
 */
export interface IConfigurationMeta<TConfigurationFile> {
  /**
   * Path to the configuration file's schema file
   */
  schemaPath: string;

  /**
   * Options for resolving paths inside properties of the configuration file
   */
  propertyPathResolution?: {
    [TConfigurationFileProperty in keyof TConfigurationFile]?: PathHandling<
      TConfigurationFile[TConfigurationFileProperty]
    >;
  };

  /**
   * Options for inheritance of top-level configuration file properties
   */
  propertyInheritance?: {
    [TConfigFileProperty in keyof TConfigurationFile]?: InheritanceType;
  };
}

/**
 * @beta
 */
export type PathHandling<TObject> = TObject extends object
  ? IUnstructuredObjectPropertyPathHandling<TObject> | IStructuredObjectPropertyPathHandling<TObject>
  : TObject extends string
  ? IStringPropertyPathHandling
  : never;

/**
 * @beta
 */
export interface IStructuredObjectPropertyPathHandling<TObject extends object> {
  /**
   * Options for path resolution in specific properties inside a configuration file
   */
  childPropertyHandling: {
    [TObjectProperty in keyof TObject]?: PathHandling<TObject[TObjectProperty]>;
  };
}

/**
 * @beta
 */
export interface IUnstructuredObjectPropertyPathHandling<TObject> {
  /**
   * Specify a value here to describe the way paths are resolved in elements of an array, or all values of an
   * object
   */
  objectEntriesHandling: PathHandling<TObject[keyof TObject]>;
}

/**
 * @beta
 */
export interface IStringPropertyPathHandling {
  /**
   * Specify a value here to describe the way a path in a string property is resolved
   */
  resolutionMethod: ResolutionMethod;
}

const HAS_BEEN_NORMALIZED: unique symbol = Symbol('has been sorted');

interface IConfigurationFileCacheEntry {
  configurationFile?: unknown;
  error?: Error;
}

/**
 * @beta
 */
export class ConfigurationFileLoader {
  private _configurationFileCache: Map<string, IConfigurationFileCacheEntry> = new Map<
    string,
    IConfigurationFileCacheEntry
  >();
  private _schemaCache: Map<string, JsonSchema> = new Map<string, JsonSchema>();
  private _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  public async loadConfigurationFileAsync<TConfigurationFile>(
    configurationFilePath: string,
    configurationMeta: IConfigurationMeta<TConfigurationFile>
  ): Promise<TConfigurationFile> {
    const normalizedConfigurationMeta: IConfigurationMeta<TConfigurationFile> = this._sortObjectProperties(
      configurationMeta
    );
    return await this._loadConfigurationFileAsyncInner(
      path.resolve(configurationFilePath),
      normalizedConfigurationMeta,
      JSON.stringify(normalizedConfigurationMeta),
      new Set<string>()
    );
  }

  private async _loadConfigurationFileAsyncInner<TConfigurationFile>(
    resolvedConfigurationFilePath: string,
    normalizedConfigurationMeta: IConfigurationMeta<TConfigurationFile>,
    serializedConfigurationMeta: string,
    visitedConfigurationFilePaths: Set<string>
  ): Promise<TConfigurationFile> {
    const cacheKey: string = `${resolvedConfigurationFilePath}?${serializedConfigurationMeta}`;

    let cacheEntry: IConfigurationFileCacheEntry | undefined = this._configurationFileCache.get(cacheKey);
    if (!cacheEntry) {
      try {
        if (visitedConfigurationFilePaths.has(resolvedConfigurationFilePath)) {
          throw new Error(
            'A loop has been detected in the "extends" properties of configuration file at ' +
              `"${resolvedConfigurationFilePath}".`
          );
        }

        visitedConfigurationFilePaths.add(resolvedConfigurationFilePath);

        let schema: JsonSchema | undefined = this._schemaCache.get(normalizedConfigurationMeta.schemaPath);
        if (!schema) {
          schema = JsonSchema.fromFile(normalizedConfigurationMeta.schemaPath);
          this._schemaCache.set(normalizedConfigurationMeta.schemaPath, schema);
        }

        const configurationJson: IConfigurationJson &
          TConfigurationFile = await JsonFile.loadAndValidateAsync(resolvedConfigurationFilePath, schema);

        let parentConfiguration: TConfigurationFile | undefined = undefined;
        if (configurationJson.extends) {
          const resolvedParentConfigPath: string = path.resolve(
            path.dirname(resolvedConfigurationFilePath),
            configurationJson.extends
          );
          parentConfiguration = await this._loadConfigurationFileAsyncInner(
            resolvedParentConfigPath,
            normalizedConfigurationMeta,
            serializedConfigurationMeta,
            visitedConfigurationFilePaths
          );
        }

        const propertyNames: Set<string> = new Set<string>([
          ...Object.keys(parentConfiguration || {}),
          ...Object.keys(configurationJson)
        ]);

        const result: TConfigurationFile = {} as TConfigurationFile;
        for (const propertyName of propertyNames) {
          if (propertyName === '$schema' || propertyName === 'extends') {
            continue;
          }

          result[propertyName] = this._processProperty(
            resolvedConfigurationFilePath,
            propertyName,
            configurationJson[propertyName],
            parentConfiguration ? parentConfiguration[propertyName] : undefined,
            normalizedConfigurationMeta.propertyInheritance
              ? normalizedConfigurationMeta.propertyInheritance[propertyName]
              : undefined,
            normalizedConfigurationMeta.propertyPathResolution
              ? normalizedConfigurationMeta.propertyPathResolution[propertyName]
              : undefined
          );
        }

        cacheEntry = { configurationFile: result };
      } catch (e) {
        cacheEntry = { error: e };
      }
    }

    if (cacheEntry.error) {
      throw cacheEntry.error;
    } else {
      return cacheEntry.configurationFile! as TConfigurationFile;
    }
  }

  private _sortObjectProperties<TObject>(obj: TObject): TObject {
    if (obj[HAS_BEEN_NORMALIZED]) {
      return obj;
    } else {
      const result: TObject = ({ [HAS_BEEN_NORMALIZED]: true } as unknown) as TObject;

      const sortedKeys: string[] = Object.keys(obj).sort();
      for (const key of sortedKeys) {
        const value: unknown = obj[key];
        const normalizedValue: unknown =
          typeof value === 'object' ? this._sortObjectProperties(value) : value;
        result[key] = normalizedValue;
      }

      return result;
    }
  }

  private _processProperty<TProperty>(
    configurationFilePath: string,
    propertyName: string,
    propertyValue: TProperty | undefined,
    parentPropertyValue: TProperty | undefined,
    inheritanceType: InheritanceType | undefined,
    pathHandling: PathHandling<TProperty> | undefined
  ): TProperty | undefined {
    propertyValue = this._handlePropertyInheritance(
      propertyName,
      propertyValue,
      parentPropertyValue,
      inheritanceType
    );

    if (propertyValue) {
      return this._handlePropertyPathResolution(
        configurationFilePath,
        propertyName,
        propertyValue,
        pathHandling
      );
    } else {
      return propertyValue;
    }
  }

  private _handlePropertyInheritance<TProperty>(
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
              `Issue in processing configuration file property "${propertyName}". ` +
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

  private _handlePropertyPathResolution<TProperty>(
    configurationFilePath: string,
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

        return (this._resolvePathProperty(
          configurationFilePath,
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
            propertyValue[key] = this._handlePropertyPathResolution(
              configurationFilePath,
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
              propertyValue[childPropertyName] = this._handlePropertyPathResolution(
                configurationFilePath,
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

  private _resolvePathProperty(
    configurationFilePath: string,
    propertyValue: string,
    resolutionMethod: ResolutionMethod | undefined
  ): string {
    switch (resolutionMethod) {
      case ResolutionMethod.resolvePathRelativeToConfigurationFile: {
        return path.resolve(path.dirname(configurationFilePath), propertyValue);
      }

      case ResolutionMethod.resolvePathRelativeToProjectRoot: {
        const packageRoot: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(
          configurationFilePath
        );
        if (!packageRoot) {
          throw new Error(`Could not find a package root for path "${configurationFilePath}"`);
        }

        return path.resolve(packageRoot, propertyValue);
      }

      case ResolutionMethod.NodeResolve: {
        return Resolve.resolvePackagePath(propertyValue, configurationFilePath);
      }

      default: {
        return propertyValue;
      }
    }
  }
}
