// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'path';
import { JSONPath } from 'jsonpath-plus';
import {
  JsonSchema,
  JsonFile,
  PackageJsonLookup,
  Import,
  FileSystem,
  Terminal
} from '@rushstack/node-core-library';
import { RigConfig } from '@rushstack/rig-package';

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
  replace = 'replace',

  /**
   * Custom inheritance functionality
   */
  custom = 'custom'
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

const CONFIGURATION_FILE_FIELD_ANNOTATION: unique symbol = Symbol('configuration-file-field-annotation');

interface IAnnotatedField<TField> {
  [CONFIGURATION_FILE_FIELD_ANNOTATION]: IConfigurationFileFieldAnnotation<TField>;
}

interface IConfigurationFileFieldAnnotation<TField> {
  configurationFilePath: string | undefined;
  originalValues: { [propertyName in keyof TField]: unknown };
}

interface IConfigurationFileCacheEntry<TConfigurationFile> {
  configurationFile?: TConfigurationFile;
  error?: Error;
}

/**
 * Used to specify how node(s) in a JSON object should be processed after being loaded.
 *
 * @beta
 */
export interface IJsonPathMetadata {
  /**
   * If this property describes a filesystem path, use this property to describe
   * how the path should be resolved.
   */
  pathResolutionMethod?: PathResolutionMethod;
}

/**
 * @beta
 */
export type PropertyInheritanceCustomFunction<TObject> = (
  currentObject: TObject,
  parentObject: TObject
) => TObject;

/**
 * @beta
 */
export interface IPropertyInheritance<TInheritanceType extends InheritanceType> {
  inheritanceType: TInheritanceType;
}

/**
 * @beta
 */
export interface ICustomPropertyInheritance<TObject> extends IPropertyInheritance<InheritanceType.custom> {
  /**
   * Provides a custom inheritance function. This function takes two arguments: the first is the
   * child file's object, and the second is the parent file's object. The function should return
   * the resulting combined object.
   */
  inheritanceFunction: PropertyInheritanceCustomFunction<TObject>;
}

/**
 * @beta
 */
export type IPropertiesInheritance<TConfigurationFile> = {
  [propertyName in keyof TConfigurationFile]?:
    | IPropertyInheritance<InheritanceType.append | InheritanceType.replace>
    | ICustomPropertyInheritance<TConfigurationFile[propertyName]>;
};

/**
 * Keys in this object are JSONPaths {@link https://jsonpath.com/}, and values are objects
 * that describe how node(s) selected by the JSONPath are processed after loading.
 *
 * @beta
 */
export interface IJsonPathsMetadata {
  [jsonPath: string]: IJsonPathMetadata;
}

/**
 * @beta
 */
export interface IConfigurationFileOptions<TConfigurationFile> {
  /**
   * A project root-relative path to the configuration file that should be loaded.
   */
  projectRelativeFilePath: string;

  /**
   * The path to the schema for the configuration file.
   */
  jsonSchemaPath: string;

  /**
   * Use this property to specify how JSON nodes are postprocessed.
   */
  jsonPathMetadata?: IJsonPathsMetadata;

  /**
   * Use this property to control how root-level properties are handled between parent and child
   * configuration files.
   */
  propertyInheritance?: IPropertiesInheritance<TConfigurationFile>;
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
export interface IOriginalValueOptions<TParentProperty> {
  parentObject: TParentProperty;
  propertyName: keyof TParentProperty;
}

/**
 * @beta
 */
export class ConfigurationFile<TConfigurationFile> {
  private readonly _schemaPath: string;
  private readonly _projectRelativeFilePath: string;
  private readonly _jsonPathMetadata: IJsonPathsMetadata;
  private readonly _propertyInheritanceTypes: IPropertiesInheritance<TConfigurationFile>;
  private __schema: JsonSchema | undefined;
  private get _schema(): JsonSchema {
    if (!this.__schema) {
      this.__schema = JsonSchema.fromFile(this._schemaPath);
    }

    return this.__schema;
  }

  private readonly _configurationFileCache: Map<
    string,
    IConfigurationFileCacheEntry<TConfigurationFile>
  > = new Map<string, IConfigurationFileCacheEntry<TConfigurationFile>>();
  private readonly _fileExistsCache: Map<string, boolean> = new Map<string, boolean>();
  private readonly _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  public constructor(options: IConfigurationFileOptions<TConfigurationFile>) {
    this._projectRelativeFilePath = options.projectRelativeFilePath;
    this._schemaPath = options.jsonSchemaPath;
    this._jsonPathMetadata = options.jsonPathMetadata || {};
    this._propertyInheritanceTypes = options.propertyInheritance || {};
  }

  public async loadConfigurationFileForProjectAsync(
    terminal: Terminal,
    projectPath: string,
    rigConfig?: RigConfig
  ): Promise<TConfigurationFile> {
    const projectConfigurationFilePath: string = this._getConfigurationFilePathForProject(projectPath);
    return await this._loadConfigurationFileInnerWithCacheAsync(
      terminal,
      projectConfigurationFilePath,
      new Set<string>(),
      rigConfig
    );
  }

  /**
   * This function is identical to {@link ConfigurationFile.loadConfigurationFileForProjectAsync}, except
   * that a preliminary file existence check is performed and this function returns `undefined` if the
   * configuration file doesn't exist.
   */
  public async tryLoadConfigurationFileForProjectAsync(
    terminal: Terminal,
    projectPath: string,
    rigConfig?: RigConfig
  ): Promise<TConfigurationFile | undefined> {
    const projectConfigurationFilePath: string = this._getConfigurationFilePathForProject(projectPath);
    const projectConfigurationFilePathForLogging: string = ConfigurationFile._formatPathForLogging(
      projectConfigurationFilePath
    );
    let exists: boolean | undefined = this._fileExistsCache.get(projectConfigurationFilePath);
    if (exists === undefined) {
      exists = await FileSystem.existsAsync(projectConfigurationFilePath);
      this._fileExistsCache.set(projectConfigurationFilePath, exists);
    }

    if (!exists) {
      if (rigConfig) {
        terminal.writeVerboseLine(
          `Config file "${projectConfigurationFilePathForLogging}" does not exist. Attempting to load via rig.`
        );
        return await this._tryLoadConfigurationFileInRigAsync(terminal, rigConfig, new Set<string>());
      } else {
        return undefined;
      }
    } else {
      return await this._loadConfigurationFileInnerWithCacheAsync(
        terminal,
        projectConfigurationFilePath,
        new Set<string>(),
        undefined
      );
    }
  }

  /**
   * @internal
   */
  public static _formatPathForLogging: (path: string) => string = (path: string) => path;

  /**
   * Get the path to the source file that the referenced property was originally
   * loaded from.
   */
  public getObjectSourceFilePath<TObject extends object>(obj: TObject): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const annotation: IConfigurationFileFieldAnnotation<TObject> | undefined = (obj as any)[
      CONFIGURATION_FILE_FIELD_ANNOTATION
    ];
    if (annotation) {
      return annotation.configurationFilePath;
    }

    return undefined;
  }

  /**
   * Get the value of the specified property on the specified object that was originally
   * loaded from a configuration file.
   */
  public getPropertyOriginalValue<TParentProperty extends object, TValue>(
    options: IOriginalValueOptions<TParentProperty>
  ): TValue | undefined {
    const annotation: IConfigurationFileFieldAnnotation<TParentProperty> | undefined =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options.parentObject as any)[CONFIGURATION_FILE_FIELD_ANNOTATION];
    if (annotation && annotation.originalValues.hasOwnProperty(options.propertyName)) {
      return annotation.originalValues[options.propertyName] as TValue;
    } else {
      return undefined;
    }
  }

  private async _loadConfigurationFileInnerWithCacheAsync(
    terminal: Terminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    rigConfig: RigConfig | undefined
  ): Promise<TConfigurationFile> {
    let cacheEntry:
      | IConfigurationFileCacheEntry<TConfigurationFile>
      | undefined = this._configurationFileCache.get(resolvedConfigurationFilePath);
    if (!cacheEntry) {
      try {
        cacheEntry = {
          configurationFile: await this._loadConfigurationFileInnerAsync(
            terminal,
            resolvedConfigurationFilePath,
            visitedConfigurationFilePaths,
            rigConfig
          )
        };
      } catch (e) {
        cacheEntry = { error: e };
      }
    } else {
      terminal.writeVerboseLine(
        `Found "${ConfigurationFile._formatPathForLogging(
          resolvedConfigurationFilePath
        )}" in ConfigurationFile path.`
      );
    }

    if (cacheEntry.error) {
      throw cacheEntry.error;
    } else {
      return cacheEntry.configurationFile! as TConfigurationFile;
    }
  }

  private async _loadConfigurationFileInnerAsync(
    terminal: Terminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    rigConfig: RigConfig | undefined
  ): Promise<TConfigurationFile> {
    const resolvedConfigurationFilePathForLogging: string = ConfigurationFile._formatPathForLogging(
      resolvedConfigurationFilePath
    );

    if (visitedConfigurationFilePaths.has(resolvedConfigurationFilePath)) {
      throw new Error(
        'A loop has been detected in the "extends" properties of configuration file at ' +
          `"${resolvedConfigurationFilePathForLogging}".`
      );
    }

    visitedConfigurationFilePaths.add(resolvedConfigurationFilePath);

    let fileText: string;
    try {
      fileText = await FileSystem.readFileAsync(resolvedConfigurationFilePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        terminal.writeVerboseLine(
          `Configuration file "${resolvedConfigurationFilePathForLogging}" not found.`
        );
        if (rigConfig) {
          const rigResult: TConfigurationFile | undefined = await this._tryLoadConfigurationFileInRigAsync(
            terminal,
            rigConfig,
            visitedConfigurationFilePaths
          );
          if (rigResult) {
            return rigResult;
          }
        }

        e.message = `File does not exist: ${resolvedConfigurationFilePathForLogging}`;
      }

      throw e;
    }

    let configurationJson: IConfigurationJson & TConfigurationFile;
    try {
      configurationJson = await JsonFile.parseString(fileText);
    } catch (e) {
      throw new Error(`In config file "${resolvedConfigurationFilePathForLogging}": ${e}`);
    }

    this._schema.validateObject(configurationJson, resolvedConfigurationFilePathForLogging);

    this._annotateProperties(resolvedConfigurationFilePath, configurationJson);

    for (const [jsonPath, metadata] of Object.entries(this._jsonPathMetadata)) {
      JSONPath({
        path: jsonPath,
        json: configurationJson,
        callback: (payload: unknown, payloadType: string, fullPayload: IJsonPathCallbackObject) => {
          if (metadata.pathResolutionMethod !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fullPayload.parent as any)[fullPayload.parentProperty] = this._resolvePathProperty(
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
      try {
        const resolvedParentConfigPath: string = Import.resolveModule({
          modulePath: configurationJson.extends,
          baseFolderPath: nodeJsPath.dirname(resolvedConfigurationFilePath)
        });
        parentConfiguration = await this._loadConfigurationFileInnerWithCacheAsync(
          terminal,
          resolvedParentConfigPath,
          visitedConfigurationFilePaths,
          undefined
        );
      } catch (e) {
        if (FileSystem.isNotExistError(e)) {
          throw new Error(
            `In file "${resolvedConfigurationFilePathForLogging}", file referenced in "extends" property ` +
              `("${configurationJson.extends}") cannot be resolved.`
          );
        } else {
          throw e;
        }
      }
    }

    const propertyNames: Set<string> = new Set<string>([
      ...Object.keys(parentConfiguration),
      ...Object.keys(configurationJson)
    ]);

    const resultAnnotation: IConfigurationFileFieldAnnotation<TConfigurationFile> = {
      configurationFilePath: resolvedConfigurationFilePath,
      originalValues: {} as TConfigurationFile
    };
    const result: TConfigurationFile = ({
      [CONFIGURATION_FILE_FIELD_ANNOTATION]: resultAnnotation
    } as unknown) as TConfigurationFile;
    for (const propertyName of propertyNames) {
      if (propertyName === '$schema' || propertyName === 'extends') {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propertyValue: unknown | undefined = (configurationJson as any)[propertyName];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parentPropertyValue: unknown | undefined = (parentConfiguration as any)[propertyName];

      const bothAreArrays: boolean = Array.isArray(propertyValue) && Array.isArray(parentPropertyValue);
      const defaultInheritanceType: IPropertyInheritance<InheritanceType> = bothAreArrays
        ? { inheritanceType: InheritanceType.append }
        : { inheritanceType: InheritanceType.replace };
      const propertyInheritance: IPropertyInheritance<InheritanceType> =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this._propertyInheritanceTypes as any)[propertyName] !== undefined
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this._propertyInheritanceTypes as any)[propertyName]
          : defaultInheritanceType;

      let newValue: unknown;
      const usePropertyValue: () => void = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (resultAnnotation.originalValues as any)[propertyName] = this.getPropertyOriginalValue<any, any>({
          parentObject: configurationJson,
          propertyName: propertyName
        });
        newValue = propertyValue;
      };
      const useParentPropertyValue: () => void = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (resultAnnotation.originalValues as any)[propertyName] = this.getPropertyOriginalValue<any, any>({
          parentObject: parentConfiguration,
          propertyName: propertyName
        });
        newValue = parentPropertyValue;
      };

      if (propertyValue && !parentPropertyValue) {
        usePropertyValue();
      } else if (parentPropertyValue && !propertyValue) {
        useParentPropertyValue();
      } else {
        switch (propertyInheritance.inheritanceType) {
          case InheritanceType.replace: {
            if (propertyValue !== undefined) {
              usePropertyValue();
            } else {
              useParentPropertyValue();
            }

            break;
          }

          case InheritanceType.append: {
            if (propertyValue !== undefined && parentPropertyValue === undefined) {
              usePropertyValue();
            } else if (propertyValue === undefined && parentPropertyValue !== undefined) {
              useParentPropertyValue();
            } else {
              if (!Array.isArray(propertyValue) || !Array.isArray(parentPropertyValue)) {
                throw new Error(
                  `Issue in processing configuration file property "${propertyName}". ` +
                    `Property is not an array, but the inheritance type is set as "${InheritanceType.append}"`
                );
              }

              newValue = [...parentPropertyValue, ...propertyValue];
              ((newValue as unknown) as IAnnotatedField<unknown[]>)[CONFIGURATION_FILE_FIELD_ANNOTATION] = {
                configurationFilePath: undefined,
                originalValues: {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...(parentPropertyValue as any)[CONFIGURATION_FILE_FIELD_ANNOTATION].originalValues,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ...(propertyValue as any)[CONFIGURATION_FILE_FIELD_ANNOTATION].originalValues
                }
              };
            }

            break;
          }

          case InheritanceType.custom: {
            const customInheritance: ICustomPropertyInheritance<unknown> = propertyInheritance as ICustomPropertyInheritance<
              unknown
            >;
            if (
              !customInheritance.inheritanceFunction ||
              typeof customInheritance.inheritanceFunction !== 'function'
            ) {
              throw new Error(
                'For property inheritance type "InheritanceType.custom", an inheritanceFunction must be provided.'
              );
            }

            newValue = customInheritance.inheritanceFunction(propertyValue, parentPropertyValue);

            break;
          }

          default: {
            throw new Error(`Unknown inheritance type "${propertyInheritance}"`);
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any)[propertyName] = newValue;
    }

    try {
      this._schema.validateObject(result, resolvedConfigurationFilePathForLogging);
    } catch (e) {
      throw new Error(`Resolved configuration object does not match schema: ${e}`);
    }

    return result;
  }

  private async _tryLoadConfigurationFileInRigAsync(
    terminal: Terminal,
    rigConfig: RigConfig,
    visitedConfigurationFilePaths: Set<string>
  ): Promise<TConfigurationFile | undefined> {
    if (rigConfig.rigFound) {
      const rigProfileFolder: string = await rigConfig.getResolvedProfileFolderAsync();
      try {
        return await this._loadConfigurationFileInnerWithCacheAsync(
          terminal,
          nodeJsPath.resolve(rigProfileFolder, this._projectRelativeFilePath),
          visitedConfigurationFilePaths,
          undefined
        );
      } catch (e) {
        // Ignore cases where a configuration file doesn't exist in a rig
        if (!FileSystem.isNotExistError(e)) {
          throw e;
        } else {
          terminal.writeVerboseLine(
            `Configuration file "${
              this._projectRelativeFilePath
            }" not found in rig ("${ConfigurationFile._formatPathForLogging(rigProfileFolder)}")`
          );
        }
      }
    } else {
      terminal.writeVerboseLine(
        `No rig found for "${ConfigurationFile._formatPathForLogging(rigConfig.projectFolderPath)}"`
      );
    }

    return undefined;
  }

  private _annotateProperties<TObject>(resolvedConfigurationFilePath: string, obj: TObject): void {
    if (!obj) {
      return;
    }

    if (typeof obj === 'object') {
      this._annotateProperty(resolvedConfigurationFilePath, obj);

      for (const objValue of Object.values(obj)) {
        this._annotateProperties(resolvedConfigurationFilePath, objValue);
      }
    }
  }

  private _annotateProperty<TObject>(resolvedConfigurationFilePath: string, obj: TObject): void {
    if (!obj) {
      return;
    }

    if (typeof obj === 'object') {
      ((obj as unknown) as IAnnotatedField<TObject>)[CONFIGURATION_FILE_FIELD_ANNOTATION] = {
        configurationFilePath: resolvedConfigurationFilePath,
        originalValues: { ...obj }
      };
    }
  }

  private _resolvePathProperty(
    configurationFilePath: string,
    propertyValue: string,
    resolutionMethod: PathResolutionMethod | undefined
  ): string {
    switch (resolutionMethod) {
      case PathResolutionMethod.resolvePathRelativeToConfigurationFile: {
        return nodeJsPath.resolve(nodeJsPath.dirname(configurationFilePath), propertyValue);
      }

      case PathResolutionMethod.resolvePathRelativeToProjectRoot: {
        const packageRoot: string | undefined = this._packageJsonLookup.tryGetPackageFolderFor(
          configurationFilePath
        );
        if (!packageRoot) {
          throw new Error(
            `Could not find a package root for path "${ConfigurationFile._formatPathForLogging(
              configurationFilePath
            )}"`
          );
        }

        return nodeJsPath.resolve(packageRoot, propertyValue);
      }

      case PathResolutionMethod.NodeResolve: {
        return Import.resolveModule({
          modulePath: propertyValue,
          baseFolderPath: nodeJsPath.dirname(configurationFilePath)
        });
      }

      default: {
        return propertyValue;
      }
    }
  }

  private _getConfigurationFilePathForProject(projectPath: string): string {
    return nodeJsPath.resolve(projectPath, this._projectRelativeFilePath);
  }
}
