// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { IRigConfig } from '@rushstack/rig-package';
import type { CONFIGURATION_FILE_FIELD_ANNOTATION } from '@rushstack/heft-config-file/lib/ConfigurationFileAnnotation';

import { stripJsonCommentsAndTrailingCommas } from './LeanJson';
import { tryValidateSchemaObject } from './SchemaFastPath';
import { bail, isNotExistError, type LeanPackageJsonLookup } from './LeanResolution';

/**
 * The key of the annotation that `@rushstack/heft-config-file` attaches to every object in a loaded configuration
 * file. It is the same symbol (from a dependency-free module of heft-config-file), so plugins can read the
 * annotations with heft-config-file's APIs (e.g. `getObjectSourceFilePath()`), like before.
 */
export const LEAN_CONFIGURATION_FILE_FIELD_ANNOTATION: typeof CONFIGURATION_FILE_FIELD_ANNOTATION =
  require('@rushstack/heft-config-file/lib/ConfigurationFileAnnotation').CONFIGURATION_FILE_FIELD_ANNOTATION;

export interface ILeanConfigurationFileFieldAnnotation {
  configurationFilePath: string | undefined;
  originalValues: { [propertyName: string]: unknown };
  schemaPropertyOriginalValue?: string;
}

interface IAnnotatedObject {
  [LEAN_CONFIGURATION_FILE_FIELD_ANNOTATION]?: ILeanConfigurationFileFieldAnnotation;
}

type JsonObject = { [key: string]: unknown } & IAnnotatedObject;

export type LeanInheritanceType = 'append' | 'merge' | 'replace';
type InheritanceType = LeanInheritanceType;

export interface ILeanPropertyInheritanceDefaults {
  array: InheritanceType;
  object: InheritanceType;
}
type IPropertyInheritanceDefaults = ILeanPropertyInheritanceDefaults;

interface IConfigurationFileEntry {
  resolvedConfigurationFilePath: string;
  parent: IConfigurationFileEntry | undefined;
  configurationFile: JsonObject;
  // The file's text, in plain JSON syntax
  jsonText: string;
}

/**
 * A path in a configuration file, where `*` matches every member of an object or array.
 */
type JsonPathSegments = readonly string[];

export interface ILeanProjectConfigurationFileOptions {
  projectRelativeFilePath: string;
  jsonSchemaObject: object;
  propertyInheritanceDefaults: IPropertyInheritanceDefaults;
  /**
   * The inheritance types configured for top-level properties (`propertyInheritance`).
   */
  propertyInheritance?: ReadonlyMap<string, InheritanceType>;
  /**
   * The properties to resolve after loading, and the resolver to use for them (the equivalent of JSON path
   * metadata with a path resolution method).
   */
  customResolvers: ReadonlyArray<{
    path: JsonPathSegments;
    resolve: (propertyValue: string, configurationFilePath: string, projectFolderPath: string | undefined) => string;
  }>;
  packageJsonLookup: LeanPackageJsonLookup;
  /**
   * Returns the same value as `rigConfig.getResolvedProfileFolder()`, without side effects on `rigConfig`
   * (or bails).
   */
  getRigProfileFolder: (rigConfig: IRigConfig) => string;
}

export interface ILeanLoadResult<T> {
  /**
   * The loaded configuration, or `undefined` if the file does not exist (only when `allowMissing` is set).
   */
  configurationFile: T;
  /**
   * Debug messages that the original implementation would have written to the terminal.
   */
  debugMessages: string[];
  /**
   * All configuration files that were read.
   */
  configurationFilePaths: string[];
}

const CONFIGURATION_FILE_MERGE_BEHAVIOR_FIELD_REGEX: RegExp = /^\$([^\.]+)\.inheritanceType$/;

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function getAnnotation(obj: unknown): ILeanConfigurationFileFieldAnnotation | undefined {
  return (obj as IAnnotatedObject)[LEAN_CONFIGURATION_FILE_FIELD_ANNOTATION];
}

/**
 * Equivalent to `ConfigurationFileBase.getPropertyOriginalValue()`, for objects loaded by
 * {@link LeanProjectConfigurationFile}.
 */
export function getLeanPropertyOriginalValue<TValue>(
  parentObject: object,
  propertyName: string
): TValue | undefined {
  const annotation: ILeanConfigurationFileFieldAnnotation | undefined = getAnnotation(parentObject);
  if (annotation?.originalValues.hasOwnProperty(propertyName)) {
    return annotation.originalValues[propertyName] as TValue;
  }
}

/**
 * Equivalent to `ConfigurationFileBase.getObjectSourceFilePath()`, for objects loaded by
 * {@link LeanProjectConfigurationFile}.
 */
export function getLeanObjectSourceFilePath(obj: object): string | undefined {
  return getAnnotation(obj)?.configurationFilePath;
}

/**
 * A lean implementation of `ProjectConfigurationFile.loadConfigurationFileForProjectAsync()` from
 * `@rushstack/heft-config-file`, for the options used by Heft for `config/heft.json`. It avoids loading
 * heft-config-file, jsonpath-plus, ajv and node-core-library.
 *
 * `tryLoadConfigurationFileForProject()` returns `undefined` whenever the result might differ from the original
 * implementation, including for all error conditions; the caller must then use the original implementation.
 * The objects in a successful result are annotated exactly like the original (with a description-identical symbol).
 */
export class LeanProjectConfigurationFile<TConfigurationFile> {
  private readonly _options: ILeanProjectConfigurationFileOptions;
  private readonly _entryCache: Map<string, IConfigurationFileEntry> = new Map();

  public constructor(options: ILeanProjectConfigurationFileOptions) {
    this._options = options;
  }

  public tryLoadConfigurationFileForProject(
    projectPath: string,
    rigConfig: IRigConfig | undefined
  ): ILeanLoadResult<TConfigurationFile> | undefined {
    try {
      return this._loadConfigurationFileForProject(projectPath, rigConfig, false) as
        | ILeanLoadResult<TConfigurationFile>
        | undefined;
    } catch {
      // Fall back to the original implementation, which produces the canonical result or error
      return undefined;
    }
  }

  /**
   * The equivalent of `ProjectConfigurationFile.tryLoadConfigurationFileForProject()`: the result's
   * `configurationFile` is `undefined` if the file does not exist (in the project or in the rig).
   */
  public tryLoadConfigurationFileForProjectAllowMissing(
    projectPath: string,
    rigConfig: IRigConfig | undefined
  ): ILeanLoadResult<TConfigurationFile | undefined> | undefined {
    try {
      return this._loadConfigurationFileForProject(projectPath, rigConfig, true);
    } catch {
      return undefined;
    }
  }

  private _loadConfigurationFileForProject(
    projectPath: string,
    rigConfig: IRigConfig | undefined,
    allowMissing: boolean
  ): ILeanLoadResult<TConfigurationFile | undefined> {
    const { projectRelativeFilePath, packageJsonLookup } = this._options;
    const debugMessages: string[] = [];
    const configurationFilePaths: string[] = [];
    const projectConfigurationFilePath: string = path.resolve(projectPath, projectRelativeFilePath);
    // The original implementation looks this up eagerly (and fails if a package.json can't be read)
    const projectFolderPath: string | undefined = packageJsonLookup.tryGetPackageFolderFor(projectPath);
    const visitedConfigurationFilePaths: Set<string> = new Set();

    const onFileNotFound: () => string | undefined = () => {
      if (!rigConfig) {
        return undefined;
      }

      if (rigConfig.rigFound) {
        const rigProfileFolder: string = this._options.getRigProfileFolder(rigConfig);
        debugMessages.push(
          `Configuration file "${projectConfigurationFilePath}" does not exist. Attempting to load via rig ` +
            `("${rigProfileFolder}").`
        );
        return path.resolve(rigProfileFolder, projectRelativeFilePath);
      } else {
        debugMessages.push(`No rig found for "${rigConfig.projectFolderPath}"`);
        return undefined;
      }
    };

    const entry: IConfigurationFileEntry | undefined = this._loadEntryWithCache(
      projectConfigurationFilePath,
      visitedConfigurationFilePaths,
      configurationFilePaths,
      allowMissing ? debugMessages : undefined,
      onFileNotFound
    );

    if (!entry) {
      return { configurationFile: undefined, debugMessages, configurationFilePaths };
    }

    const result: JsonObject = this._contextualizeAndFlatten(entry, projectFolderPath);
    if (!tryValidateSchemaObject(this._options.jsonSchemaObject, result)) {
      // Let the original implementation report the schema error
      bail();
    }

    return {
      configurationFile: result as unknown as TConfigurationFile,
      debugMessages,
      configurationFilePaths
    };
  }

  /**
   * Returns `undefined` only if the file is missing and `notFoundMessages` is provided, in which case the debug
   * messages of the original implementation are appended to it. Otherwise, a missing file bails.
   */
  private _loadEntryWithCache(
    resolvedConfigurationFilePath: string,
    visitedConfigurationFilePaths: Set<string>,
    configurationFilePaths: string[],
    notFoundMessages?: string[],
    onFileNotFound?: () => string | undefined
  ): IConfigurationFileEntry | undefined {
    if (visitedConfigurationFilePaths.has(resolvedConfigurationFilePath)) {
      // A loop in the "extends" chain
      bail();
    }

    visitedConfigurationFilePaths.add(resolvedConfigurationFilePath);

    let entry: IConfigurationFileEntry | undefined = this._entryCache.get(resolvedConfigurationFilePath);
    if (!entry) {
      let fileText: string;
      try {
        fileText = fs.readFileSync(resolvedConfigurationFilePath, 'utf8');
      } catch (e) {
        if (!isNotExistError(e)) {
          bail();
        }

        const fallbackPath: string | undefined = onFileNotFound?.();
        if (fallbackPath) {
          const fallbackEntry: IConfigurationFileEntry | undefined = this._loadEntryWithCache(
            fallbackPath,
            visitedConfigurationFilePaths,
            configurationFilePaths,
            notFoundMessages
          );
          if (fallbackEntry) {
            return fallbackEntry;
          }
        }

        if (!notFoundMessages) {
          bail();
        }

        notFoundMessages.push(`Configuration file "${resolvedConfigurationFilePath}" not found.`);
        return undefined;
      }

      const jsonText: string | undefined = stripJsonCommentsAndTrailingCommas(fileText);
      if (jsonText === undefined) {
        bail();
      }

      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(jsonText);
      } catch {
        bail();
      }

      if (typeof parsedValue !== 'object' || parsedValue === null) {
        bail();
      }

      const configurationFile: JsonObject = parsedValue as JsonObject;
      configurationFilePaths.push(resolvedConfigurationFilePath);
      let parent: IConfigurationFileEntry | undefined;
      const extendsValue: unknown = configurationFile.extends;
      if (extendsValue) {
        if (typeof extendsValue !== 'string') {
          bail();
        }

        const resolvedParentConfigPath: string = this._options.packageJsonLookup.resolveModule(
          extendsValue,
          path.dirname(resolvedConfigurationFilePath)
        );
        // A missing parent is an error ("cannot be resolved"), so it bails
        parent = this._loadEntryWithCache(
          resolvedParentConfigPath,
          visitedConfigurationFilePaths,
          configurationFilePaths
        );
      }

      entry = {
        resolvedConfigurationFilePath,
        parent,
        configurationFile,
        jsonText
      };
      this._entryCache.set(resolvedConfigurationFilePath, entry);
    } else {
      // The original implementation returns cached entries without re-checking their parents
      for (let current: IConfigurationFileEntry | undefined = entry; current; current = current.parent) {
        configurationFilePaths.push(current.resolvedConfigurationFilePath);
      }
    }

    return entry;
  }

  private _contextualizeAndFlatten(
    entry: IConfigurationFileEntry,
    projectFolderPath: string | undefined
  ): JsonObject {
    const parentConfig: JsonObject = entry.parent
      ? this._contextualizeAndFlatten(entry.parent, projectFolderPath)
      : {};
    const currentConfig: JsonObject = this._contextualize(entry, projectFolderPath);
    return this._mergeConfigurationFiles(parentConfig, currentConfig, entry.resolvedConfigurationFilePath);
  }

  private _contextualize(entry: IConfigurationFileEntry, projectFolderPath: string | undefined): JsonObject {
    // Deep copy, like the original implementation (which uses structuredClone()), since the entry is cached.
    // Parsing the text again is faster than cloning in cold code, and the result is identical for JSON data.
    const result: JsonObject = JSON.parse(entry.jsonText);
    const { resolvedConfigurationFilePath } = entry;
    annotateProperties(resolvedConfigurationFilePath, result);

    for (const { path: jsonPath, resolve } of this._options.customResolvers) {
      forEachJsonPathMatch(result, jsonPath, 0, (parent: JsonObject, propertyName: string) => {
        const propertyValue: unknown = parent[propertyName];
        if (typeof propertyValue !== 'string') {
          bail();
        }

        parent[propertyName] = resolve(propertyValue, resolvedConfigurationFilePath, projectFolderPath);
      });
    }

    return result;
  }

  private _mergeConfigurationFiles(
    parentConfiguration: JsonObject,
    configurationJson: JsonObject,
    resolvedConfigurationFilePath: string
  ): JsonObject {
    const ignoreProperties: Set<string> = new Set(['extends', '$schema']);
    const result: JsonObject = mergeObjects(
      parentConfiguration,
      configurationJson,
      resolvedConfigurationFilePath,
      this._options.propertyInheritanceDefaults,
      this._options.propertyInheritance,
      ignoreProperties
    );
    getAnnotation(result)!.schemaPropertyOriginalValue = configurationJson.$schema as string | undefined;
    return result;
  }
}

/**
 * Invokes the callback for every property matched by the path, in the same order as jsonpath-plus.
 * Only own properties match, and `*` matches the members of objects and arrays.
 */
function forEachJsonPathMatch(
  value: unknown,
  jsonPath: JsonPathSegments,
  index: number,
  callback: (parent: JsonObject, propertyName: string) => void
): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  const segment: string = jsonPath[index];
  const isLast: boolean = index === jsonPath.length - 1;
  if (segment === '*') {
    const keys: string[] = Array.isArray(value) ? Array.from(value.keys(), String) : Object.keys(value);
    for (const key of keys) {
      if (isLast) {
        callback(value as JsonObject, key);
      } else {
        forEachJsonPathMatch((value as JsonObject)[key], jsonPath, index + 1, callback);
      }
    }
  } else if (hasOwn(value, segment)) {
    if (isLast) {
      callback(value as JsonObject, segment);
    } else {
      forEachJsonPathMatch((value as JsonObject)[segment], jsonPath, index + 1, callback);
    }
  }
}

function annotateProperties(resolvedConfigurationFilePath: string, root: unknown): void {
  if (!root) {
    return;
  }

  const queue: Set<unknown> = new Set([root]);
  for (const obj of queue) {
    if (obj && typeof obj === 'object') {
      (obj as IAnnotatedObject)[LEAN_CONFIGURATION_FILE_FIELD_ANNOTATION] = {
        configurationFilePath: resolvedConfigurationFilePath,
        originalValues: { ...obj }
      };

      for (const objValue of Object.values(obj)) {
        queue.add(objValue);
      }
    }
  }
}

function getPropertyOriginalValue(parentObject: object, propertyName: string): unknown {
  return getLeanPropertyOriginalValue(parentObject, propertyName);
}

/**
 * A port of `ConfigurationFileBase.#mergeObjects()` from `@rushstack/heft-config-file`, for configurations without
 * custom inheritance functions. Error conditions bail.
 */
function mergeObjects(
  parentObject: JsonObject,
  currentObject: JsonObject,
  resolvedConfigurationFilePath: string,
  defaultPropertyInheritance: IPropertyInheritanceDefaults,
  configuredPropertyInheritance?: ReadonlyMap<string, InheritanceType>,
  ignoreProperties?: Set<string>
): JsonObject {
  const resultAnnotation: ILeanConfigurationFileFieldAnnotation = {
    configurationFilePath: resolvedConfigurationFilePath,
    originalValues: {}
  };
  const result: JsonObject = {
    [LEAN_CONFIGURATION_FILE_FIELD_ANNOTATION]: resultAnnotation
  };

  const currentObjectPropertyNames: Set<string> = new Set(Object.keys(currentObject));
  const inheritanceTypeMap: Map<string, InheritanceType> = new Map();
  const mergedPropertyNames: Set<string> = new Set(Object.keys(parentObject));

  for (const propertyName of currentObjectPropertyNames) {
    if (ignoreProperties && ignoreProperties.has(propertyName)) {
      continue;
    }

    const inheritanceTypeMatches: RegExpMatchArray | null = propertyName.match(
      CONFIGURATION_FILE_MERGE_BEHAVIOR_FIELD_REGEX
    );
    if (inheritanceTypeMatches) {
      const mergeTargetPropertyName: string = inheritanceTypeMatches[1];
      const inheritanceTypeRaw: unknown = currentObject[propertyName];
      if (
        !currentObjectPropertyNames.has(mergeTargetPropertyName) ||
        typeof inheritanceTypeRaw !== 'string' ||
        typeof currentObject[mergeTargetPropertyName] !== 'object'
      ) {
        bail();
      }

      switch (inheritanceTypeRaw.toLowerCase()) {
        case 'append':
          inheritanceTypeMap.set(mergeTargetPropertyName, 'append');
          break;
        case 'merge':
          inheritanceTypeMap.set(mergeTargetPropertyName, 'merge');
          break;
        case 'replace':
          inheritanceTypeMap.set(mergeTargetPropertyName, 'replace');
          break;
        default:
          bail();
      }
    } else {
      mergedPropertyNames.add(propertyName);
    }
  }

  for (const propertyName of mergedPropertyNames) {
    const propertyValue: unknown = currentObject[propertyName];
    const parentPropertyValue: unknown = parentObject[propertyName];

    let newValue: unknown;
    const usePropertyValue: () => void = () => {
      resultAnnotation.originalValues[propertyName] = getPropertyOriginalValue(currentObject, propertyName);
      newValue = propertyValue;
    };
    const useParentPropertyValue: () => void = () => {
      resultAnnotation.originalValues[propertyName] = getPropertyOriginalValue(parentObject, propertyName);
      newValue = parentPropertyValue;
    };

    if (propertyValue === null) {
      if (parentPropertyValue !== undefined) {
        resultAnnotation.originalValues[propertyName] = getPropertyOriginalValue(parentObject, propertyName);
      }

      newValue = undefined;
    } else if (propertyValue !== undefined && parentPropertyValue === undefined) {
      usePropertyValue();
    } else if (parentPropertyValue !== undefined && propertyValue === undefined) {
      useParentPropertyValue();
    } else if (propertyValue !== undefined && parentPropertyValue !== undefined) {
      if (ignoreProperties && propertyName in Object.prototype) {
        // At the top level, the original implementation looks up the property name in a plain object of
        // configured inheritance types, which finds members of Object.prototype
        bail();
      }

      let inheritanceType: InheritanceType | undefined =
        inheritanceTypeMap.get(propertyName) ?? configuredPropertyInheritance?.get(propertyName);
      if (!inheritanceType) {
        if (Array.isArray(propertyValue) && Array.isArray(parentPropertyValue)) {
          inheritanceType = defaultPropertyInheritance.array;
        } else if (
          propertyValue &&
          parentPropertyValue &&
          typeof propertyValue === 'object' &&
          typeof parentPropertyValue === 'object'
        ) {
          inheritanceType = defaultPropertyInheritance.object;
        } else {
          inheritanceType = 'replace';
        }
      }

      switch (inheritanceType) {
        case 'replace': {
          usePropertyValue();
          break;
        }

        case 'append': {
          if (!Array.isArray(propertyValue) || !Array.isArray(parentPropertyValue)) {
            bail();
          }

          const parentAnnotation: ILeanConfigurationFileFieldAnnotation | undefined =
            getAnnotation(parentPropertyValue);
          const currentAnnotation: ILeanConfigurationFileFieldAnnotation | undefined =
            getAnnotation(propertyValue);
          if (!parentAnnotation || !currentAnnotation) {
            // The original implementation would throw a TypeError
            bail();
          }

          const newArray: unknown[] & IAnnotatedObject = [...parentPropertyValue, ...propertyValue];
          newArray[LEAN_CONFIGURATION_FILE_FIELD_ANNOTATION] = {
            configurationFilePath: undefined,
            originalValues: {
              ...parentAnnotation.originalValues,
              ...currentAnnotation.originalValues
            }
          };
          newValue = newArray;
          break;
        }

        case 'merge': {
          if (
            parentPropertyValue === null ||
            propertyValue === null ||
            (propertyValue && typeof propertyValue !== 'object') ||
            (parentPropertyValue && typeof parentPropertyValue !== 'object') ||
            Array.isArray(propertyValue) ||
            Array.isArray(parentPropertyValue)
          ) {
            bail();
          }

          newValue = mergeObjects(
            parentPropertyValue as JsonObject,
            propertyValue as JsonObject,
            resolvedConfigurationFilePath,
            defaultPropertyInheritance
          );
          break;
        }

        default: {
          bail();
        }
      }
    }

    if (newValue !== undefined) {
      result[propertyName] = newValue;
    }
  }

  return result;
}
