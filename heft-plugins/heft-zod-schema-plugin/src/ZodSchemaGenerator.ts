// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, NewlineKind, Path } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import {
  _getSchemaMeta,
  _validateTsDocReleaseTag,
  X_TSDOC_RELEASE_TAG_KEY,
  type ISchemaMeta
} from './SchemaMetaHelpers';

/**
 * Options for {@link ZodSchemaGenerator}.
 *
 * @internal
 */
export interface IZodSchemaGeneratorOptions {
  /**
   * The project root folder. Relative `inputGlobs` and `outputFolder` paths are resolved
   * relative to this folder; absolute paths are accepted as-is.
   */
  buildFolderPath: string;

  /**
   * Globs identifying the compiled JavaScript modules that export zod schemas.
   * May be relative to `buildFolderPath` or absolute.
   */
  inputGlobs: string[];

  /**
   * Folder where the generated `*.schema.json` files will be written. May be
   * relative to `buildFolderPath` or absolute.
   */
  outputFolder: string;

  /**
   * The name of the export to read from each module. Use `"default"` for the default
   * export, or `"*"` to emit one schema file per named `ZodType` export.
   */
  exportName: string;

  /**
   * Number of spaces to indent the generated JSON.
   */
  indent: number;

  /**
   * Optional terminal to write progress messages to.
   */
  terminal?: ITerminal;
}

const SCHEMA_FILE_EXTENSION: '.schema.json' = '.schema.json';
const ZOD_FILE_SUFFIX: '.zod.js' = '.zod.js';

/**
 * Result of generating one schema file.
 *
 * @internal
 */
export interface IGeneratedSchema {
  /** Absolute path of the source module. */
  sourceModulePath: string;
  /** Absolute path of the emitted `*.schema.json` file. */
  outputFilePath: string;
  /** The pretty-printed JSON contents that were written. */
  contents: string;
  /** `true` if the file was actually rewritten (false if contents were unchanged). */
  wasWritten: boolean;
}

/**
 * Loads compiled JavaScript modules that export zod schemas, converts each schema
 * to a JSON Schema document via zod's built-in `z.toJSONSchema()`, and writes the
 * results to `<outputFolder>/<basename>.schema.json` (or, for named exports,
 * `<basename>.<exportName>.schema.json`).
 *
 * @internal
 */
export class ZodSchemaGenerator {
  private readonly _options: IZodSchemaGeneratorOptions;

  public constructor(options: IZodSchemaGeneratorOptions) {
    this._options = options;
  }

  /**
   * Find all source modules matching `inputGlobs`, generate their schemas, and
   * write them to disk.
   *
   * @returns the list of generated schema results
   */
  public async generateAsync(): Promise<IGeneratedSchema[]> {
    const sourceModules: string[] = await this._findSourceModulesAsync();
    const results: IGeneratedSchema[] = [];
    for (const sourceModulePath of sourceModules) {
      const moduleResults: IGeneratedSchema[] = await this._processModuleAsync(sourceModulePath);
      results.push(...moduleResults);
    }
    return results;
  }

  private async _findSourceModulesAsync(): Promise<string[]> {
    // Defer requiring fast-glob until use to keep startup cheap when the plugin
    // is loaded but no work is needed.
    const glob: typeof import('fast-glob') = require('fast-glob');
    // fast-glob requires forward-slash patterns; convert any platform-specific
    // separators (Windows backslashes from `__dirname`-rooted patterns, etc.).
    const normalizedGlobs: string[] = this._options.inputGlobs.map((pattern) =>
      Path.convertToSlashes(pattern)
    );
    const matches: string[] = await glob(normalizedGlobs, {
      cwd: this._options.buildFolderPath,
      absolute: true,
      onlyFiles: true
    });
    matches.sort();
    return matches;
  }

  private async _processModuleAsync(sourceModulePath: string): Promise<IGeneratedSchema[]> {
    // Force a fresh load so that incremental builds always see the latest compiled
    // output.
    delete require.cache[require.resolve(sourceModulePath)];
    let loadedModule: Record<string, unknown>;
    try {
      loadedModule = require(sourceModulePath) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `Failed to load zod schema module "${sourceModulePath}": ${(error as Error).message}`
      );
    }

    const exportsToProcess: { exportName: string; schema: object }[] = [];
    if (this._options.exportName === '*') {
      for (const [name, value] of Object.entries(loadedModule)) {
        if (name === 'default' || !_isZodSchema(value)) {
          continue;
        }
        exportsToProcess.push({ exportName: name, schema: value });
      }
      // Always include default export when present
      const defaultExport: unknown = loadedModule.default;
      if (_isZodSchema(defaultExport)) {
        exportsToProcess.push({ exportName: 'default', schema: defaultExport });
      }
    } else {
      const exportValue: unknown = loadedModule[this._options.exportName];
      if (!_isZodSchema(exportValue)) {
        throw new Error(
          `Module "${sourceModulePath}" does not export a zod schema as ` +
            `"${this._options.exportName}". ` +
            'Expected a value with a "_def" property and a "parse" method.'
        );
      }
      exportsToProcess.push({ exportName: this._options.exportName, schema: exportValue });
    }

    if (exportsToProcess.length === 0) {
      throw new Error(
        `Module "${sourceModulePath}" did not export any zod schemas matching ` +
          `exportName "${this._options.exportName}".`
      );
    }

    const baseName: string = _getBaseName(sourceModulePath);

    const results: IGeneratedSchema[] = [];
    for (const { exportName, schema } of exportsToProcess) {
      const outputFileName: string =
        exportName === 'default'
          ? `${baseName}${SCHEMA_FILE_EXTENSION}`
          : `${baseName}.${exportName}${SCHEMA_FILE_EXTENSION}`;
      const outputFilePath: string = path.resolve(
        this._options.buildFolderPath,
        this._options.outputFolder,
        outputFileName
      );

      const contents: string = this._convertSchemaToJson(schema, sourceModulePath);
      const wasWritten: boolean = await _writeIfChangedAsync(outputFilePath, contents);
      results.push({ sourceModulePath, outputFilePath, contents, wasWritten });
    }

    return results;
  }

  private _convertSchemaToJson(schema: object, sourceModulePath: string): string {
    // Locate `z.toJSONSchema` from zod 4+ on the schema's own prototype chain when
    // possible to avoid loading multiple zod copies. Fall back to require('zod').
    const zod: { toJSONSchema: (schema: object) => Record<string, unknown> } = require('zod');
    if (typeof zod.toJSONSchema !== 'function') {
      throw new Error(
        'The installed version of "zod" does not provide z.toJSONSchema(). ' +
          'heft-zod-schema-plugin requires zod 4.0.0 or later.'
      );
    }

    const jsonSchema: Record<string, unknown> = zod.toJSONSchema(schema);

    // Apply user-supplied metadata (withSchemaMeta) to the top of the document.
    const meta: ISchemaMeta | undefined = _getSchemaMeta(schema);
    if (meta) {
      if (meta.releaseTag !== undefined) {
        _validateTsDocReleaseTag(meta.releaseTag, sourceModulePath);
      }
      _applyMetaToTopLevel(jsonSchema, meta);
    }

    return JSON.stringify(jsonSchema, undefined, this._options.indent) + '\n';
  }
}

/**
 * Duck-types a value as a zod schema instance. We deliberately avoid an
 * `instanceof` check because the plugin and its consumer might end up with
 * different copies of zod resolved at runtime.
 */
function _isZodSchema(value: unknown): value is object {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate: { _def?: unknown; parse?: unknown } = value as {
    _def?: unknown;
    parse?: unknown;
  };
  return candidate._def !== undefined && typeof candidate.parse === 'function';
}

/**
 * Derives the base name for a generated schema from a source module path,
 * stripping the `.zod.js` suffix if present, otherwise just the extension.
 */
function _getBaseName(sourceModulePath: string): string {
  const fileName: string = path.basename(sourceModulePath);
  if (fileName.endsWith(ZOD_FILE_SUFFIX)) {
    return fileName.slice(0, -ZOD_FILE_SUFFIX.length);
  }
  const ext: string = path.extname(fileName);
  return ext ? fileName.slice(0, -ext.length) : fileName;
}

/**
 * Inserts `$schema`, `$id`, `title`, `description`, and `x-tsdoc-release-tag`
 * properties at the top of the JSON Schema document, preserving deterministic
 * ordering: `$schema`, then `$id`, then `title`, then `description`, then the
 * extension key, then any other keys produced by `z.toJSONSchema`.
 */
function _applyMetaToTopLevel(jsonSchema: Record<string, unknown>, meta: ISchemaMeta): void {
  const ordered: Record<string, unknown> = {};
  if (meta.$schema !== undefined) {
    ordered.$schema = meta.$schema;
  } else if (jsonSchema.$schema !== undefined) {
    ordered.$schema = jsonSchema.$schema;
  }
  if (meta.$id !== undefined) {
    ordered.$id = meta.$id;
  } else if (jsonSchema.$id !== undefined) {
    ordered.$id = jsonSchema.$id;
  }
  if (meta.title !== undefined) {
    ordered.title = meta.title;
  } else if (jsonSchema.title !== undefined) {
    ordered.title = jsonSchema.title;
  }
  if (meta.description !== undefined) {
    ordered.description = meta.description;
  } else if (jsonSchema.description !== undefined) {
    ordered.description = jsonSchema.description;
  }
  if (meta.releaseTag !== undefined) {
    ordered[X_TSDOC_RELEASE_TAG_KEY] = meta.releaseTag;
  }

  // Copy remaining keys from the original document, skipping ones we've already
  // placed at the front.
  for (const [key, value] of Object.entries(jsonSchema)) {
    if (key in ordered) {
      continue;
    }
    ordered[key] = value;
  }

  // Mutate jsonSchema in place to reflect the new ordering by deleting and
  // reinserting each key.
  for (const key of Object.keys(jsonSchema)) {
    delete jsonSchema[key];
  }
  for (const [key, value] of Object.entries(ordered)) {
    jsonSchema[key] = value;
  }
}

/**
 * Writes the file only if its current contents differ from `contents`. Returns
 * `true` if the file was rewritten.
 */
async function _writeIfChangedAsync(outputFilePath: string, contents: string): Promise<boolean> {
  let existing: string | undefined;
  try {
    existing = await FileSystem.readFileAsync(outputFilePath);
  } catch (error) {
    if (!FileSystem.isNotExistError(error)) {
      throw error;
    }
  }
  if (existing === contents) {
    return false;
  }
  await FileSystem.writeFileAsync(outputFilePath, contents, {
    ensureFolderExists: true,
    convertLineEndings: NewlineKind.Lf
  });
  return true;
}
