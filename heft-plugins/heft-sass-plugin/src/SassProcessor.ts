// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { URL, pathToFileURL, fileURLToPath } from 'node:url';

import {
  type CompileResult,
  type Syntax,
  type Exception,
  type CanonicalizeContext,
  deprecations,
  type Deprecations,
  type DeprecationOrId,
  type ImporterResult,
  type AsyncCompiler,
  type Options,
  initAsyncCompiler
} from 'sass-embedded';
import * as postcss from 'postcss';
import cssModules from 'postcss-modules';

import type { IScopedLogger } from '@rushstack/heft';
import {
  Async,
  FileError,
  FileSystem,
  type IFileSystemWriteFileOptions,
  Import,
  type JsonObject,
  Path,
  RealNodeModulePathResolver,
  Sort
} from '@rushstack/node-core-library';

const SIMPLE_IDENTIFIER_REGEX: RegExp = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * @public
 */
export interface ICssOutputFolder {
  folder: string;
  shimModuleFormat: 'commonjs' | 'esnext' | undefined;
}

/**
 * @public
 */
export interface ISassProcessorOptions {
  /**
   * The logger for this processor.
   */
  logger: IScopedLogger;

  /**
   * The project root folder.
   */
  buildFolder: string;

  /**
   * How many SASS compiler processes to run in parallel.
   */
  concurrency: number;

  /**
   * Source code root directory.
   * Defaults to "src/".
   */
  srcFolder: string;

  /**
   * Output directory for generated Sass typings.
   * Defaults to "temp/sass-ts/".
   */
  dtsOutputFolders: string[];

  /**
   * Output kinds for generated JS stubs and CSS files.
   */
  cssOutputFolders?: ICssOutputFolder[];

  /**
   * Determines whether export values are wrapped in a default property, or not.
   */
  exportAsDefault: boolean;

  /**
   * Files with these extensions will pass through the Sass transpiler for typings generation.
   * They will be treated as SCSS modules.
   * Defaults to [".sass", ".scss", ".css"]
   */
  fileExtensions?: string[];

  /**
   * Files with these extensions will pass through the Sass transpiler for typings generation.
   * They will be treated as non-module SCSS.
   * Defaults to [".global.sass", ".global.scss", ".global.css"]
   */
  nonModuleFileExtensions?: string[];

  /**
   * A list of file paths relative to the "src" folder that should be excluded from typings generation.
   */
  excludeFiles?: string[];

  /**
   * If set, deprecation warnings from dependencies will be suppressed.
   */
  ignoreDeprecationsInDependencies?: boolean;

  /**
   * A list of deprecation codes to silence.  This is useful for suppressing warnings from deprecated Sass features that are used in the project and known not to be a problem.
   */
  silenceDeprecations?: readonly string[];

  /**
   * A callback to further modify the raw CSS text after it has been generated. Only relevant if emitting CSS files.
   */
  postProcessCssAsync?: (cssText: string) => Promise<string>;
}

/**
 * @public
 */
export interface ISassTypingsGeneratorOptions {
  buildFolder: string;
  sassConfiguration: ISassProcessorOptions;
}

interface IFileRecord {
  absolutePath: string;
  url: URL;
  index: number;
  isPartial: boolean;
  isModule: boolean;
  relativePath: string;
  version: string;
  content: string | undefined;
  cssVersion?: string;
  consumers: Set<IFileRecord>;
  dependencies: Set<IFileRecord>;
}

interface ISerializedFileRecord {
  relativePath: string;
  version: string;
  cssVersion?: string | undefined;
  dependencies: number[];
}

/**
 * Regexp to match legacy node_modules imports in SCSS files.
 * Old syntax that this is matching is expressions like `@import '~@fluentui/react/dist/sass/blah.scss';`
 * These should instead be written as `@import 'pkg:@fluentui/react/dist/sass/blah';` (note that `@import` is deprecated)
 * Newest should prefer `@use` or `@forward` statements since those are designed to work with scss in a module fashion.
 */
const importTildeRegex: RegExp = /^(\s*@(?:import|use|forward)\s*)('~(?:[^']+)'|"~(?:[^"]+)")/gm;

// eslint-disable-next-line @rushstack/no-new-null
type SyncResolution = URL | null;
type AsyncResolution = Promise<SyncResolution>;
type SyncOrAsyncResolution = SyncResolution | AsyncResolution;

interface IFileContentAndVersion {
  content: string;
  version: string;
}

/**
 * Generates type files (.d.ts) for Sass/SCSS/CSS files and optionally produces CSS files and .scss.js redirector files.
 *
 * @public
 */
export class SassProcessor {
  public readonly ignoredFileGlobs: string[] | undefined;
  public readonly inputFileGlob: string;
  public readonly sourceFolderPath: string;

  // Map of input file path -> record
  private readonly _fileInfo: Map<string, IFileRecord>;
  private readonly _resolutions: Map<string, SyncOrAsyncResolution>;

  private readonly _isFileModule: (filePath: string) => boolean;
  private readonly _options: ISassProcessorOptions;
  private readonly _realpathSync: (path: string) => string;
  private readonly _scssOptions: Options<'async'>;

  private _configFilePath: string | undefined;

  public constructor(options: ISassProcessorOptions) {
    const { silenceDeprecations, excludeFiles } = options;

    const { isFileModule, allFileExtensions } = buildExtensionClassifier(options);

    const deprecationsToSilence: DeprecationOrId[] | undefined = silenceDeprecations
      ? Array.from(silenceDeprecations, (deprecation) => {
          if (!Object.prototype.hasOwnProperty.call(deprecations, deprecation)) {
            throw new Error(`Unknown deprecation code: ${deprecation}`);
          }
          return deprecation as keyof Deprecations;
        })
      : undefined;

    const canonicalizeAsync: (url: string, context: CanonicalizeContext) => AsyncResolution = async (
      url,
      context
    ) => {
      return await this._canonicalizeAsync(url, context);
    };

    const loadAsync: (url: URL) => Promise<ImporterResult> = async (url) => {
      const absolutePath: string = heftUrlToPath(url.href);
      const record: IFileRecord = this._getOrCreateRecord(absolutePath);
      if (record.content === undefined) {
        const { content, version } = await this._readFileContentAsync(absolutePath);
        record.version = version;
        record.content = content;
      }

      return {
        contents: record.content,
        syntax: determineSyntaxFromFilePath(absolutePath)
      };
    };

    this.ignoredFileGlobs = excludeFiles?.map((excludedFile) =>
      excludedFile.startsWith('./') ? excludedFile.slice(2) : excludedFile
    );
    this.inputFileGlob = `**/*+(${allFileExtensions.join('|')})`;
    this.sourceFolderPath = options.srcFolder;

    this._configFilePath = undefined;
    this._fileInfo = new Map();
    this._isFileModule = isFileModule;
    this._resolutions = new Map();
    this._options = options;
    this._realpathSync = new RealNodeModulePathResolver().realNodeModulePath;
    this._scssOptions = {
      style: 'expanded', // leave minification to clean-css
      importers: [
        {
          nonCanonicalScheme: 'pkg',
          canonicalize: canonicalizeAsync,
          load: loadAsync
        }
      ],
      silenceDeprecations: deprecationsToSilence
    };
  }

  public async loadCacheAsync(tempFolderPath: string): Promise<void> {
    const configHash: string = getContentsHash('sass.json', JSON.stringify(this._options)).slice(0, 8);

    this._configFilePath = path.join(tempFolderPath, `sass_${configHash}.json`);

    try {
      const serializedConfig: string = await FileSystem.readFileAsync(this._configFilePath);
      this._cache = serializedConfig;
    } catch (err) {
      if (!FileSystem.isNotExistError(err)) {
        this._options.logger.terminal.writeVerboseLine(`Error reading cache file: ${err}`);
      }
    }
  }

  public async compileFilesAsync(filepaths: Set<string>): Promise<void> {
    // Incremental resolve is complicated, so just clear it for now
    this._resolutions.clear();

    // Expand affected files using dependency graph
    // If this is the initial compilation, the graph will be empty, so this will no-op'
    const affectedRecords: Set<IFileRecord> = new Set();

    for (const file of filepaths) {
      const record: IFileRecord = this._getOrCreateRecord(file);
      affectedRecords.add(record);
    }

    const {
      concurrency,
      logger: { terminal }
    } = this._options;

    terminal.writeVerboseLine(`Checking for changes to ${filepaths.size} files...`);
    for (const record of affectedRecords) {
      for (const dependency of record.dependencies) {
        affectedRecords.add(dependency);
      }
    }

    // Check the versions of all requested files and their dependencies
    await Async.forEachAsync(
      affectedRecords,
      async (record: IFileRecord) => {
        const contentAndVersion: IFileContentAndVersion = await this._readFileContentAsync(
          record.absolutePath
        );
        const { version } = contentAndVersion;
        if (version !== record.version) {
          record.content = contentAndVersion.content;
          record.version = version;
        } else {
          // If the record was just hydrated from disk, content won't be present
          record.content ??= contentAndVersion.content;
          affectedRecords.delete(record);
        }
      },
      {
        concurrency
      }
    );

    for (const record of affectedRecords) {
      const consumers: Set<IFileRecord> = record.consumers;
      for (const consumer of consumers) {
        // Adding to the set while we are iterating it acts as a deduped queue
        affectedRecords.add(consumer);
      }
    }

    for (const record of affectedRecords) {
      if (record.isPartial) {
        // Filter out partials before compilation so we don't pay async overhead when skipping them
        affectedRecords.delete(record);
      }
    }

    terminal.writeLine(`Compiling ${affectedRecords.size} files...`);

    // Compile the files. Allow parallelism
    if (affectedRecords.size) {
      // Using `>>2` instead of `/4` because it also ensures that the result is an integer
      const compilerCount: number = Math.min(affectedRecords.size >> 2, concurrency, 8) || 1;
      const compilers: AsyncCompiler[] = await Promise.all(
        Array.from({ length: compilerCount }, () => initAsyncCompiler())
      );

      try {
        await Async.forEachAsync(
          affectedRecords,
          async (record, i) => {
            try {
              await this._compileFileAsync(compilers[i % compilerCount], record, this._scssOptions);
            } catch (err) {
              this._options.logger.emitError(err);
            }
          },
          {
            concurrency: compilerCount * 4
          }
        );
      } finally {
        await Promise.all(compilers.map((compiler) => compiler.dispose()));
      }
    }

    // Find all newly-referenced files and update the incremental build state data.
    const newRecords: Set<IFileRecord> = new Set();
    for (const record of this._fileInfo.values()) {
      if (!record.version) {
        newRecords.add(record);
      }
    }

    await Async.forEachAsync(
      newRecords,
      async (record: IFileRecord) => {
        const { content, version } = await this._readFileContentAsync(record.absolutePath);
        // eslint-disable-next-line require-atomic-updates
        record.content = content;
        // eslint-disable-next-line require-atomic-updates
        record.version = version;
      },
      {
        concurrency
      }
    );

    if (this._configFilePath) {
      const serializedConfig: string = this._cache;
      try {
        await FileSystem.writeFileAsync(this._configFilePath, serializedConfig, {
          ensureFolderExists: true
        });
      } catch (err) {
        terminal.writeVerboseLine(`Error writing cache file: ${err}`);
      }
    }
  }

  /**
   * Resolves a `heft:` URL to a physical file path.
   * @param url - The URL to canonicalize. Will only do the exact URL or the corresponding partial.
   * @param context - The context in which the canonicalization is being performed
   * @returns The canonical URL of the target file, or null if it does not resolve
   */
  private async _canonicalizeFileAsync(url: string, context: CanonicalizeContext): AsyncResolution {
    // The logic between `this._resolutions.get()` and `this._resolutions.set()` must be 100% synchronous
    // Otherwise we could end up with multiple promises for the same URL
    let resolution: SyncOrAsyncResolution | undefined = this._resolutions.get(url);
    if (resolution === undefined) {
      resolution = this._canonicalizeFileInnerAsync(url, context);
      this._resolutions.set(url, resolution);
    }
    return await resolution;
  }

  private async _canonicalizeFileInnerAsync(url: string, context: CanonicalizeContext): AsyncResolution {
    const absolutePath: string = heftUrlToPath(url);
    const lastSlash: number = url.lastIndexOf('/');
    const basename: string = url.slice(lastSlash + 1);

    // Does this file exist?
    try {
      const contentAndVersion: IFileContentAndVersion = await this._readFileContentAsync(absolutePath);
      const record: IFileRecord = this._getOrCreateRecord(absolutePath);
      const { version } = contentAndVersion;
      if (version !== record.version) {
        record.content = contentAndVersion.content;
        record.version = version;
      } else {
        record.content ??= contentAndVersion.content;
      }
      return record.url;
    } catch (err) {
      if (!FileSystem.isNotExistError(err)) {
        throw err;
      }
    }

    // Exact file didn't exist, was this a partial?
    if (basename.startsWith('_')) {
      // Was already a partial, so fail resolution.
      return null;
    }

    // Try again with the partial
    const dirname: string = url.slice(0, lastSlash);
    const partialUrl: string = `${dirname}/_${basename}`;
    const result: SyncResolution = await this._canonicalizeFileAsync(partialUrl, context);
    return result;
  }

  /**
   * Resolves a `pkg:` URL to a physical file path.
   * @param url - The URL to canonicalize. The URL must be a deep import to a SCSS file in a separate package.
   * @param context - The context in which the canonicalization is being performed
   * @returns The canonical URL of the target file, or null if it does not resolve
   */
  private async _canonicalizePackageAsync(url: string, context: CanonicalizeContext): AsyncResolution {
    // We rewrite any of the old form `~<package>` imports to `pkg:<package>`
    const { containingUrl } = context;
    if (!containingUrl) {
      throw new Error(`Cannot resolve ${url} without a containing URL`);
    }

    const cacheKey: string = `${containingUrl.href}\0${url}`;
    // The logic between `this._resolutions.get()` and `this._resolutions.set()` must be 100% synchronous
    // Otherwise we could end up with multiple promises for the same URL
    let resolution: SyncOrAsyncResolution | undefined = this._resolutions.get(cacheKey);
    if (resolution === undefined) {
      // Since the cache doesn't have an entry, get the promise for the resolution
      // and inject it into the cache before other callers have a chance to try
      resolution = this._canonicalizePackageInnerAsync(url, context);
      this._resolutions.set(cacheKey, resolution);
    }
    return await resolution;
  }

  /**
   * Resolves a `pkg:` URL to a physical file path, without caching.
   * @param url - The URL to canonicalize. The URL must be a deep import to a SCSS file in a separate package.
   * @param context - The context in which the canonicalization is being performed
   * @returns The canonical URL of the target file, or null if it does not resolve
   */
  private async _canonicalizePackageInnerAsync(url: string, context: CanonicalizeContext): AsyncResolution {
    const containingUrl: string | undefined = context.containingUrl?.href;
    if (containingUrl === undefined) {
      throw new Error(`Cannot resolve ${url} without a containing URL`);
    }

    const nodeModulesQuery: string = url.slice(4);
    const isScoped: boolean = nodeModulesQuery.startsWith('@');
    let linkEnd: number = nodeModulesQuery.indexOf('/');
    if (isScoped) {
      linkEnd = nodeModulesQuery.indexOf('/', linkEnd + 1);
    }
    if (linkEnd < 0) {
      linkEnd = nodeModulesQuery.length;
    }

    const packageName: string = nodeModulesQuery.slice(0, linkEnd);
    const baseFolderPath: string = heftUrlToPath(containingUrl);

    const resolvedPackagePath: string = await Import.resolvePackageAsync({
      packageName,
      baseFolderPath,
      getRealPath: this._realpathSync
    });
    const modulePath: string = nodeModulesQuery.slice(linkEnd);
    const resolvedPath: string = `${resolvedPackagePath}${modulePath}`;
    const heftUrl: string = pathToHeftUrl(resolvedPath).href;
    return await this._canonicalizeHeftUrlAsync(heftUrl, context);
  }

  /**
   * Resolves a `heft:` URL to a physical file path.
   * @param url - The URL to canonicalize. The URL must be a deep import to a candidate SCSS file.
   * @param context - The context in which the canonicalization is being performed
   * @returns The canonical URL of the target file, or null if it does not resolve
   */
  private async _canonicalizeHeftUrlAsync(url: string, context: CanonicalizeContext): AsyncResolution {
    // The logic between `this._resolutions.get()` and `this._resolutions.set()` must be 100% synchronous
    let resolution: SyncOrAsyncResolution | undefined = this._resolutions.get(url);
    if (resolution === undefined) {
      // Since the cache doesn't have an entry, get the promise for the resolution
      // and inject it into the cache before other callers have a chance to try
      resolution = this._canonicalizeHeftInnerAsync(url, context);
      this._resolutions.set(url, resolution);
    }

    return await resolution;
  }

  /**
   * Resolves a sass request to a physical path
   * @param url - The URL to canonicalize. The URL may be relative or absolute.
   *  This API supports the `heft:` and `pkg:` protocols.
   * @param context - The context in which the canonicalization is being performed
   * @returns The canonical URL of the target file, or null if it does not resolve
   */
  private async _canonicalizeAsync(url: string, context: CanonicalizeContext): AsyncResolution {
    if (url.startsWith('~')) {
      throw new Error(`Unexpected tilde in URL: ${url} in context: ${context.containingUrl?.href}`);
    }

    if (url.startsWith('pkg:')) {
      return await this._canonicalizePackageAsync(url, context);
    }

    // Check the cache first, and exit early if previously resolved
    if (url.startsWith('heft:')) {
      return await this._canonicalizeHeftUrlAsync(url, context);
    }

    const { containingUrl } = context;
    if (!containingUrl) {
      throw new Error(`Cannot resolve ${url} without a containing URL`);
    }

    const resolvedUrl: string = new URL(url, containingUrl.toString()).toString();
    return await this._canonicalizeHeftUrlAsync(resolvedUrl, context);
  }

  /**
   * Resolves a `heft:` URL to a physical file path, without caching.
   * @param url - The URL to canonicalize. The URL must be a deep import to a candidate SCSS file.
   * @param context - The context in which the canonicalization is being performed
   * @returns The canonical URL of the target file, or null if it does not resolve
   */
  private async _canonicalizeHeftInnerAsync(url: string, context: CanonicalizeContext): AsyncResolution {
    if (url.endsWith('.sass') || url.endsWith('.scss')) {
      // Extension is already present, so only try the exact URL or the corresponding partial
      return await this._canonicalizeFileAsync(url, context);
    }

    // Spec says prefer .sass, but we don't use that extension
    for (const candidate of [`${url}.scss`, `${url}.sass`, `${url}/index.scss`, `${url}/index.sass`]) {
      const result: SyncResolution = await this._canonicalizeFileAsync(candidate, context);
      if (result) {
        return result;
      }
    }

    return null;
  }

  private get _cache(): string {
    const serializedRecords: ISerializedFileRecord[] = Array.from(this._fileInfo.values(), (record) => {
      return {
        relativePath: record.relativePath,
        version: record.version,
        cssVersion: record.cssVersion,
        dependencies: Array.from(record.dependencies, (dependency) => dependency.index)
      };
    });

    return JSON.stringify(serializedRecords);
  }

  /**
   * Configures the state of this processor using the specified cache file content.
   * @param cacheFileContent - The contents of the cache file
   */
  private set _cache(cacheFileContent: string) {
    this._fileInfo.clear();

    const serializedRecords: ISerializedFileRecord[] = JSON.parse(cacheFileContent);
    const records: IFileRecord[] = [];
    const buildFolder: string = this._options.buildFolder;
    for (const record of serializedRecords) {
      const { relativePath, version, cssVersion } = record;
      // relativePath may start with `../` or similar, so need to use a library join function.
      const absolutePath: string = path.resolve(buildFolder, relativePath);
      const url: URL = pathToHeftUrl(absolutePath);

      const isPartial: boolean = isSassPartial(absolutePath);
      // SCSS partials are not modules, insofar as they cannot be imported directly.
      const isModule: boolean = isPartial ? false : this._isFileModule(absolutePath);

      const fileRecord: IFileRecord = {
        absolutePath,
        url,
        isPartial,
        isModule,
        index: records.length,
        relativePath,
        version,
        content: undefined,
        cssVersion,
        consumers: new Set(),
        dependencies: new Set()
      };
      records.push(fileRecord);
      this._fileInfo.set(absolutePath, fileRecord);
      this._resolutions.set(absolutePath, url);
    }

    for (let i: number = 0, len: number = serializedRecords.length; i < len; i++) {
      const serializedRecord: ISerializedFileRecord = serializedRecords[i];
      const record: IFileRecord = records[i];

      for (const dependencyIndex of serializedRecord.dependencies) {
        const dependency: IFileRecord = records[dependencyIndex];
        record.dependencies.add(dependency);
        dependency.consumers.add(record);
      }
    }
  }

  /**
   * Reads the contents of a file and returns an object that can be used to access the text and hash of the file.
   * @param absolutePath - The absolute path to the file
   * @returns A promise for an object that can be used to access the text and hash of the file.
   */
  private async _readFileContentAsync(absolutePath: string): Promise<IFileContentAndVersion> {
    const content: Buffer = await FileSystem.readFileToBufferAsync(absolutePath);
    let version: string | undefined;
    let contentString: string | undefined;
    return {
      get version() {
        version ??= crypto.createHash('sha1').update(content).digest('base64');
        return version;
      },
      get content() {
        contentString ??= preprocessScss(content);
        return contentString;
      }
    };
  }

  /**
   * Gets a record for a SCSS file, creating it if necessary.
   * @param filePath - The file path to get or create a record for
   * @returns The tracking record for the specified file
   */
  private _getOrCreateRecord(filePath: string): IFileRecord {
    filePath = path.resolve(filePath);
    let record: IFileRecord | undefined = this._fileInfo.get(filePath);
    if (!record) {
      const isPartial: boolean = isSassPartial(filePath);
      const isModule: boolean = isPartial ? false : this._isFileModule(filePath);
      const url: URL = pathToHeftUrl(filePath);
      record = {
        absolutePath: filePath,
        url,
        isPartial,
        isModule,
        index: this._fileInfo.size,
        relativePath: Path.convertToSlashes(path.relative(this._options.buildFolder, filePath)),
        version: '',
        content: undefined,
        cssVersion: undefined,
        consumers: new Set(),
        dependencies: new Set()
      };
      this._resolutions.set(filePath, record.url);
      this._fileInfo.set(filePath, record);
    }
    return record;
  }

  private async _compileFileAsync(
    compiler: Pick<AsyncCompiler, 'compileStringAsync'>,
    record: IFileRecord,
    scssOptions: Options<'async'>
  ): Promise<void> {
    const sourceFilePath: string = record.absolutePath;
    const content: string | undefined = record.content;
    if (content === undefined) {
      throw new Error(`Content not loaded for ${sourceFilePath}`);
    }

    let result: CompileResult;
    try {
      result = await compiler.compileStringAsync(content, {
        ...scssOptions,
        url: record.url,
        syntax: determineSyntaxFromFilePath(sourceFilePath)
      });
    } catch (err) {
      const typedError: Exception = err;
      const { span } = typedError;

      throw new FileError(`${typedError.sassMessage}\n${span.context ?? span.text}${typedError.sassStack}`, {
        absolutePath: span.url ? heftUrlToPath(span.url.href ?? span.url) : 'unknown', // This property should always be present
        line: span.start.line,
        column: span.start.column,
        projectFolder: this._options.buildFolder
      });
    }

    // Register any @import files as dependencies.
    record.dependencies.clear();
    for (const dependency of result.loadedUrls) {
      const dependencyPath: string = heftUrlToPath(dependency.href);
      const dependencyRecord: IFileRecord = this._getOrCreateRecord(dependencyPath);
      record.dependencies.add(dependencyRecord);
      dependencyRecord.consumers.add(record);
    }

    let css: string = result.css.toString();
    const contentHash: string = getContentsHash(sourceFilePath, css);
    if (record.cssVersion === contentHash) {
      // The CSS has not changed, so don't reprocess this and downstream files.
      return;
    }

    record.cssVersion = contentHash;
    const { cssOutputFolders, dtsOutputFolders, srcFolder, exportAsDefault, postProcessCssAsync } =
      this._options;

    // Handle CSS modules
    let moduleMap: JsonObject | undefined;
    if (record.isModule) {
      const postCssModules: postcss.Plugin = cssModules({
        getJSON: (cssFileName: string, json: JsonObject) => {
          // This callback will be invoked during the promise evaluation of the postcss process() function.
          moduleMap = json;
        },
        // Avoid unnecessary name hashing.
        generateScopedName: (name: string) => name
      });

      const postCssResult: postcss.Result = await postcss
        .default([postCssModules])
        .process(css, { from: sourceFilePath });
      css = postCssResult.css;
    }

    if (postProcessCssAsync) {
      css = await postProcessCssAsync(css);
    }

    const relativeFilePath: string = path.relative(srcFolder, sourceFilePath);

    const dtsContent: string = this._createDTS(moduleMap);

    const writeFileOptions: IFileSystemWriteFileOptions = {
      ensureFolderExists: true
    };

    for (const dtsOutputFolder of dtsOutputFolders) {
      await FileSystem.writeFileAsync(
        path.resolve(dtsOutputFolder, `${relativeFilePath}.d.ts`),
        dtsContent,
        writeFileOptions
      );
    }

    const filename: string = path.basename(relativeFilePath);
    const extensionStart: number = filename.lastIndexOf('.');
    const cssPathFromJs: string = `./${filename.slice(0, extensionStart)}.css`;
    const relativeCssPath: string = `${relativeFilePath.slice(0, relativeFilePath.lastIndexOf('.'))}.css`;

    if (cssOutputFolders && cssOutputFolders.length > 0) {
      if (!exportAsDefault) {
        throw new Error(`The "cssOutputFolders" option is not supported when "exportAsDefault" is false.`);
      }

      for (const cssOutputFolder of cssOutputFolders) {
        const { folder, shimModuleFormat } = cssOutputFolder;

        const cssFilePath: string = path.resolve(folder, relativeCssPath);
        await FileSystem.writeFileAsync(cssFilePath, css, writeFileOptions);

        if (shimModuleFormat && !filename.endsWith('.css')) {
          const jsFilePath: string = path.resolve(folder, `${relativeFilePath}.js`);
          const jsShimContent: string = generateJsShimContent(
            shimModuleFormat,
            cssPathFromJs,
            record.isModule
          );
          await FileSystem.writeFileAsync(jsFilePath, jsShimContent, writeFileOptions);
        }
      }
    }
  }

  private _createDTS(moduleMap: JsonObject | undefined): string {
    // Create a source file.
    const source: string[] = [];

    if (moduleMap) {
      if (this._options.exportAsDefault) {
        source.push(`declare interface IStyles {`);
        for (const className of Object.keys(moduleMap)) {
          const safeClassName: string = SIMPLE_IDENTIFIER_REGEX.test(className)
            ? className
            : JSON.stringify(className);
          // Quote and escape class names as needed.
          source.push(`  ${safeClassName}: string;`);
        }
        source.push(`}`);
        source.push(`declare const styles: IStyles;`);
        source.push(`export default styles;`);
      } else {
        for (const className of Object.keys(moduleMap)) {
          if (!SIMPLE_IDENTIFIER_REGEX.test(className)) {
            throw new Error(
              `Class name "${className}" is not a valid identifier and may only be exported using "exportAsDefault: true"`
            );
          }
          source.push(`export const ${className}: string;`);
        }
      }
    }

    if (source.length === 0 || !moduleMap) {
      return `export {};`;
    }

    return source.join('\n');
  }
}

interface IExtensionClassifier {
  allFileExtensions: string[];
  isFileModule: (relativePath: string) => boolean;
}

function buildExtensionClassifier(sassConfiguration: ISassProcessorOptions): IExtensionClassifier {
  const {
    fileExtensions: moduleFileExtensions = ['.sass', '.scss', '.css'],
    nonModuleFileExtensions = ['.global.sass', '.global.scss', '.global.css']
  } = sassConfiguration;

  const hasModules: boolean = moduleFileExtensions.length > 0;
  const hasNonModules: boolean = nonModuleFileExtensions.length > 0;

  if (!hasModules) {
    return {
      allFileExtensions: nonModuleFileExtensions,
      isFileModule: (relativePath: string) => false
    };
  }

  if (!hasNonModules) {
    return {
      allFileExtensions: moduleFileExtensions,
      isFileModule: (relativePath: string) => true
    };
  }

  const extensionClassifier: Map<string, boolean> = new Map();
  for (const extension of moduleFileExtensions) {
    const normalizedExtension: string = extension.startsWith('.') ? extension : `.${extension}`;
    extensionClassifier.set(normalizedExtension, true);
  }

  for (const extension of nonModuleFileExtensions) {
    const normalizedExtension: string = extension.startsWith('.') ? extension : `.${extension}`;
    const existingClassification: boolean | undefined = extensionClassifier.get(normalizedExtension);
    if (existingClassification === true) {
      throw new Error(
        `File extension "${normalizedExtension}" is declared as both a SCSS module and not an SCSS module.`
      );
    }
    extensionClassifier.set(normalizedExtension, false);
  }

  Sort.sortMapKeys(extensionClassifier, (key1, key2) => {
    // Order by length, descending, so the longest gets tested first.
    return key2.length - key1.length;
  });

  const isFileModule: (relativePath: string) => boolean = (relativePath: string) => {
    // Naive comparison algorithm. O(E), where E is the number of extensions
    // If performance becomes an issue, switch to using LookupByPath with a reverse iteration order using `.` as the delimiter
    for (const [extension, isExtensionModule] of extensionClassifier) {
      if (relativePath.endsWith(extension)) {
        return isExtensionModule;
      }
    }
    throw new Error(`Could not classify ${relativePath} as a SCSS module / not an SCSS module`);
  };

  return {
    allFileExtensions: [...extensionClassifier.keys()],
    isFileModule
  };
}

/**
 * A replacer function for preprocessing SCSS files that might contain a legacy tilde import.
 * @param match - The matched `@import` or `@use` statement
 * @param pre - The whitespace and `@import` or `@use` keyword
 * @param specifier - The specifier containing the tilde
 * @returns A replacement string with the tilde replaced by `pkg:`
 */
function replaceTilde(match: string, pre: string, specifier: string): string {
  const quote: string = specifier[0];
  return `${pre}${quote}pkg:${specifier.slice(2, -1)}${quote}`;
}

/**
 * Preprocesses raw SCSS and replaces legacy `~@scope/pkg/...` imports with `pkg:@scope/pkg/...`.
 * @param buffer - The buffer containing the SCSS file contents
 * @returns The preprocessed SCSS file contents as a string
 */
function preprocessScss(buffer: Buffer): string {
  return buffer.toString('utf8').replace(importTildeRegex, replaceTilde);
}

/**
 * Converts a `heft:` URL to a physical file path (platform normalized).
 * The `heft:` protocol is used so that the SASS compiler will not try to load the resource itself.
 * @param url - The URL to convert to an absolute file path
 * @returns The platform-normalized absolute file path of the resource.
 */
function heftUrlToPath(url: string): string {
  return fileURLToPath(`file://${url.slice(5)}`);
}

/**
 * Converts a physical file path (platform normalized) to a URL with a `heft:` protocol.
 * The `heft:` protocol is used so that the SASS compiler will not try to load the resource itself.
 * @param filePath - The platform-normalized absolute file path of the resource.
 * @returns A URL with the `heft:` protocol representing the file path.
 */
function pathToHeftUrl(filePath: string): URL {
  const url: URL = pathToFileURL(filePath);
  const heftUrl: URL = new URL(`heft:${url.pathname}`);
  return heftUrl;
}

/**
 * Sass partial files are snippets of CSS meant to be included in other Sass files.
 * Partial filenames always begin with a leading underscore and do not produce a CSS output file.
 */
function isSassPartial(filePath: string): boolean {
  return path.basename(filePath)[0] === '_';
}

function getContentsHash(fileName: string, fileContents: string): string {
  return crypto.createHmac('sha1', fileName).update(fileContents).digest('base64');
}

function determineSyntaxFromFilePath(filePath: string): Syntax {
  switch (filePath.slice(filePath.lastIndexOf('.'))) {
    case '.sass':
      return 'indented';
    case '.scss':
      return 'scss';
    default:
      return 'css';
  }
}

function generateJsShimContent(
  format: 'commonjs' | 'esnext',
  relativePathToCss: string,
  isModule: boolean
): string {
  const pathString: string = JSON.stringify(relativePathToCss);
  switch (format) {
    case 'commonjs':
      return isModule
        ? `module.exports = require(${pathString});\nmodule.exports.default = module.exports;`
        : `require(${pathString});`;
    case 'esnext':
      return isModule ? `export { default } from ${pathString};` : `import ${pathString};export {};`;
  }
}
