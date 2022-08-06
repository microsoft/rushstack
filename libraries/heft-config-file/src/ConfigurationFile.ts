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
  ITerminal
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
   * Append additional elements after elements from the parent file's property. Only applicable
   * for arrays.
   */
  append = 'append',

  /**
   * Perform a shallow merge of additional elements after elements from the parent file's property.
   * Only applicable for objects.
   */
  merge = 'merge',

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
  resolvePathRelativeToConfigurationFile = 'resolvePathRelativeToConfigurationFile',

  /**
   * Resolve a path relative to the root of the project containing the configuration file
   */
  resolvePathRelativeToProjectRoot = 'resolvePathRelativeToProjectRoot',

  /**
   * Treat the property as a NodeJS-style require/import reference and resolve using standard
   * NodeJS filesystem resolution
   *
   * @deprecated
   * Use {@link PathResolutionMethod.nodeResolve} instead
   */
  NodeResolve = 'NodeResolve',

  /**
   * Treat the property as a NodeJS-style require/import reference and resolve using standard
   * NodeJS filesystem resolution
   */
  nodeResolve = 'nodeResolve',

  /**
   * Resolve the property using a custom resolver.
   */
  custom = 'custom'
}

const CONFIGURATION_FILE_MERGE_BEHAVIOR_FIELD_REGEX: RegExp = /^\$([^\.]+)\.inheritanceType$/;
const CONFIGURATION_FILE_FIELD_ANNOTATION: unique symbol = Symbol('configuration-file-field-annotation');

interface IAnnotatedField<TField> {
  [CONFIGURATION_FILE_FIELD_ANNOTATION]: IConfigurationFileFieldAnnotation<TField>;
}

interface IConfigurationFileFieldAnnotation<TField> {
  configurationFilePath: string | undefined;
  originalValues: { [propertyName in keyof TField]: unknown };
}

/**
 * Used to specify how node(s) in a JSON object should be processed after being loaded.
 *
 * @beta
 */
export interface ICustomJsonPathMetadata {
  /**
   * If `ICustomJsonPathMetadata.pathResolutionMethod` is set to `PathResolutionMethod.custom`,
   * this property be used to resolve the path.
   */
  customResolver?: (configurationFilePath: string, propertyName: string, propertyValue: string) => string;

  /**
   * If this property describes a filesystem path, use this property to describe
   * how the path should be resolved.
   */
  pathResolutionMethod?: PathResolutionMethod.custom;
}

/**
 * Used to specify how node(s) in a JSON object should be processed after being loaded.
 *
 * @beta
 */
export interface INonCustomJsonPathMetadata {
  /**
   * If this property describes a filesystem path, use this property to describe
   * how the path should be resolved.
   */
  pathResolutionMethod?:
    | PathResolutionMethod.NodeResolve // TODO: Remove
    | PathResolutionMethod.nodeResolve
    | PathResolutionMethod.resolvePathRelativeToConfigurationFile
    | PathResolutionMethod.resolvePathRelativeToProjectRoot;
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
    | IPropertyInheritance<InheritanceType.append | InheritanceType.merge | InheritanceType.replace>
    | ICustomPropertyInheritance<TConfigurationFile[propertyName]>;
};

/**
 * @beta
 */
export type IJsonPathMetadata = ICustomJsonPathMetadata | INonCustomJsonPathMetadata;

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
  parentObject: Partial<TParentProperty>;
  propertyName: keyof TParentProperty;
}

/**
 * @beta
 */
export class ConfigurationFile<TConfigurationFile> {
  private readonly _schemaPath: string;

  /** {@inheritDoc IConfigurationFileOptions.projectRelativeFilePath} */
  public readonly projectRelativeFilePath: string;

  private readonly _jsonPathMetadata: IJsonPathsMetadata;
  private readonly _propertyInheritanceTypes: IPropertiesInheritance<TConfigurationFile>;
  private __schema: JsonSchema | undefined;
  private get _schema(): JsonSchema {
    if (!this.__schema) {
      this.__schema = JsonSchema.fromFile(this._schemaPath);
    }

    return this.__schema;
  }

  private readonly _configPromiseCache: Map<string, Promise<TConfigurationFile>> = new Map();
  private readonly _packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  public constructor(options: IConfigurationFileOptions<TConfigurationFile>) {
    this.projectRelativeFilePath = options.projectRelativeFilePath;
    this._schemaPath = options.jsonSchemaPath;
    this._jsonPathMetadata = options.jsonPathMetadata || {};
    this._propertyInheritanceTypes = options.propertyInheritance || {};
  }

  /**
   * Find and return a configuration file for the specified project, automatically resolving
   * `extends` properties and handling rigged configuration files. Will throw an error if a configuration
   * file cannot be found in the rig or project config folder.
   */
  public async loadConfigurationFileForProjectAsync(
    terminal: ITerminal,
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
   * that it returns `undefined` instead of throwing an error if the configuration file cannot be found.
   */
  public async tryLoadConfigurationFileForProjectAsync(
    terminal: ITerminal,
    projectPath: string,
    rigConfig?: RigConfig
  ): Promise<TConfigurationFile | undefined> {
    try {
      return await this.loadConfigurationFileForProjectAsync(terminal, projectPath, rigConfig);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        return undefined;
      }
      throw e;
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
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    rigConfig: RigConfig | undefined
  ): Promise<TConfigurationFile> {
    let cacheEntryPromise: Promise<TConfigurationFile> | undefined = this._configPromiseCache.get(
      resolvedConfigurationFilePath
    );
    if (!cacheEntryPromise) {
      cacheEntryPromise = this._loadConfigurationFileInnerAsync(
        terminal,
        resolvedConfigurationFilePath,
        visitedConfigurationFilePaths,
        rigConfig
      );
      this._configPromiseCache.set(resolvedConfigurationFilePath, cacheEntryPromise);
    }

    // We check for loops after caching a promise for this config file, but before attempting
    // to resolve the promise. We can't handle loop detection in the `InnerAsync` function, because
    // we could end up waiting for a cached promise (like A -> B -> A) that never resolves.
    if (visitedConfigurationFilePaths.has(resolvedConfigurationFilePath)) {
      const resolvedConfigurationFilePathForLogging: string = ConfigurationFile._formatPathForLogging(
        resolvedConfigurationFilePath
      );
      throw new Error(
        'A loop has been detected in the "extends" properties of configuration file at ' +
          `"${resolvedConfigurationFilePathForLogging}".`
      );
    }
    visitedConfigurationFilePaths.add(resolvedConfigurationFilePath);

    return await cacheEntryPromise;
  }

  // NOTE: Internal calls to load a configuration file should use `_loadConfigurationFileInnerWithCacheAsync`.
  // Don't call this function directly, as it does not provide config file loop detection,
  // and you won't get the advantage of queueing up for a config file that is already loading.
  private async _loadConfigurationFileInnerAsync(
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    rigConfig: RigConfig | undefined
  ): Promise<TConfigurationFile> {
    const resolvedConfigurationFilePathForLogging: string = ConfigurationFile._formatPathForLogging(
      resolvedConfigurationFilePath
    );

    let fileText: string;
    try {
      fileText = await FileSystem.readFileAsync(resolvedConfigurationFilePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        if (rigConfig) {
          terminal.writeDebugLine(
            `Config file "${resolvedConfigurationFilePathForLogging}" does not exist. Attempting to load via rig.`
          );
          const rigResult: TConfigurationFile | undefined = await this._tryLoadConfigurationFileInRigAsync(
            terminal,
            rigConfig,
            visitedConfigurationFilePaths
          );
          if (rigResult) {
            return rigResult;
          }
        } else {
          terminal.writeDebugLine(
            `Configuration file "${resolvedConfigurationFilePathForLogging}" not found.`
          );
        }

        (e as Error).message = `File does not exist: ${resolvedConfigurationFilePathForLogging}`;
      }

      throw e;
    }

    let configurationJson: IConfigurationJson & TConfigurationFile;
    try {
      configurationJson = await JsonFile.parseString(fileText);
    } catch (e) {
      throw new Error(`In config file "${resolvedConfigurationFilePathForLogging}": ${e}`);
    }

    this._annotateProperties(resolvedConfigurationFilePath, configurationJson);

    for (const [jsonPath, metadata] of Object.entries(this._jsonPathMetadata)) {
      JSONPath({
        path: jsonPath,
        json: configurationJson,
        callback: (payload: unknown, payloadType: string, fullPayload: IJsonPathCallbackObject) => {
          const resolvedPath: string = this._resolvePathProperty(
            resolvedConfigurationFilePath,
            fullPayload.path,
            fullPayload.value,
            metadata
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (fullPayload.parent as any)[fullPayload.parentProperty] = resolvedPath;
        },
        otherTypeCallback: () => {
          throw new Error('@other() tags are not supported');
        }
      });
    }

    let parentConfiguration: TConfigurationFile | undefined;
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
        if (FileSystem.isNotExistError(e as Error)) {
          throw new Error(
            `In file "${resolvedConfigurationFilePathForLogging}", file referenced in "extends" property ` +
              `("${configurationJson.extends}") cannot be resolved.`
          );
        } else {
          throw e;
        }
      }
    }

    const result: Partial<TConfigurationFile> = this._mergeConfigurationFiles(
      parentConfiguration || {},
      configurationJson,
      resolvedConfigurationFilePath
    );
    try {
      this._schema.validateObject(result, resolvedConfigurationFilePathForLogging);
    } catch (e) {
      throw new Error(`Resolved configuration object does not match schema: ${e}`);
    }

    // If the schema validates, we can assume that the configuration file is complete.
    return result as TConfigurationFile;
  }

  private async _tryLoadConfigurationFileInRigAsync(
    terminal: ITerminal,
    rigConfig: RigConfig,
    visitedConfigurationFilePaths: Set<string>
  ): Promise<TConfigurationFile | undefined> {
    if (rigConfig.rigFound) {
      const rigProfileFolder: string = await rigConfig.getResolvedProfileFolderAsync();
      try {
        return await this._loadConfigurationFileInnerWithCacheAsync(
          terminal,
          nodeJsPath.resolve(rigProfileFolder, this.projectRelativeFilePath),
          visitedConfigurationFilePaths,
          undefined
        );
      } catch (e) {
        // Ignore cases where a configuration file doesn't exist in a rig
        if (!FileSystem.isNotExistError(e as Error)) {
          throw e;
        } else {
          terminal.writeDebugLine(
            `Configuration file "${
              this.projectRelativeFilePath
            }" not found in rig ("${ConfigurationFile._formatPathForLogging(rigProfileFolder)}")`
          );
        }
      }
    } else {
      terminal.writeDebugLine(
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
      (obj as unknown as IAnnotatedField<TObject>)[CONFIGURATION_FILE_FIELD_ANNOTATION] = {
        configurationFilePath: resolvedConfigurationFilePath,
        originalValues: { ...obj }
      };
    }
  }

  private _resolvePathProperty(
    configurationFilePath: string,
    propertyName: string,
    propertyValue: string,
    metadata: IJsonPathMetadata
  ): string {
    const resolutionMethod: PathResolutionMethod | undefined = metadata.pathResolutionMethod;
    if (resolutionMethod === undefined) {
      return propertyValue;
    }

    switch (metadata.pathResolutionMethod) {
      case PathResolutionMethod.resolvePathRelativeToConfigurationFile: {
        return nodeJsPath.resolve(nodeJsPath.dirname(configurationFilePath), propertyValue);
      }

      case PathResolutionMethod.resolvePathRelativeToProjectRoot: {
        const packageRoot: string | undefined =
          this._packageJsonLookup.tryGetPackageFolderFor(configurationFilePath);
        if (!packageRoot) {
          throw new Error(
            `Could not find a package root for path "${ConfigurationFile._formatPathForLogging(
              configurationFilePath
            )}"`
          );
        }

        return nodeJsPath.resolve(packageRoot, propertyValue);
      }

      case PathResolutionMethod.NodeResolve: // TODO: Remove
      case PathResolutionMethod.nodeResolve: {
        return Import.resolveModule({
          modulePath: propertyValue,
          baseFolderPath: nodeJsPath.dirname(configurationFilePath)
        });
      }

      case PathResolutionMethod.custom: {
        if (!metadata.customResolver) {
          throw new Error(
            `The pathResolutionMethod was set to "${PathResolutionMethod[resolutionMethod]}", but a custom ` +
              'resolver was not provided.'
          );
        }

        return metadata.customResolver(configurationFilePath, propertyName, propertyValue);
      }

      default: {
        throw new Error(
          `Unsupported PathResolutionMethod: ${PathResolutionMethod[resolutionMethod]} (${resolutionMethod})`
        );
      }
    }
  }

  private _mergeConfigurationFiles(
    parentConfiguration: Partial<TConfigurationFile>,
    configurationJson: Partial<IConfigurationJson & TConfigurationFile>,
    resolvedConfigurationFilePath: string
  ): Partial<TConfigurationFile> {
    const ignoreProperties: Set<string> = new Set(['extends', '$schema']);

    // Need to do a dance with the casting here because while we know that JSON keys are always
    // strings, TypeScript doesn't.
    return this._mergeObjects(
      parentConfiguration as { [key: string]: unknown },
      configurationJson as { [key: string]: unknown },
      resolvedConfigurationFilePath,
      this._propertyInheritanceTypes as IPropertiesInheritance<{ [key: string]: unknown }>,
      ignoreProperties
    ) as Partial<TConfigurationFile>;
  }

  private _mergeObjects<TField extends { [key: string]: unknown }>(
    parentObject: Partial<TField>,
    currentObject: Partial<TField>,
    resolvedConfigurationFilePath: string,
    configuredPropertyInheritance?: IPropertiesInheritance<TField>,
    ignoreProperties?: Set<string>
  ): Partial<TField> {
    const resultAnnotation: IConfigurationFileFieldAnnotation<Partial<TField>> = {
      configurationFilePath: resolvedConfigurationFilePath,
      originalValues: {} as Partial<TField>
    };
    const result: Partial<TField> = {
      [CONFIGURATION_FILE_FIELD_ANNOTATION]: resultAnnotation
    } as unknown as Partial<TField>;

    // An array of property names that are on the merging object. Typed as Set<string> since it may
    // contain inheritance type annotation keys, or other built-in properties that we ignore
    // (eg. "extends", "$schema").
    const currentObjectPropertyNames: Set<string> = new Set(Object.keys(currentObject));
    // An array of property names that should be included in the resulting object.
    const filteredObjectPropertyNames: (keyof TField)[] = [];
    // A map of property names to their inheritance type.
    const inheritanceTypeMap: Map<keyof TField, IPropertyInheritance<InheritanceType>> = new Map();

    // Do a first pass to gather and strip the inheritance type annotations from the merging object.
    for (const propertyName of currentObjectPropertyNames) {
      if (ignoreProperties && ignoreProperties.has(propertyName)) {
        continue;
      }

      // Try to get the inheritance type annotation from the merging object using the regex.
      // Note: since this regex matches a specific style of property name, we should not need to
      // allow for any escaping of $-prefixed properties. If this ever changes (eg. to allow for
      // `"$propertyName": { ... }` options), then we'll likely need to handle that error case,
      // as well as allow escaping $-prefixed properties that developers want to be serialized,
      // possibly by using the form `$$propertyName` to escape `$propertyName`.
      const inheritanceTypeMatches: RegExpMatchArray | null = propertyName.match(
        CONFIGURATION_FILE_MERGE_BEHAVIOR_FIELD_REGEX
      );
      if (inheritanceTypeMatches) {
        // Should always be of length 2, since the first match is the entire string and the second
        // match is the capture group.
        const mergeTargetPropertyName: string = inheritanceTypeMatches[1];
        const inheritanceTypeRaw: unknown | undefined = currentObject[propertyName];
        if (!currentObjectPropertyNames.has(mergeTargetPropertyName)) {
          throw new Error(
            `Issue in processing configuration file property "${propertyName}". ` +
              `An inheritance type was provided but no matching property was found in the parent.`
          );
        } else if (typeof inheritanceTypeRaw !== 'string') {
          throw new Error(
            `Issue in processing configuration file property "${propertyName}". ` +
              `An unsupported inheritance type was provided: ${JSON.stringify(inheritanceTypeRaw)}`
          );
        } else if (typeof currentObject[mergeTargetPropertyName] !== 'object') {
          throw new Error(
            `Issue in processing configuration file property "${propertyName}". ` +
              `An inheritance type was provided for a property that is not a keyed object or array.`
          );
        }
        switch (inheritanceTypeRaw.toLowerCase()) {
          case 'append':
            inheritanceTypeMap.set(mergeTargetPropertyName, { inheritanceType: InheritanceType.append });
            break;
          case 'merge':
            inheritanceTypeMap.set(mergeTargetPropertyName, { inheritanceType: InheritanceType.merge });
            break;
          case 'replace':
            inheritanceTypeMap.set(mergeTargetPropertyName, { inheritanceType: InheritanceType.replace });
            break;
          default:
            throw new Error(
              `Issue in processing configuration file property "${propertyName}". ` +
                `An unsupported inheritance type was provided: "${inheritanceTypeRaw}"`
            );
        }
      } else {
        filteredObjectPropertyNames.push(propertyName);
      }
    }

    // We only filter the currentObject because the parent object should already be filtered
    const propertyNames: Set<keyof TField> = new Set([
      ...Object.keys(parentObject),
      ...filteredObjectPropertyNames
    ]);

    // Cycle through properties and merge them
    for (const propertyName of propertyNames) {
      const propertyValue: TField[keyof TField] | undefined = currentObject[propertyName];
      const parentPropertyValue: TField[keyof TField] | undefined = parentObject[propertyName];

      let newValue: TField[keyof TField] | undefined;
      const usePropertyValue: () => void = () => {
        resultAnnotation.originalValues[propertyName] = this.getPropertyOriginalValue({
          parentObject: currentObject,
          propertyName: propertyName
        });
        newValue = propertyValue;
      };
      const useParentPropertyValue: () => void = () => {
        resultAnnotation.originalValues[propertyName] = this.getPropertyOriginalValue({
          parentObject: parentObject,
          propertyName: propertyName
        });
        newValue = parentPropertyValue;
      };

      if (propertyValue !== undefined && parentPropertyValue === undefined) {
        usePropertyValue();
      } else if (parentPropertyValue !== undefined && propertyValue === undefined) {
        useParentPropertyValue();
      } else if (propertyValue !== undefined && parentPropertyValue !== undefined) {
        // If the property is an inheritance type annotation, use it. Fallback to the configuration file inheritance
        // behavior, and if one isn't specified, use the default.
        let propertyInheritance: IPropertyInheritance<InheritanceType> | undefined =
          inheritanceTypeMap.get(propertyName);
        if (!propertyInheritance) {
          const bothAreArrays: boolean = Array.isArray(propertyValue) && Array.isArray(parentPropertyValue);
          propertyInheritance =
            configuredPropertyInheritance?.[propertyName] ??
            (bothAreArrays
              ? { inheritanceType: InheritanceType.append }
              : { inheritanceType: InheritanceType.replace });
        }

        switch (propertyInheritance.inheritanceType) {
          case InheritanceType.replace: {
            usePropertyValue();

            break;
          }

          case InheritanceType.append: {
            if (!Array.isArray(propertyValue) || !Array.isArray(parentPropertyValue)) {
              throw new Error(
                `Issue in processing configuration file property "${String(propertyName)}". ` +
                  `Property is not an array, but the inheritance type is set as "${InheritanceType.append}"`
              );
            }

            newValue = [...parentPropertyValue, ...propertyValue] as TField[keyof TField];
            (newValue as unknown as IAnnotatedField<unknown[]>)[CONFIGURATION_FILE_FIELD_ANNOTATION] = {
              configurationFilePath: undefined,
              originalValues: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(parentPropertyValue as any)[CONFIGURATION_FILE_FIELD_ANNOTATION].originalValues,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(propertyValue as any)[CONFIGURATION_FILE_FIELD_ANNOTATION].originalValues
              }
            };

            break;
          }

          case InheritanceType.merge: {
            if (parentPropertyValue === null || propertyValue === null) {
              throw new Error(
                `Issue in processing configuration file property "${String(propertyName)}". ` +
                  `Null values cannot be used when the inheritance type is set as "${InheritanceType.merge}"`
              );
            } else if (
              (propertyValue && typeof propertyValue !== 'object') ||
              (parentPropertyValue && typeof parentPropertyValue !== 'object')
            ) {
              throw new Error(
                `Issue in processing configuration file property "${String(propertyName)}". ` +
                  `Primitive types cannot be provided when the inheritance type is set as "${InheritanceType.merge}"`
              );
            } else if (Array.isArray(propertyValue) || Array.isArray(parentPropertyValue)) {
              throw new Error(
                `Issue in processing configuration file property "${String(propertyName)}". ` +
                  `Property is not a keyed object, but the inheritance type is set as "${InheritanceType.merge}"`
              );
            }

            // Recursively merge the parent and child objects. Don't pass the configuredPropertyInheritance or
            // ignoreProperties because we are no longer at the top level of the configuration file. We also know
            // that it must be a string-keyed object, since the JSON spec requires it.
            newValue = this._mergeObjects(
              parentPropertyValue as { [key: string]: unknown },
              propertyValue as { [key: string]: unknown },
              resolvedConfigurationFilePath
            ) as TField[keyof TField];

            break;
          }

          case InheritanceType.custom: {
            const customInheritance: ICustomPropertyInheritance<TField[keyof TField] | undefined> =
              propertyInheritance as ICustomPropertyInheritance<TField[keyof TField] | undefined>;
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

      result[propertyName] = newValue;
    }

    return result;
  }

  private _getConfigurationFilePathForProject(projectPath: string): string {
    return nodeJsPath.resolve(projectPath, this.projectRelativeFilePath);
  }
}
