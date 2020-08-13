// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JSONPath } from 'jsonpath-plus';
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
export enum PathResolutionMethod {
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

interface IConfigurationFileCacheEntry<TConfigurationFile> {
  configurationFile?: TConfigurationFile;
  error?: Error;
}

/**
 * @beta
 */
export interface IJsonPathMetadata {
  pathResolutionMethod?: PathResolutionMethod;
}

/**
 * @beta
 */
export type IPropertyInheritanceTypes<TConfigurationFile> = {
  [propertyName in keyof TConfigurationFile]?: InheritanceType;
};

/**
 * @beta
 */
export interface IJsonPathsMetadata {
  [jsonPath: string]: IJsonPathMetadata;
}

/**
 * @beta
 */
export interface IConfigurationFileLoaderOptions<TConfigurationFile> {
  jsonPathMetadata?: IJsonPathsMetadata;
  propertyInheritanceTypes?: IPropertyInheritanceTypes<TConfigurationFile>;
}

interface IJsonPathCallbackObject {
  path: string;
  parent: object;
  parentProperty: string;
  value: string;
}

/**
 * @beta
 */
export class ConfigurationFileLoader<TConfigurationFile> {
  private readonly _schema: JsonSchema;
  private readonly _jsonPathMetadata: IJsonPathsMetadata;
  private readonly _propertyInheritanceTypes: IPropertyInheritanceTypes<TConfigurationFile>;

  private readonly _configurationFileCache: Map<
    string,
    IConfigurationFileCacheEntry<TConfigurationFile>
  > = new Map<string, IConfigurationFileCacheEntry<TConfigurationFile>>();
  private readonly _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  public constructor(jsonSchemaPath: string, options?: IConfigurationFileLoaderOptions<TConfigurationFile>);
  public constructor(jsonSchema: JsonSchema, options?: IConfigurationFileLoaderOptions<TConfigurationFile>);
  public constructor(
    jsonSchema: string | JsonSchema,
    options?: IConfigurationFileLoaderOptions<TConfigurationFile>
  ) {
    if (typeof jsonSchema === 'string') {
      jsonSchema = JsonSchema.fromFile(jsonSchema);
    }

    this._schema = jsonSchema;
    this._jsonPathMetadata = options?.jsonPathMetadata || {};
    this._propertyInheritanceTypes = options?.propertyInheritanceTypes || {};
  }

  public async loadConfigurationFileAsync(configurationFilePath: string): Promise<TConfigurationFile> {
    return await this._loadConfigurationFileAsyncInner(
      path.resolve(configurationFilePath),
      new Set<string>()
    );
  }

  private async _loadConfigurationFileAsyncInner(
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>
  ): Promise<TConfigurationFile> {
    let cacheEntry:
      | IConfigurationFileCacheEntry<TConfigurationFile>
      | undefined = this._configurationFileCache.get(resolvedConfigurationFilePath);
    if (!cacheEntry) {
      try {
        if (visitedConfigurationFilePaths.has(resolvedConfigurationFilePath)) {
          throw new Error(
            'A loop has been detected in the "extends" properties of configuration file at ' +
              `"${resolvedConfigurationFilePath}".`
          );
        }

        visitedConfigurationFilePaths.add(resolvedConfigurationFilePath);

        const configurationJson: IConfigurationJson &
          TConfigurationFile = await JsonFile.loadAndValidateAsync(
          resolvedConfigurationFilePath,
          this._schema
        );


        for (const [jsonPath, metadata] of Object.entries(this._jsonPathMetadata)) {
          JSONPath({
            path: jsonPath,
            json: configurationJson,
            callback: (payload: unknown, payloadType: string, fullPayload: IJsonPathCallbackObject) => {
              if (metadata.pathResolutionMethod !== undefined) {
                fullPayload.parent[fullPayload.parentProperty] = this._resolvePathProperty(
                  resolvedConfigurationFilePath,
                  fullPayload.value,
                  metadata.pathResolutionMethod
                );
              }
            },
            otherTypeCallback: () => {
              throw new Error('@other() tags are not supported');
            }
          });
        }

        let parentConfiguration: Partial<TConfigurationFile> = {};
        if (configurationJson.extends) {
          const resolvedParentConfigPath: string = path.resolve(
            path.dirname(resolvedConfigurationFilePath),
            configurationJson.extends
          );
          parentConfiguration = await this._loadConfigurationFileAsyncInner(
            resolvedParentConfigPath,
            visitedConfigurationFilePaths
          );
        }

        const propertyNames: Set<string> = new Set<string>([
          ...Object.keys(parentConfiguration),
          ...Object.keys(configurationJson)
        ]);

        const result: TConfigurationFile = {} as TConfigurationFile;
        for (const propertyName of propertyNames) {
          if (propertyName === '$schema' || propertyName === 'extends') {
            continue;
          }

          result[propertyName] = this._handlePropertyInheritance(
            propertyName,
            configurationJson[propertyName],
            parentConfiguration[propertyName],
            this._propertyInheritanceTypes[propertyName]
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

  private _resolvePathProperty(
    configurationFilePath: string,
    propertyValue: string,
    resolutionMethod: PathResolutionMethod | undefined
  ): string {
    switch (resolutionMethod) {
      case PathResolutionMethod.resolvePathRelativeToConfigurationFile: {
        return path.resolve(path.dirname(configurationFilePath), propertyValue);
      }

      case PathResolutionMethod.resolvePathRelativeToProjectRoot: {
        const packageRoot: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(
          configurationFilePath
        );
        if (!packageRoot) {
          throw new Error(`Could not find a package root for path "${configurationFilePath}"`);
        }

        return path.resolve(packageRoot, propertyValue);
      }

      case PathResolutionMethod.NodeResolve: {
        return Resolve.resolvePackagePath(propertyValue, configurationFilePath);
      }

      default: {
        return propertyValue;
      }
    }
  }
}
