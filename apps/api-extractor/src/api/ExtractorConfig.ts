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
 * Options for {@link ExtractorConfig.parseConfigObject}.
 *
 * @public
 */
export interface IExtractorConfigParseConfigObjectOptions {
  /**
   * An already prepared configuration object as returned by {@link ExtractorConfig.loadJsonFileWithInheritance}.
   */
  configObject: Partial<IExtractorConfig>;

  /**
   * The absolute path of the file that the `configObject` object was loaded from.  This is used for error messages
   * and when probing for `tsconfig.json`.
   *
   * @remarks
   *
   * If this is omitted, then the `rootFolder` must not be specified using the `<lookup>` token.
   */
  configObjectFullPath: string | undefined;

  /**
   * The parsed package.json file for the working package, or undefined if API Extractor was invoked without
   * a package.json file.
   *
   * @remarks
   *
   * If omitted, then the `<unscopedPackageName>` and `<packageName>` tokens will have default values.
   */
  packageJson?: INodePackageJson | undefined;

  /**
   * The absolute path of the file that the `packageJson` object was loaded from, or undefined if API Extractor
   * was invoked without a package.json file.
   *
   * @remarks
   *
   * This is used for error messages and when resolving paths found in package.json.
   *
   * If `packageJsonFullPath` is specified but `packageJson` is omitted, the file will be loaded automatically.
   */
  packageJsonFullPath: string | undefined;
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
   * The parsed package.json file for the working package, or undefined if API Extractor was invoked without
   * a package.json file.
   */
  public packageJson: INodePackageJson | undefined = undefined;

  /**
   * The absolute path of the file that package.json was loaded from, or undefined if API Extractor was invoked without
   * a package.json file.
   */
  public packageJsonFullPath: string | undefined = undefined;

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
  public static loadAndParseConfig(configJsonFilePath: string): ExtractorConfig {
    const configObjectFullPath: string = path.resolve(configJsonFilePath);
    const configObject: Partial<IExtractorConfig> = ExtractorConfig.loadJsonFileWithInheritance(configObjectFullPath);

    const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
    const packageJsonFullPath: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(
      configObjectFullPath);

    const extractorConfig: ExtractorConfig = ExtractorConfig.parseConfigObject({
      configObject,
      configObjectFullPath,
      packageJsonFullPath
    });

    return extractorConfig;
  }

  /**
   * Performs only the first half of {@link ExtractorConfig.loadAndParseConfig}, providing an opportunity to
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

    let configObject: Partial<IExtractorConfig> = JsonFile.load(currentConfigFilePath);

    try {
      while (configObject.extends) {
        // Check if this file was already processed.
        if (visitedPaths.has(currentConfigFilePath)) {
          throw new Error(`The API Extractor config files contain a cycle. "${currentConfigFilePath}"`
            + ` is included twice.  Please check the "extends" values in config files.`);
        }
        visitedPaths.add(currentConfigFilePath);

        const currentConfigFolderPath: string = path.dirname(currentConfigFilePath);

        if (configObject.extends.match(/^\.\.?[\\/]/)) {
          // EXAMPLE:  "./subfolder/api-extractor-base.json"
          currentConfigFilePath = path.resolve(currentConfigFolderPath, configObject.extends);
        } else {
          // EXAMPLE:  "my-package/api-extractor-base.json"
          //
          // Resolve "my-package" from the perspective of the current folder.
          currentConfigFilePath = resolve.sync(
            configObject.extends,
            {
              basedir: currentConfigFolderPath
            }
          );
        }

        // Load the extractor config defined in extends property.
        const baseConfig: IExtractorConfig = JsonFile.load(currentConfigFilePath);

        // Delete the "extends" field, since we've already expanded it
        delete configObject.extends;

        // Merge extractorConfig into baseConfig, mutating baseConfig
        lodash.merge(baseConfig, configObject);

        configObject = baseConfig;
      }
    } catch (e) {
      throw new Error(`Error loading ${currentConfigFilePath}:\n` + e.message);
    }

    // Lastly, apply the defaults
    configObject = lodash.merge(lodash.cloneDeep(ExtractorConfig._defaultConfig), configObject);

    return configObject;
  }

  /**
   * Parses the api-extractor.json configuration provided as a runtime object, rather than reading it from disk.
   * This allows configurations to be customized or constructed programmatically.
   */
  public static parseConfigObject(options: IExtractorConfigParseConfigObjectOptions): ExtractorConfig {
    const filenameForErrors: string = options.configObjectFullPath || 'the configuration object';
    const configObject: Partial<IExtractorConfig> = options.configObject;

    if (options.configObjectFullPath) {
      if (!path.isAbsolute(options.configObjectFullPath)) {
        throw new Error('configObjectFullPath must be an absolute path');
      }
    }

    ExtractorConfig.jsonSchema.validateObject(configObject, filenameForErrors);

    const result: ExtractorConfig = new ExtractorConfig();

    if (options.packageJsonFullPath) {
      if (path.isAbsolute(options.packageJsonFullPath)) {
        throw new Error('packageJsonFullPath must be an absolute path');
      }

      if (!options.packageJson) {
        const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
        result.packageJson = packageJsonLookup.loadNodePackageJson(options.packageJsonFullPath);
      }
    }

    try {

      if (!configObject.compiler) {
        // A merged configuration should have this
        throw new Error('The "compiler" section is missing');
      }

      if (configObject.compiler.rootFolder.trim() === '<lookup>') {
        if (!options.configObjectFullPath) {
          throw new Error('The "<lookup>" token cannot be expanded because configObjectFullPath was not specified');
        }
        // "The default value for `rootFolder` is the token `<lookup>`, which means the folder is determined
        // by traversing parent folders, starting from the folder containing api-extractor.json, and stopping
        // at the first folder that contains a tsconfig.json file.  If a tsconfig.json file cannot be found in
        // this way, then an error will be reported."

        let currentFolder: string = path.dirname(options.configObjectFullPath);
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
        if (!configObject.compiler.rootFolder) {
          throw new Error('The rootFolder must be specified');
        }

        ExtractorConfig._rejectAnyTokensInPath(configObject.compiler.rootFolder, 'rootFolder');

        if (!FileSystem.exists(configObject.compiler.rootFolder)) {
          throw new Error('The specified rootFolder does not exist: ' + configObject.compiler.rootFolder);
        }

        result.rootFolder = configObject.compiler.rootFolder;
      }

      if (result.packageJson) {
        result.tokens.packageName = result.packageJson.name;
        result.tokens.unscopedPackageName = PackageName.getUnscopedName(result.packageJson.name);
      }

      if (!configObject.mainEntryPointFile) {
        // A merged configuration should have this
        throw new Error('mainEntryPointFile is missing');
      }
      result.mainEntryPointFile = result._resolvePathWithTokens('mainEntryPointFile', configObject.mainEntryPointFile);

      if (!ExtractorConfig.hasDtsFileExtension(result.mainEntryPointFile)) {
        throw new Error('The mainEntryPointFile is not a declaration file: ' + result.mainEntryPointFile);
      }

      if (!FileSystem.exists(result.mainEntryPointFile)) {
        throw new Error('The mainEntryPointFile does not exist: ' + result.mainEntryPointFile);
      }

      result.overrideTsconfig = configObject.compiler.overrideTsconfig;
      result.skipLibCheck = !!configObject.compiler.skipLibCheck;

      if (configObject.apiReport) {
        result.apiReportEnabled = !!configObject.apiReport.enabled;

        const reportFilename: string = configObject.apiReport.reportFileName || '';
        if (!reportFilename) {
          // A merged configuration should have this
          throw new Error('reportFilename is missing');
        }
        if (reportFilename.indexOf('/') >= 0 || reportFilename.indexOf('\\') >= 0) {
          // A merged configuration should have this
          throw new Error(`The reportFilename contains invalid characters: "${reportFilename}"`);
        }

        const reportFolder: string = result._resolvePathWithTokens('reportFolder',
          configObject.apiReport.reportFolder);
        const tempFolder: string = result._resolvePathWithTokens('tempFolder',
          configObject.apiReport.tempFolder);

        result.reportFilePath = path.join(reportFolder, reportFilename);
        result.tempReportFilePath = path.join(tempFolder, reportFilename);
      }

      if (configObject.docModel) {
        result.apiReportEnabled = !!configObject.docModel.enabled;
        result.apiJsonFilePath = result._resolvePathWithTokens('apiJsonFilePath',
          configObject.docModel.apiJsonFilePath);
      }

      if (configObject.tsdocMetadata) {
        result.tsdocMetadataEnabled = !!configObject.tsdocMetadata.enabled;

        if (configObject.compiler.rootFolder.trim() === '<lookup>') {
          if (!result.packageJson) {
            throw new Error('The "<lookup>" token cannot be used with compiler.rootFolder because'
              + 'the "packageJson" option was not provided');
          }
          if (!result.packageJsonFullPath) {
            throw new Error('The "<lookup>" token cannot be used with compiler.rootFolder because'
              + 'the "packageJsonFullPath" option was not provided');
          }
          result.tsdocMetadataFilePath = PackageMetadataManager.resolveTsdocMetadataPath(
            path.dirname(result.packageJsonFullPath),
            result.packageJson,
            result.tsdocMetadataFilePath
          );
        } else {
          result.tsdocMetadataFilePath = result._resolvePathWithTokens('tsdocMetadataFilePath',
          configObject.tsdocMetadata.tsdocMetadataFilePath);
        }
      }

      if (configObject.messages) {
        result.messages = configObject.messages;
      }

      result.testMode = !!configObject.testMode;
    } catch (e) {
      throw new Error(`Error parsing ${filenameForErrors}:\n` + e.message);
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
