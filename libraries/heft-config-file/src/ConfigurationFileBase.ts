// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as nodeJsPath from 'node:path';

import { JSONPath } from 'jsonpath-plus';
import structuredClone from '@ungap/structured-clone';

import { JsonSchema, JsonFile, Import, FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

interface IConfigurationJson {
  extends?: string;
}

/* eslint-disable @typescript-eslint/typedef,@typescript-eslint/no-redeclare,@typescript-eslint/no-namespace,@typescript-eslint/naming-convention */
// This structure is used so that consumers can pass raw string literals and have it typecheck, without breaking existing callers.
/**
 * @beta
 *
 * The set of possible mechanisms for merging properties from parent configuration files.
 * If a child configuration file sets a property value to `null`, that will always delete the value
 * specified in the parent configuration file, regardless of the inheritance type.
 */
const InheritanceType = {
  /**
   * Append additional elements after elements from the parent file's property. Only applicable
   * for arrays.
   */
  append: 'append',

  /**
   * Perform a shallow merge of additional elements after elements from the parent file's property.
   * Only applicable for objects.
   */
  merge: 'merge',

  /**
   * Discard elements from the parent file's property
   */
  replace: 'replace',

  /**
   * Custom inheritance functionality
   */
  custom: 'custom'
} as const;
/**
 * @beta
 */
type InheritanceType = (typeof InheritanceType)[keyof typeof InheritanceType];
/**
 * @beta
 */
declare namespace InheritanceType {
  /**
   * Append additional elements after elements from the parent file's property. Only applicable
   * for arrays.
   */
  export type append = typeof InheritanceType.append;

  /**
   * Perform a shallow merge of additional elements after elements from the parent file's property.
   * Only applicable for objects.
   */
  export type merge = typeof InheritanceType.merge;

  /**
   * Discard elements from the parent file's property
   */
  export type replace = typeof InheritanceType.replace;

  /**
   * Custom inheritance functionality
   */
  export type custom = typeof InheritanceType.custom;
}
export { InheritanceType };

/**
 * @beta
 *
 * The set of possible resolution methods for fields that refer to paths.
 */
const PathResolutionMethod = {
  /**
   * Resolve a path relative to the configuration file
   */
  resolvePathRelativeToConfigurationFile: 'resolvePathRelativeToConfigurationFile',

  /**
   * Resolve a path relative to the root of the project containing the configuration file
   */
  resolvePathRelativeToProjectRoot: 'resolvePathRelativeToProjectRoot',

  /**
   * Treat the property as a NodeJS-style require/import reference and resolve using standard
   * NodeJS filesystem resolution
   *
   * @deprecated
   * Use {@link (PathResolutionMethod:variable).nodeResolve} instead
   */
  NodeResolve: 'NodeResolve',

  /**
   * Treat the property as a NodeJS-style require/import reference and resolve using standard
   * NodeJS filesystem resolution
   */
  nodeResolve: 'nodeResolve',

  /**
   * Resolve the property using a custom resolver.
   */
  custom: 'custom'
} as const;
/**
 * @beta
 */
type PathResolutionMethod = (typeof PathResolutionMethod)[keyof typeof PathResolutionMethod];
/**
 * @beta
 */
declare namespace PathResolutionMethod {
  /**
   * Resolve a path relative to the configuration file
   */
  export type resolvePathRelativeToConfigurationFile =
    typeof PathResolutionMethod.resolvePathRelativeToConfigurationFile;

  /**
   * Resolve a path relative to the root of the project containing the configuration file
   */
  export type resolvePathRelativeToProjectRoot = typeof PathResolutionMethod.resolvePathRelativeToProjectRoot;

  /**
   * Treat the property as a NodeJS-style require/import reference and resolve using standard
   * NodeJS filesystem resolution
   *
   * @deprecated
   * Use {@link (PathResolutionMethod:namespace).nodeResolve} instead
   */
  export type NodeResolve = typeof PathResolutionMethod.NodeResolve;

  /**
   * Treat the property as a NodeJS-style require/import reference and resolve using standard
   * NodeJS filesystem resolution
   */
  export type nodeResolve = typeof PathResolutionMethod.nodeResolve;

  /**
   * Resolve the property using a custom resolver.
   */
  export type custom = typeof PathResolutionMethod.custom;
}
export { PathResolutionMethod };
/* eslint-enable @typescript-eslint/typedef,@typescript-eslint/no-redeclare,@typescript-eslint/no-namespace,@typescript-eslint/naming-convention */

const CONFIGURATION_FILE_MERGE_BEHAVIOR_FIELD_REGEX: RegExp = /^\$([^\.]+)\.inheritanceType$/;
export const CONFIGURATION_FILE_FIELD_ANNOTATION: unique symbol = Symbol(
  'configuration-file-field-annotation'
);

export interface IAnnotatedField<
  TField,
  TConfigurationFileFieldAnnotation extends
    IConfigurationFileFieldAnnotation<TField> = IConfigurationFileFieldAnnotation<TField>
> {
  [CONFIGURATION_FILE_FIELD_ANNOTATION]: TConfigurationFileFieldAnnotation;
}

type IAnnotatedObject<TParentProperty> = Partial<IAnnotatedField<TParentProperty>>;
type IRootAnnotatedObject<TParentProperty> = Partial<
  IAnnotatedField<TParentProperty, IRootConfigurationFileFieldAnnotation<TParentProperty>>
>;

interface IConfigurationFileFieldAnnotation<TField> {
  configurationFilePath: string | undefined;
  originalValues: { [propertyName in keyof TField]: unknown };
}

interface IRootConfigurationFileFieldAnnotation<TField> extends IConfigurationFileFieldAnnotation<TField> {
  schemaPropertyOriginalValue?: string;
}

interface IObjectWithSchema {
  $schema?: string;
}

/**
 * Options provided to the custom resolver specified in {@link ICustomJsonPathMetadata}.
 *
 * @beta
 */
export interface IJsonPathMetadataResolverOptions<TConfigurationFile> {
  /**
   * The name of the property being resolved.
   */
  propertyName: string;
  /**
   * The value of the path property being resolved.
   */
  propertyValue: string;
  /**
   * The path to the configuration file the property was obtained from.
   */
  configurationFilePath: string;
  /**
   * The configuration file the property was obtained from.
   */
  configurationFile: Partial<TConfigurationFile>;
  /**
   * If this is a project configuration file, the root folder of the project.
   */
  projectFolderPath?: string;
}

/**
 * Used to specify how node(s) in a JSON object should be processed after being loaded.
 *
 * @beta
 */
export interface ICustomJsonPathMetadata<TConfigurationFile> {
  /**
   * If `ICustomJsonPathMetadata.pathResolutionMethod` is set to `PathResolutionMethod.custom`,
   * this property be used to resolve the path.
   */
  customResolver?: (resolverOptions: IJsonPathMetadataResolverOptions<TConfigurationFile>) => string;

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
   * This function will not be invoked if the current value is `null`, the property will simply be deleted.
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
export interface IPropertyInheritanceDefaults {
  array?: IPropertyInheritance<InheritanceType.append | InheritanceType.replace>;
  object?: IPropertyInheritance<InheritanceType.merge | InheritanceType.replace>;
}

/**
 * @beta
 */
export type IJsonPathMetadata<T> = ICustomJsonPathMetadata<T> | INonCustomJsonPathMetadata;

/**
 * Keys in this object are JSONPaths {@link https://jsonpath.com/}, and values are objects
 * that describe how node(s) selected by the JSONPath are processed after loading.
 *
 * @beta
 */
export interface IJsonPathsMetadata<TConfigurationFile> {
  [jsonPath: string]: IJsonPathMetadata<TConfigurationFile>;
}

/**
 * A function to invoke after schema validation to validate the configuration file.
 * If this function returns any value other than `true`, the configuration file API
 * will throw an error indicating that custom validation failed. If the function wishes
 * to provide its own error message, it may use any combination of the terminal and throwing
 * its own error.
 * @beta
 */
export type CustomValidationFunction<TConfigurationFile> = (
  configurationFile: TConfigurationFile,
  resolvedConfigurationFilePathForLogging: string,
  terminal: ITerminal
) => boolean;

/**
 * @beta
 */
export interface IConfigurationFileOptionsBase<TConfigurationFile> {
  /**
   * Use this property to specify how JSON nodes are postprocessed.
   */
  jsonPathMetadata?: IJsonPathsMetadata<TConfigurationFile>;

  /**
   * Use this property to control how root-level properties are handled between parent and child
   * configuration files.
   */
  propertyInheritance?: IPropertiesInheritance<TConfigurationFile>;

  /**
   * Use this property to control how specific property types are handled between parent and child
   * configuration files.
   */
  propertyInheritanceDefaults?: IPropertyInheritanceDefaults;

  /**
   * Use this property if you need to validate the configuration file in ways beyond what JSON schema can handle.
   * This function will be invoked after JSON schema validation.
   *
   * If the file is valid, this function should return `true`, otherwise `ConfigurationFile` will throw an error
   * indicating that custom validation failed. To suppress this error, the function may itself choose to throw.
   */
  customValidationFunction?: CustomValidationFunction<TConfigurationFile>;
}

/**
 * @beta
 */
export type IConfigurationFileOptionsWithJsonSchemaFilePath<
  TConfigurationFile,
  TExtraOptions extends {}
> = IConfigurationFileOptionsBase<TConfigurationFile> &
  TExtraOptions & {
    /**
     * The path to the schema for the configuration file.
     */
    jsonSchemaPath: string;
    jsonSchemaObject?: never;
  };

/**
 * @beta
 */
export type IConfigurationFileOptionsWithJsonSchemaObject<
  TConfigurationFile,
  TExtraOptions extends {}
> = IConfigurationFileOptionsBase<TConfigurationFile> &
  TExtraOptions & {
    /**
     * The schema for the configuration file.
     */
    jsonSchemaObject: object;
    jsonSchemaPath?: never;
  };

/**
 * @beta
 */
export type IConfigurationFileOptions<TConfigurationFile, TExtraOptions extends object> =
  | IConfigurationFileOptionsWithJsonSchemaFilePath<TConfigurationFile, TExtraOptions>
  | IConfigurationFileOptionsWithJsonSchemaObject<TConfigurationFile, TExtraOptions>;

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

interface IConfigurationFileCacheEntry<TConfigFile> {
  resolvedConfigurationFilePath: string;
  resolvedConfigurationFilePathForLogging: string;
  parent?: IConfigurationFileCacheEntry<TConfigFile>;
  configurationFile: TConfigFile & IConfigurationJson;
}

/**
 * Callback that returns a fallback configuration file path if the original configuration file was not found.
 * @beta
 */
export type IOnConfigurationFileNotFoundCallback = (
  resolvedConfigurationFilePathForLogging: string
) => string | undefined;

/**
 * @beta
 */
export abstract class ConfigurationFileBase<TConfigurationFile, TExtraOptions extends {}> {
  private readonly _getSchema: () => JsonSchema;

  private readonly _jsonPathMetadata: readonly [string, IJsonPathMetadata<TConfigurationFile>][];
  private readonly _propertyInheritanceTypes: IPropertiesInheritance<TConfigurationFile>;
  private readonly _defaultPropertyInheritance: IPropertyInheritanceDefaults;
  private readonly _customValidationFunction: CustomValidationFunction<TConfigurationFile> | undefined;
  private __schema: JsonSchema | undefined;
  private get _schema(): JsonSchema {
    if (!this.__schema) {
      this.__schema = this._getSchema();
    }

    return this.__schema;
  }

  private readonly _configCache: Map<string, IConfigurationFileCacheEntry<TConfigurationFile>> = new Map();
  private readonly _configPromiseCache: Map<
    string,
    Promise<IConfigurationFileCacheEntry<TConfigurationFile>>
  > = new Map();

  public constructor(options: IConfigurationFileOptions<TConfigurationFile, TExtraOptions>) {
    if (options.jsonSchemaObject) {
      this._getSchema = () => JsonSchema.fromLoadedObject(options.jsonSchemaObject);
    } else {
      this._getSchema = () => JsonSchema.fromFile(options.jsonSchemaPath);
    }

    this._jsonPathMetadata = Object.entries(options.jsonPathMetadata || {});
    this._propertyInheritanceTypes = options.propertyInheritance || {};
    this._defaultPropertyInheritance = options.propertyInheritanceDefaults || {};
    this._customValidationFunction = options.customValidationFunction;
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
    const { [CONFIGURATION_FILE_FIELD_ANNOTATION]: annotation }: IAnnotatedObject<TObject> = obj;
    return annotation?.configurationFilePath;
  }

  /**
   * Get the value of the specified property on the specified object that was originally
   * loaded from a configuration file.
   */
  public getPropertyOriginalValue<TParentProperty extends object, TValue>(
    options: IOriginalValueOptions<TParentProperty>
  ): TValue | undefined {
    const { parentObject, propertyName } = options;
    const { [CONFIGURATION_FILE_FIELD_ANNOTATION]: annotation }: IAnnotatedObject<TParentProperty> =
      parentObject;
    if (annotation?.originalValues.hasOwnProperty(propertyName)) {
      return annotation.originalValues[propertyName] as TValue;
    }
  }

  /**
   * Get the original value of the `$schema` property from the original configuration file, it one was present.
   */
  public getSchemaPropertyOriginalValue<TObject extends object>(obj: TObject): string | undefined {
    const { [CONFIGURATION_FILE_FIELD_ANNOTATION]: annotation }: IRootAnnotatedObject<TObject> = obj;
    return annotation?.schemaPropertyOriginalValue;
  }

  protected _loadConfigurationFileInnerWithCache(
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    projectFolderPath: string | undefined,
    onConfigurationFileNotFound?: IOnConfigurationFileNotFoundCallback
  ): TConfigurationFile {
    const visitedConfigurationFilePaths: Set<string> = new Set<string>();
    const cacheEntry: IConfigurationFileCacheEntry<TConfigurationFile> =
      this._loadConfigurationFileEntryWithCache(
        terminal,
        resolvedConfigurationFilePath,
        visitedConfigurationFilePaths,
        onConfigurationFileNotFound
      );

    const result: TConfigurationFile = this._finalizeConfigurationFile(
      cacheEntry,
      projectFolderPath,
      terminal
    );

    return result;
  }

  protected async _loadConfigurationFileInnerWithCacheAsync(
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    projectFolderPath: string | undefined,
    onFileNotFound?: IOnConfigurationFileNotFoundCallback
  ): Promise<TConfigurationFile> {
    const visitedConfigurationFilePaths: Set<string> = new Set<string>();
    const cacheEntry: IConfigurationFileCacheEntry<TConfigurationFile> =
      await this._loadConfigurationFileEntryWithCacheAsync(
        terminal,
        resolvedConfigurationFilePath,
        visitedConfigurationFilePaths,
        onFileNotFound
      );

    const result: TConfigurationFile = this._finalizeConfigurationFile(
      cacheEntry,
      projectFolderPath,
      terminal
    );

    return result;
  }

  private _loadConfigurationFileEntryWithCache(
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    onFileNotFound?: IOnConfigurationFileNotFoundCallback
  ): IConfigurationFileCacheEntry<TConfigurationFile> {
    if (visitedConfigurationFilePaths.has(resolvedConfigurationFilePath)) {
      const resolvedConfigurationFilePathForLogging: string = ConfigurationFileBase._formatPathForLogging(
        resolvedConfigurationFilePath
      );
      throw new Error(
        'A loop has been detected in the "extends" properties of configuration file at ' +
          `"${resolvedConfigurationFilePathForLogging}".`
      );
    }
    visitedConfigurationFilePaths.add(resolvedConfigurationFilePath);

    let cacheEntry: IConfigurationFileCacheEntry<TConfigurationFile> | undefined = this._configCache.get(
      resolvedConfigurationFilePath
    );
    if (!cacheEntry) {
      cacheEntry = this._loadConfigurationFileEntry(
        terminal,
        resolvedConfigurationFilePath,
        visitedConfigurationFilePaths,
        onFileNotFound
      );
      this._configCache.set(resolvedConfigurationFilePath, cacheEntry);
    }

    return cacheEntry;
  }

  private async _loadConfigurationFileEntryWithCacheAsync(
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    onConfigurationFileNotFound?: IOnConfigurationFileNotFoundCallback
  ): Promise<IConfigurationFileCacheEntry<TConfigurationFile>> {
    if (visitedConfigurationFilePaths.has(resolvedConfigurationFilePath)) {
      const resolvedConfigurationFilePathForLogging: string = ConfigurationFileBase._formatPathForLogging(
        resolvedConfigurationFilePath
      );
      throw new Error(
        'A loop has been detected in the "extends" properties of configuration file at ' +
          `"${resolvedConfigurationFilePathForLogging}".`
      );
    }
    visitedConfigurationFilePaths.add(resolvedConfigurationFilePath);

    let cacheEntryPromise: Promise<IConfigurationFileCacheEntry<TConfigurationFile>> | undefined =
      this._configPromiseCache.get(resolvedConfigurationFilePath);
    if (!cacheEntryPromise) {
      cacheEntryPromise = this._loadConfigurationFileEntryAsync(
        terminal,
        resolvedConfigurationFilePath,
        visitedConfigurationFilePaths,
        onConfigurationFileNotFound
      ).then((value: IConfigurationFileCacheEntry<TConfigurationFile>) => {
        this._configCache.set(resolvedConfigurationFilePath, value);
        return value;
      });
      this._configPromiseCache.set(resolvedConfigurationFilePath, cacheEntryPromise);
    }

    return await cacheEntryPromise;
  }

  /**
   * Parses the raw JSON-with-comments text of the configuration file.
   * @param fileText - The text of the configuration file
   * @param resolvedConfigurationFilePathForLogging - The path to the configuration file, formatted for logs
   * @returns The parsed configuration file
   */
  private _parseConfigurationFile(
    fileText: string,
    resolvedConfigurationFilePathForLogging: string
  ): IConfigurationJson & TConfigurationFile {
    let configurationJson: IConfigurationJson & TConfigurationFile;
    try {
      configurationJson = JsonFile.parseString(fileText);
    } catch (e) {
      throw new Error(`In configuration file "${resolvedConfigurationFilePathForLogging}": ${e}`);
    }

    return configurationJson;
  }

  /**
   * Resolves all path properties and annotates properties with their original values.
   * @param entry - The cache entry for the loaded configuration file
   * @param projectFolderPath - The project folder path, if applicable
   * @returns The configuration file with all path properties resolved
   */
  private _contextualizeConfigurationFile(
    entry: IConfigurationFileCacheEntry<TConfigurationFile>,
    projectFolderPath: string | undefined
  ): IConfigurationJson & TConfigurationFile {
    // Deep copy the configuration file because different callers might contextualize properties differently.
    // TODO: Replace this version of structuredClone with the built-in version once Node 16 support is dropped on the TikTok side
    const result: IConfigurationJson & TConfigurationFile = structuredClone<
      IConfigurationJson & TConfigurationFile
    >(entry.configurationFile);

    const { resolvedConfigurationFilePath } = entry;

    this._annotateProperties(resolvedConfigurationFilePath, result);

    for (const [jsonPath, metadata] of this._jsonPathMetadata) {
      JSONPath({
        path: jsonPath,
        json: result,
        callback: (payload: unknown, payloadType: string, fullPayload: IJsonPathCallbackObject) => {
          const resolvedPath: string = this._resolvePathProperty(
            {
              propertyName: fullPayload.path,
              propertyValue: fullPayload.value,
              configurationFilePath: resolvedConfigurationFilePath,
              configurationFile: result,
              projectFolderPath
            },
            metadata
          );
          (fullPayload.parent as Record<string, string>)[fullPayload.parentProperty] = resolvedPath;
        },
        otherTypeCallback: () => {
          throw new Error('@other() tags are not supported');
        }
      });
    }

    return result;
  }

  /**
   * Resolves all path properties and merges parent properties.
   * @param entry - The cache entry for the loaded configuration file
   * @param projectFolderPath - The project folder path, if applicable
   * @returns The flattened, unvalidated configuration file, with path properties resolved
   */
  private _contextualizeAndFlattenConfigurationFile(
    entry: IConfigurationFileCacheEntry<TConfigurationFile>,
    projectFolderPath: string | undefined
  ): Partial<TConfigurationFile> {
    const { parent, resolvedConfigurationFilePath } = entry;
    const parentConfig: TConfigurationFile | {} = parent
      ? this._contextualizeAndFlattenConfigurationFile(parent, projectFolderPath)
      : {};

    const currentConfig: IConfigurationJson & TConfigurationFile = this._contextualizeConfigurationFile(
      entry,
      projectFolderPath
    );

    const result: Partial<TConfigurationFile> = this._mergeConfigurationFiles(
      parentConfig,
      currentConfig,
      resolvedConfigurationFilePath
    );

    return result;
  }

  /**
   * Resolves all path properties, merges parent properties, and validates the configuration file.
   * @param entry - The cache entry for the loaded configuration file
   * @param projectFolderPath - The project folder path, if applicable
   * @param terminal - The terminal to log validation messages to
   * @returns The finalized configuration file
   */
  private _finalizeConfigurationFile(
    entry: IConfigurationFileCacheEntry<TConfigurationFile>,
    projectFolderPath: string | undefined,
    terminal: ITerminal
  ): TConfigurationFile {
    const { resolvedConfigurationFilePathForLogging } = entry;

    const result: Partial<TConfigurationFile> = this._contextualizeAndFlattenConfigurationFile(
      entry,
      projectFolderPath
    );

    try {
      this._schema.validateObject(result, resolvedConfigurationFilePathForLogging);
    } catch (e) {
      throw new Error(`Resolved configuration object does not match schema: ${e}`);
    }

    if (
      this._customValidationFunction &&
      !this._customValidationFunction(
        result as TConfigurationFile,
        resolvedConfigurationFilePathForLogging,
        terminal
      )
    ) {
      // To suppress this error, the function may throw its own error, such as an AlreadyReportedError if it already
      // logged to the terminal.
      throw new Error(
        `Resolved configuration file at "${resolvedConfigurationFilePathForLogging}" failed custom validation.`
      );
    }

    // If the schema validates, we can assume that the configuration file is complete.
    return result as TConfigurationFile;
  }

  // NOTE: Internal calls to load a configuration file should use `_loadConfigurationFileInnerWithCache`.
  // Don't call this function directly, as it does not provide config file loop detection,
  // and you won't get the advantage of queueing up for a config file that is already loading.
  private _loadConfigurationFileEntry(
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    fileNotFoundFallback?: IOnConfigurationFileNotFoundCallback
  ): IConfigurationFileCacheEntry<TConfigurationFile> {
    const resolvedConfigurationFilePathForLogging: string = ConfigurationFileBase._formatPathForLogging(
      resolvedConfigurationFilePath
    );

    let fileText: string;
    try {
      fileText = FileSystem.readFile(resolvedConfigurationFilePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        const fallbackPath: string | undefined = fileNotFoundFallback?.(
          resolvedConfigurationFilePathForLogging
        );
        if (fallbackPath) {
          try {
            return this._loadConfigurationFileEntryWithCache(
              terminal,
              fallbackPath,
              visitedConfigurationFilePaths
            );
          } catch (fallbackError) {
            if (!FileSystem.isNotExistError(fallbackError as Error)) {
              throw fallbackError;
            }
            // Otherwise report the missing original file.
          }
        }

        terminal.writeDebugLine(`Configuration file "${resolvedConfigurationFilePathForLogging}" not found.`);
        (e as Error).message = `File does not exist: ${resolvedConfigurationFilePathForLogging}`;
      }

      throw e;
    }
    const configurationJson: IConfigurationJson & TConfigurationFile = this._parseConfigurationFile(
      fileText,
      resolvedConfigurationFilePathForLogging
    );

    let parentConfiguration: IConfigurationFileCacheEntry<TConfigurationFile> | undefined;
    if (configurationJson.extends) {
      try {
        const resolvedParentConfigPath: string = Import.resolveModule({
          modulePath: configurationJson.extends,
          baseFolderPath: nodeJsPath.dirname(resolvedConfigurationFilePath)
        });
        parentConfiguration = this._loadConfigurationFileEntryWithCache(
          terminal,
          resolvedParentConfigPath,
          visitedConfigurationFilePaths
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

    const result: IConfigurationFileCacheEntry<TConfigurationFile> = {
      configurationFile: configurationJson,
      resolvedConfigurationFilePath,
      resolvedConfigurationFilePathForLogging,
      parent: parentConfiguration
    };
    return result;
  }

  // NOTE: Internal calls to load a configuration file should use `_loadConfigurationFileInnerWithCacheAsync`.
  // Don't call this function directly, as it does not provide config file loop detection,
  // and you won't get the advantage of queueing up for a config file that is already loading.
  private async _loadConfigurationFileEntryAsync(
    terminal: ITerminal,
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    fileNotFoundFallback?: IOnConfigurationFileNotFoundCallback
  ): Promise<IConfigurationFileCacheEntry<TConfigurationFile>> {
    const resolvedConfigurationFilePathForLogging: string = ConfigurationFileBase._formatPathForLogging(
      resolvedConfigurationFilePath
    );

    let fileText: string;
    try {
      fileText = await FileSystem.readFileAsync(resolvedConfigurationFilePath);
    } catch (e) {
      if (FileSystem.isNotExistError(e as Error)) {
        const fallbackPath: string | undefined = fileNotFoundFallback?.(
          resolvedConfigurationFilePathForLogging
        );
        if (fallbackPath) {
          try {
            return await this._loadConfigurationFileEntryWithCacheAsync(
              terminal,
              fallbackPath,
              visitedConfigurationFilePaths
            );
          } catch (fallbackError) {
            if (!FileSystem.isNotExistError(fallbackError as Error)) {
              throw fallbackError;
            }
            // Otherwise report the missing original file.
          }
        }

        terminal.writeDebugLine(`Configuration file "${resolvedConfigurationFilePathForLogging}" not found.`);
        (e as Error).message = `File does not exist: ${resolvedConfigurationFilePathForLogging}`;
      }

      throw e;
    }
    const configurationJson: IConfigurationJson & TConfigurationFile = this._parseConfigurationFile(
      fileText,
      resolvedConfigurationFilePathForLogging
    );

    let parentConfiguration: IConfigurationFileCacheEntry<TConfigurationFile> | undefined;
    if (configurationJson.extends) {
      try {
        const resolvedParentConfigPath: string = await Import.resolveModuleAsync({
          modulePath: configurationJson.extends,
          baseFolderPath: nodeJsPath.dirname(resolvedConfigurationFilePath)
        });
        parentConfiguration = await this._loadConfigurationFileEntryWithCacheAsync(
          terminal,
          resolvedParentConfigPath,
          visitedConfigurationFilePaths
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

    const result: IConfigurationFileCacheEntry<TConfigurationFile> = {
      configurationFile: configurationJson,
      resolvedConfigurationFilePath,
      resolvedConfigurationFilePathForLogging,
      parent: parentConfiguration
    };
    return result;
  }

  private _annotateProperties<TObject>(resolvedConfigurationFilePath: string, root: TObject): void {
    if (!root) {
      return;
    }

    const queue: Set<TObject> = new Set([root]);
    for (const obj of queue) {
      if (obj && typeof obj === 'object') {
        (obj as unknown as IAnnotatedField<TObject>)[CONFIGURATION_FILE_FIELD_ANNOTATION] = {
          configurationFilePath: resolvedConfigurationFilePath,
          originalValues: { ...obj }
        };

        for (const objValue of Object.values(obj)) {
          queue.add(objValue as TObject);
        }
      }
    }
  }

  private _resolvePathProperty(
    resolverOptions: IJsonPathMetadataResolverOptions<TConfigurationFile>,
    metadata: IJsonPathMetadata<TConfigurationFile>
  ): string {
    const { propertyValue, configurationFilePath, projectFolderPath } = resolverOptions;
    const resolutionMethod: PathResolutionMethod | undefined = metadata.pathResolutionMethod;
    if (resolutionMethod === undefined) {
      return propertyValue;
    }

    switch (metadata.pathResolutionMethod) {
      case PathResolutionMethod.resolvePathRelativeToConfigurationFile: {
        return nodeJsPath.resolve(nodeJsPath.dirname(configurationFilePath), propertyValue);
      }

      case PathResolutionMethod.resolvePathRelativeToProjectRoot: {
        const packageRoot: string | undefined = projectFolderPath;
        if (!packageRoot) {
          throw new Error(
            `Project-relative resolution was requested in "${ConfigurationFileBase._formatPathForLogging(
              configurationFilePath
            )}" but no project root was provided to the configuration file loader.`
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

        return metadata.customResolver(resolverOptions);
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
    const result: Partial<TConfigurationFile> = this._mergeObjects(
      parentConfiguration as { [key: string]: unknown },
      configurationJson as { [key: string]: unknown },
      resolvedConfigurationFilePath,
      this._defaultPropertyInheritance,
      this._propertyInheritanceTypes as IPropertiesInheritance<{ [key: string]: unknown }>,
      ignoreProperties
    ) as Partial<TConfigurationFile>;

    const schemaPropertyOriginalValue: string | undefined = (configurationJson as IObjectWithSchema).$schema;
    (result as unknown as Required<IRootAnnotatedObject<{}>>)[
      CONFIGURATION_FILE_FIELD_ANNOTATION
    ].schemaPropertyOriginalValue = schemaPropertyOriginalValue;

    return result;
  }

  private _mergeObjects<TField extends { [key: string]: unknown }>(
    parentObject: Partial<TField>,
    currentObject: Partial<TField>,
    resolvedConfigurationFilePath: string,
    defaultPropertyInheritance: IPropertyInheritanceDefaults,
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
    // A map of property names to their inheritance type.
    const inheritanceTypeMap: Map<keyof TField, IPropertyInheritance<InheritanceType>> = new Map();

    // The set of property names that should be included in the resulting object
    // All names from the parent are assumed to already be filtered.
    const mergedPropertyNames: Set<keyof TField> = new Set(Object.keys(parentObject));

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
        mergedPropertyNames.add(propertyName);
      }
    }

    // Cycle through properties and merge them
    for (const propertyName of mergedPropertyNames) {
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

      if (propertyValue === null) {
        if (parentPropertyValue !== undefined) {
          resultAnnotation.originalValues[propertyName] = this.getPropertyOriginalValue({
            parentObject: parentObject,
            propertyName: propertyName
          });
        }
        newValue = undefined;
      } else if (propertyValue !== undefined && parentPropertyValue === undefined) {
        usePropertyValue();
      } else if (parentPropertyValue !== undefined && propertyValue === undefined) {
        useParentPropertyValue();
      } else if (propertyValue !== undefined && parentPropertyValue !== undefined) {
        // If the property is an inheritance type annotation, use it, otherwise fallback to the configured
        // top-level property inheritance, if one is specified.
        let propertyInheritance: IPropertyInheritance<InheritanceType> | undefined =
          inheritanceTypeMap.get(propertyName) ?? configuredPropertyInheritance?.[propertyName];
        if (!propertyInheritance) {
          const bothAreArrays: boolean = Array.isArray(propertyValue) && Array.isArray(parentPropertyValue);
          if (bothAreArrays) {
            // If both are arrays, use the configured default array inheritance and fallback to appending
            // if one is not specified
            propertyInheritance = defaultPropertyInheritance.array ?? {
              inheritanceType: InheritanceType.append
            };
          } else {
            const bothAreObjects: boolean =
              propertyValue &&
              parentPropertyValue &&
              typeof propertyValue === 'object' &&
              typeof parentPropertyValue === 'object';
            if (bothAreObjects) {
              // If both are objects, use the configured default object inheritance and fallback to replacing
              // if one is not specified
              propertyInheritance = defaultPropertyInheritance.object ?? {
                inheritanceType: InheritanceType.replace
              };
            } else {
              // Fall back to replacing if they are of different types, since we don't know how to merge these
              propertyInheritance = { inheritanceType: InheritanceType.replace };
            }
          }
        }

        switch (propertyInheritance.inheritanceType) {
          case InheritanceType.replace: {
            usePropertyValue();

            break;
          }

          case InheritanceType.append: {
            if (!Array.isArray(propertyValue) || !Array.isArray(parentPropertyValue)) {
              throw new Error(
                `Issue in processing configuration file property "${propertyName.toString()}". ` +
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
                `Issue in processing configuration file property "${propertyName.toString()}". ` +
                  `Null values cannot be used when the inheritance type is set as "${InheritanceType.merge}"`
              );
            } else if (
              (propertyValue && typeof propertyValue !== 'object') ||
              (parentPropertyValue && typeof parentPropertyValue !== 'object')
            ) {
              throw new Error(
                `Issue in processing configuration file property "${propertyName.toString()}". ` +
                  `Primitive types cannot be provided when the inheritance type is set as "${InheritanceType.merge}"`
              );
            } else if (Array.isArray(propertyValue) || Array.isArray(parentPropertyValue)) {
              throw new Error(
                `Issue in processing configuration file property "${propertyName.toString()}". ` +
                  `Property is not a keyed object, but the inheritance type is set as "${InheritanceType.merge}"`
              );
            }

            // Recursively merge the parent and child objects. Don't pass the configuredPropertyInheritance or
            // ignoreProperties because we are no longer at the top level of the configuration file. We also know
            // that it must be a string-keyed object, since the JSON spec requires it.
            newValue = this._mergeObjects(
              parentPropertyValue as { [key: string]: unknown },
              propertyValue as { [key: string]: unknown },
              resolvedConfigurationFilePath,
              defaultPropertyInheritance
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

      if (newValue !== undefined) {
        // Don't attach the key for undefined values so that they don't enumerate.
        result[propertyName] = newValue;
      }
    }

    return result;
  }
}
