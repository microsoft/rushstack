// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as resolve from 'resolve';
import lodash = require('lodash');

import {
  JsonFile,
  JsonSchema,
  FileSystem,
  PackageJsonLookup,
  INodePackageJson,
  PackageName,
  Text,
  InternalError
} from '@microsoft/node-core-library';
import {
  IExtractorConfig,
  IExtractorMessagesConfig
} from './IExtractorConfig';
import { PackageMetadataManager } from '../analyzer/PackageMetadataManager';

/**
 * Tokens used during variable expansion of path fields from api-extractor.json.
 * @public
 */
export interface IExtractorConfigTokens {
  /**
   * The `<unscopedPackageName>` token returns the project's NPM package name, without any NPM scope.
   * If there is no associated package.json file, then the value is `unknown-package`.
   *
   * Example: `my-project`
   */
  unscopedPackageName: string;

  /**
   * The `<packageName>` token returns the project's full NPM package name including any NPM scope.
   * If there is no associated package.json file, then the value is `unknown-package`.
   *
   * Example: `@scope/my-project`
   */
  packageName: string;
}

/**
 * Options for {@link ExtractorConfig.parseConfig}.
 *
 * @public
 */
export interface IExtractorConfigParseConfigOptions {
  mergedConfig: Partial<IExtractorConfig>;
  mergedConfigFullPath: string;
  packageJsonPath: string | undefined;
}

/**
 * The `ExtractorConfig` class loads, validates, interprets, and represents the api-extractor.json config file.
 * @public
 */
export class ExtractorConfig {
  /**
   * The JSON Schema for API Extractor config file (api-extractor.schema.json).
   */
  public static readonly jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '../schemas/api-extractor.schema.json'));

  /**
   * The config file name "api-extractor.json".
   */
  public static readonly FILENAME: string = 'api-extractor.json';

  private static readonly _defaultConfig: Partial<IExtractorConfig> = JsonFile.load(path.join(__dirname,
    '../schemas/api-extractor-defaults.json'));

  private static readonly _declarationFileExtensionRegExp: RegExp = /\.d\.ts$/i;

  /** {@inheritDoc IExtractorCompilerConfig.rootFolder} */
  public rootFolder: string = '';

  /**
   * Returns the folder for the package.json file of the working package.
   *
   * @remarks
   * If the entry point is `C:\Folder\project\src\index.ts` and the nearest package.json
   * is `C:\Folder\project\package.json`, then the packageFolder is `C:\Folder\project`
   */
  public packageFolder: string = '';

  /**
   * The parsed package.json file for the working package.
   */
  public packageJson: INodePackageJson;

  /** {@inheritDoc IExtractorConfigTokens} */
  public readonly tokens: IExtractorConfigTokens;

  /** {@inheritDoc IExtractorConfig.mainEntryPointFile} */
  public mainEntryPointFile: string = '';

  /** {@inheritDoc IExtractorCompilerConfig.overrideTsconfig} */
  public overrideTsconfig?: { } = undefined;

  /** {@inheritDoc IExtractorCompilerConfig.skipLibCheck} */
  public skipLibCheck: boolean = false;

  /** {@inheritDoc IExtractorApiReportConfig.enabled} */
  public apiReportEnabled: boolean = false;

  /** The `reportFolder` path combined with the `reportFileName`. */
  public reportFilePath: string = '';
  /** The `tempFolder` path combined with the `reportFileName`. */
  public tempReportFilePath: string = '';

  /** {@inheritDoc IExtractorDocModelConfig.enabled} */
  public docModelEnabled: boolean = false;
  /** {@inheritDoc IExtractorDocModelConfig.apiJsonFilePath} */
  public apiJsonFilePath: string = '';

  /** {@inheritDoc IExtractorDtsRollupConfig.enabled} */
  public rollupEnabled: boolean = false;
  /** {@inheritDoc IExtractorDtsRollupConfig.untrimmedFilePath} */
  public untrimmedFilePath: string = '';
  /** {@inheritDoc IExtractorDtsRollupConfig.betaTrimmedFilePath} */
  public betaTrimmedFilePath: string = '';
  /** {@inheritDoc IExtractorDtsRollupConfig.publicTrimmedFilePath} */
  public publicTrimmedFilePath: string = '';

  /** {@inheritDoc IExtractorTsdocMetadataConfig.enabled} */
  public tsdocMetadataEnabled: boolean = false;
  /** {@inheritDoc IExtractorTsdocMetadataConfig.tsdocMetadataFilePath} */
  public tsdocMetadataFilePath: string = '';

  /** {@inheritDoc IExtractorConfig.messages} */
  public messages: IExtractorMessagesConfig = { };

  /** {@inheritDoc IExtractorConfig.testMode} */
  public testMode: boolean = false;

  public constructor() {
    this.packageJson = { name: 'unknown-package' };
    this.tokens = {
      unscopedPackageName: 'unknown-package',
      packageName: 'unknown-package'
    };
  }

  /**
   * Returns a simplified file path for use in error messages.
   * @internal
   */
  public _getShortFilePath(absolutePath: string): string {
    if (!path.isAbsolute(absolutePath)) {
      throw new InternalError('Expected absolute path: ' + absolutePath);
    }
    return path.relative(this.rootFolder, absolutePath).replace(/\\/g, '/');
  }

  /**
   * Loads the api-extractor.json config file from the specified file path, and returns the parsed result.
   *
   * @remarks
   * Loads the api-extractor.json config file from the specified file path.
   * If the "extends" field is present, the referenced file(s) will be merged,
   * along with the API Extractor defaults.
   * The result is parsed and returned.
   */
  public static loadAndParseConfig(jsonFilePath: string): ExtractorConfig {
    const mergedConfig: Partial<IExtractorConfig> = ExtractorConfig.loadJsonFileWithInheritance(jsonFilePath);

    const extractorConfig: ExtractorConfig = ExtractorConfig.parseConfigObject({
      mergedConfig,
      mergedConfigFullPath: jsonFilePath,
      packageJsonPath: undefined
    });

    return extractorConfig;
  }

  /**
   * Performs only the first half of {@link ExtractorConfig.loadAndParseFile}, providing an opportunity to
   * modify the object before it is pssed to {@link ExtractorConfig.parseConfigObject}.
   *
   * @remarks
   *
   * Loads the api-extractor.json config file from the specified file path.
   * If the "extends" field is present, the referenced file(s) will be merged,
   * along with the API Extractor defaults.
   */
  public static loadJsonFileWithInheritance(jsonFilePath: string): Partial<IExtractorConfig> {
    // Set to keep track of config files which have been processed.
    const visitedPaths: Set<string> = new Set<string>();

    // Get absolute path of config file.
    let currentConfigFilePath: string = path.resolve(process.cwd(), jsonFilePath);

    let mergedConfig: Partial<IExtractorConfig> = JsonFile.load(currentConfigFilePath);

    try {
      while (mergedConfig.extends) {
        // Check if this file was already processed.
        if (visitedPaths.has(currentConfigFilePath)) {
          throw new Error(`The API Extractor config files contain a cycle. "${currentConfigFilePath}"`
            + ` is included twice.  Please check the "extends" values in config files.`);
        }
        visitedPaths.add(currentConfigFilePath);

        const currentConfigFolderPath: string = path.dirname(currentConfigFilePath);

        if (mergedConfig.extends.match(/^\.\.?[\\/]/)) {
          // EXAMPLE:  "./subfolder/api-extractor-base.json"
          currentConfigFilePath = path.resolve(currentConfigFolderPath, mergedConfig.extends);
        } else {
          // EXAMPLE:  "my-package/api-extractor-base.json"
          //
          // Resolve "my-package" from the perspective of the current folder.
          currentConfigFilePath = resolve.sync(
            mergedConfig.extends,
            {
              basedir: currentConfigFolderPath
            }
          );
        }

        // Load the extractor config defined in extends property.
        const baseConfig: IExtractorConfig = JsonFile.load(currentConfigFilePath);

        // Delete the "extends" field, since we've already expanded it
        delete mergedConfig.extends;

        // Merge extractorConfig into baseConfig, mutating baseConfig
        lodash.merge(baseConfig, mergedConfig);

        mergedConfig = baseConfig;
      }
    } catch (e) {
      throw new Error(`Error loading ${currentConfigFilePath}:\n` + e.message);
    }

    // Lastly, apply the defaults
    mergedConfig = lodash.merge(lodash.cloneDeep(ExtractorConfig._defaultConfig), mergedConfig);

    return mergedConfig;
  }

  /**
   * Parses the api-extractor.json configuration provided as a runtime object, rather than reading it from disk.
   * This allows configurations to be customized or constructed programmatically.
   */
  public static parseConfigObject(options: IExtractorConfigParseConfigOptions): ExtractorConfig {
    const mergedConfigFullPath: string = options.mergedConfigFullPath;
    const mergedConfig: Partial<IExtractorConfig> = options.mergedConfig;

    if (!path.isAbsolute(mergedConfigFullPath)) {
      throw new Error('filenameForErrors must be an absolute path');
    }

    ExtractorConfig.jsonSchema.validateObject(mergedConfig, mergedConfigFullPath);

    const result: ExtractorConfig = new ExtractorConfig();

    try {

      if (!mergedConfig.compiler) {
        // A merged configuration should have this
        throw new Error('The "compiler" section is missing');
      }

      if (mergedConfig.compiler.rootFolder.trim() === '<lookup>') {
        // "The default value for `rootFolder` is the token `<lookup>`, which means the folder is determined
        // by traversing parent folders, starting from the folder containing api-extractor.json, and stopping
        // at the first folder that contains a tsconfig.json file.  If a tsconfig.json file cannot be found in
        // this way, then an error will be reported."

        let currentFolder: string = path.dirname(mergedConfigFullPath);
        for (; ; ) {
          const tsconfigPath: string = path.join(currentFolder, 'tsconfig.json');
          if (FileSystem.exists(tsconfigPath)) {
            result.rootFolder = tsconfigPath;
            break;
          }
          const parentFolder: string = path.dirname(currentFolder);
          if (parentFolder === '' || parentFolder === currentFolder) {
            throw new Error('The rootFolder was set to "<lookup>", but a tsconfig.json file cannot be'
              + ' found in this folder or any parent folder.');
          }
          currentFolder = parentFolder;
        }
      } else {
        if (!mergedConfig.compiler.rootFolder) {
          throw new Error('The rootFolder must be specified');
        }

        ExtractorConfig._rejectAnyTokensInPath(mergedConfig.compiler.rootFolder, 'rootFolder');

        if (!FileSystem.exists(mergedConfig.compiler.rootFolder)) {
          throw new Error('The specified rootFolder does not exist: ' + mergedConfig.compiler.rootFolder);
        }

        result.rootFolder = mergedConfig.compiler.rootFolder;
      }

      if (options.packageJsonPath !== undefined) {
        result.packageFolder = path.dirname(options.packageJsonPath);
        const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
        result.packageJson = packageJsonLookup.loadNodePackageJson(options.packageJsonPath);
        result.tokens.packageName = result.packageJson.name;
        result.tokens.unscopedPackageName = PackageName.getUnscopedName(result.packageJson.name);
      } else {
        result.packageFolder = result.rootFolder;
      }

      if (!mergedConfig.mainEntryPointFile) {
        // A merged configuration should have this
        throw new Error('mainEntryPointFile is missing');
      }
      result.mainEntryPointFile = result._resolvePathWithTokens('mainEntryPointFile', mergedConfig.mainEntryPointFile);

      if (!ExtractorConfig.hasDtsFileExtension(result.mainEntryPointFile)) {
        throw new Error('The mainEntryPointFile is not a declaration file: ' + result.mainEntryPointFile);
      }

      if (!FileSystem.exists(result.mainEntryPointFile)) {
        throw new Error('The mainEntryPointFile does not exist: ' + result.mainEntryPointFile);
      }

      result.overrideTsconfig = mergedConfig.compiler.overrideTsconfig;
      result.skipLibCheck = !!mergedConfig.compiler.skipLibCheck;

      if (mergedConfig.apiReport) {
        result.apiReportEnabled = !!mergedConfig.apiReport.enabled;

        const reportFilename: string = mergedConfig.apiReport.reportFileName || '';
        if (!reportFilename) {
          // A merged configuration should have this
          throw new Error('reportFilename is missing');
        }
        if (reportFilename.indexOf('/') >= 0 || reportFilename.indexOf('\\') >= 0) {
          // A merged configuration should have this
          throw new Error(`The reportFilename contains invalid characters: "${reportFilename}"`);
        }

        const reportFolder: string = result._resolvePathWithTokens('reportFolder',
          mergedConfig.apiReport.reportFolder);
        const tempFolder: string = result._resolvePathWithTokens('tempFolder',
          mergedConfig.apiReport.tempFolder);

        result.reportFilePath = path.join(reportFolder, reportFilename);
        result.tempReportFilePath = path.join(tempFolder, reportFilename);
      }

      if (mergedConfig.docModel) {
        result.apiReportEnabled = !!mergedConfig.docModel.enabled;
        result.apiJsonFilePath = result._resolvePathWithTokens('apiJsonFilePath',
          mergedConfig.docModel.apiJsonFilePath);
      }

      if (mergedConfig.tsdocMetadata) {
        result.tsdocMetadataEnabled = !!mergedConfig.tsdocMetadata.enabled;

        if (mergedConfig.compiler.rootFolder.trim() === '<lookup>') {
          result.tsdocMetadataFilePath = PackageMetadataManager.resolveTsdocMetadataPath(
            result.packageFolder,
            result.packageJson,
            result.tsdocMetadataFilePath
          );
        } else {
          result.tsdocMetadataFilePath = result._resolvePathWithTokens('tsdocMetadataFilePath',
          mergedConfig.tsdocMetadata.tsdocMetadataFilePath);
        }
      }

      if (mergedConfig.messages) {
        result.messages = mergedConfig.messages;
      }

      result.testMode = !!mergedConfig.testMode;
    } catch (e) {
      throw new Error(`Error parsing ${mergedConfigFullPath}:\n` + e.message);
    }
    return result;
  }

  /**
   * Returns true if the specified file path has the ".d.ts" file extension.
   */
  public static hasDtsFileExtension(filePath: string): boolean {
    return ExtractorConfig._declarationFileExtensionRegExp.test(filePath);
  }

  private _resolvePathWithTokens(fieldName: string, value: string | undefined): string {
    value = value ? value.trim() : '';
    if (value !== '') {
      value = Text.replaceAll(value, '<unscopedPackageName>', this.tokens.unscopedPackageName);
      value = Text.replaceAll(value, '<packageName>', this.tokens.packageName);
      if (value.indexOf('<lookup>') >= 0) {
        throw new Error(`The ${fieldName} value incorrectly uses the "<lookup>" token`);
      }
      ExtractorConfig._rejectAnyTokensInPath(value, fieldName);
      value = path.resolve(this.rootFolder, value);
    }
    return value;
  }

  /**
   * Given a path string that may have originally contained expandable tokens such as `<rootFolder>"`
   * this reports an error if any token-looking substrings remain after expansion (e.g. `c:\blah\<invalid>\blah`).
   */
  private static _rejectAnyTokensInPath(value: string, fieldName: string): void {
    if (value.indexOf('<') < 0 && value.indexOf('>') < 0) {
      return;
    }

    // Can we determine the name of a token?
    const tokenRegExp: RegExp = /(\<[^<]*?\>)/;
    const match: RegExpExecArray | null = tokenRegExp.exec(value);
    if (match) {
      throw new Error(`The ${fieldName} value contains an unrecognized token "${match[1]}"`);
    }
    throw new Error(`The ${fieldName} value contains extra token characters ("<" or ">"): ${value}`);
  }
}
