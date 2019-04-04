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
  IConfigFile,
  IExtractorMessagesConfig
} from './IConfigFile';
import { PackageMetadataManager } from '../analyzer/PackageMetadataManager';

/**
 * Tokens used during variable expansion of path fields from api-extractor.json.
 */
interface IExtractorConfigTokenContext {
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

  rootFolder: string;
}

/**
 * Options for {@link ExtractorConfig.prepare}.
 *
 * @public
 */
export interface IExtractorConfigPrepareOptions {
  /**
   * An already prepared configuration object as returned by {@link ExtractorConfig.loadFile}.
   */
  configObject: IConfigFile;

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

interface IExtractorConfigParameters {
  rootFolder: string;
  packageJson: INodePackageJson | undefined;
  packageJsonFullPath: string | undefined;
  mainEntryPointFile: string;
  overrideTsconfig: { } | undefined;
  skipLibCheck: boolean;
  apiReportEnabled: boolean;
  reportFilePath: string;
  reportTempFilePath: string;
  docModelEnabled: boolean;
  apiJsonFilePath: string;
  rollupEnabled: boolean;
  untrimmedFilePath: string;
  betaTrimmedFilePath: string;
  publicTrimmedFilePath: string;
  tsdocMetadataEnabled: boolean;
  tsdocMetadataFilePath: string;
  messages: IExtractorMessagesConfig;
  testMode: boolean;
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

  private static readonly _defaultConfig: Partial<IConfigFile> = JsonFile.load(path.join(__dirname,
    '../schemas/api-extractor-defaults.json'));

  private static readonly _declarationFileExtensionRegExp: RegExp = /\.d\.ts$/i;

  /** {@inheritDoc IConfigCompiler.rootFolder} */
  public readonly rootFolder: string;

  /**
   * The parsed package.json file for the working package, or undefined if API Extractor was invoked without
   * a package.json file.
   */
  public readonly packageJson: INodePackageJson | undefined;

  /**
   * The absolute path of the file that package.json was loaded from, or undefined if API Extractor was invoked without
   * a package.json file.
   */
  public readonly packageJsonFullPath: string | undefined;

  /** {@inheritDoc IConfigFile.mainEntryPointFile} */
  public readonly mainEntryPointFile: string;

  /** {@inheritDoc IConfigCompiler.overrideTsconfig} */
  public readonly overrideTsconfig: { } | undefined;

  /** {@inheritDoc IConfigCompiler.skipLibCheck} */
  public readonly skipLibCheck: boolean;

  /** {@inheritDoc IConfigApiReport.enabled} */
  public readonly apiReportEnabled: boolean;

  /** The `reportFolder` path combined with the `reportFileName`. */
  public readonly reportFilePath: string;
  /** The `reportTempFolder` path combined with the `reportFileName`. */
  public readonly reportTempFilePath: string;

  /** {@inheritDoc IConfigDocModel.enabled} */
  public readonly docModelEnabled: boolean;
  /** {@inheritDoc IConfigDocModel.apiJsonFilePath} */
  public readonly apiJsonFilePath: string;

  /** {@inheritDoc IConfigDtsRollup.enabled} */
  public readonly rollupEnabled: boolean;
  /** {@inheritDoc IConfigDtsRollup.untrimmedFilePath} */
  public readonly untrimmedFilePath: string;
  /** {@inheritDoc IConfigDtsRollup.betaTrimmedFilePath} */
  public readonly betaTrimmedFilePath: string;
  /** {@inheritDoc IConfigDtsRollup.publicTrimmedFilePath} */
  public readonly publicTrimmedFilePath: string;

  /** {@inheritDoc IConfigTsdocMetadata.enabled} */
  public readonly tsdocMetadataEnabled: boolean;
  /** {@inheritDoc IConfigTsdocMetadata.tsdocMetadataFilePath} */
  public readonly tsdocMetadataFilePath: string;

  /** {@inheritDoc IConfigFile.messages} */
  public readonly messages: IExtractorMessagesConfig;

  /** {@inheritDoc IConfigFile.testMode} */
  public readonly testMode: boolean;

  private constructor(parameters: IExtractorConfigParameters) {
    this.rootFolder = parameters.rootFolder;
    this.packageJson = parameters.packageJson;
    this.packageJsonFullPath = parameters.packageJsonFullPath;
    this.mainEntryPointFile = parameters.mainEntryPointFile;
    this.overrideTsconfig = parameters.overrideTsconfig;
    this.skipLibCheck = parameters.skipLibCheck;
    this.apiReportEnabled = parameters.apiReportEnabled;
    this.reportFilePath = parameters.reportFilePath;
    this.reportTempFilePath = parameters.reportTempFilePath;
    this.docModelEnabled = parameters.docModelEnabled;
    this.apiJsonFilePath = parameters.apiJsonFilePath;
    this.rollupEnabled = parameters.rollupEnabled;
    this.untrimmedFilePath = parameters.untrimmedFilePath;
    this.betaTrimmedFilePath = parameters.betaTrimmedFilePath;
    this.publicTrimmedFilePath = parameters.publicTrimmedFilePath;
    this.tsdocMetadataEnabled = parameters.tsdocMetadataEnabled;
    this.tsdocMetadataFilePath = parameters.tsdocMetadataFilePath;
    this.messages = parameters.messages;
    this.testMode = parameters.testMode;
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
  public static loadFileAndPrepare(configJsonFilePath: string): ExtractorConfig {
    const configObjectFullPath: string = path.resolve(configJsonFilePath);
    const configObject: IConfigFile = ExtractorConfig.loadFile(configObjectFullPath);

    const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
    const packageJsonFullPath: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(
      configObjectFullPath);

    const extractorConfig: ExtractorConfig = ExtractorConfig.prepare({
      configObject,
      configObjectFullPath,
      packageJsonFullPath
    });

    return extractorConfig;
  }

  /**
   * Performs only the first half of {@link ExtractorConfig.loadFileAndPrepare}, providing an opportunity to
   * modify the object before it is pssed to {@link ExtractorConfig.prepare}.
   *
   * @remarks
   *
   * Loads the api-extractor.json config file from the specified file path.
   * If the "extends" field is present, the referenced file(s) will be merged,
   * along with the API Extractor defaults.
   */
  public static loadFile(jsonFilePath: string): IConfigFile {
    // Set to keep track of config files which have been processed.
    const visitedPaths: Set<string> = new Set<string>();

    // Get absolute path of config file.
    let currentConfigFilePath: string = path.resolve(process.cwd(), jsonFilePath);

    let configObject: Partial<IConfigFile> = JsonFile.load(currentConfigFilePath);

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
        const baseConfig: IConfigFile = JsonFile.load(currentConfigFilePath);

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

    ExtractorConfig.jsonSchema.validateObject(configObject, jsonFilePath);

    // The schema validation should ensure that this object conforms to IConfigFile
    return configObject as IConfigFile;
  }

  /**
   * Parses the api-extractor.json configuration provided as a runtime object, rather than reading it from disk.
   * This allows configurations to be customized or constructed programmatically.
   */
  public static prepare(options: IExtractorConfigPrepareOptions): ExtractorConfig {
    const filenameForErrors: string = options.configObjectFullPath || 'the configuration object';
    const configObject: Partial<IConfigFile> = options.configObject;

    if (options.configObjectFullPath) {
      if (!path.isAbsolute(options.configObjectFullPath)) {
        throw new Error('configObjectFullPath must be an absolute path');
      }
    }

    ExtractorConfig.jsonSchema.validateObject(configObject, filenameForErrors);

    let packageJson: INodePackageJson | undefined = undefined;
    const packageJsonFullPath: string | undefined = options.packageJsonFullPath;
    if (packageJsonFullPath) {
      if (!/.json$/i.test(packageJsonFullPath)) {
        // Catch common mistakes e.g. where someone passes a folder path instead of a file path
        throw new Error('The packageJsonFullPath does not have a .json file extension');
      }
      if (!path.isAbsolute(packageJsonFullPath)) {
        throw new Error('packageJsonFullPath must be an absolute path');
      }

      if (!options.packageJson) {
        const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();
        packageJson = packageJsonLookup.loadNodePackageJson(packageJsonFullPath);
      }
    }

    try {

      if (!configObject.compiler) {
        // A merged configuration should have this
        throw new Error('The "compiler" section is missing');
      }

      let rootFolder: string;
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
            rootFolder = currentFolder;
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

        rootFolder = configObject.compiler.rootFolder;
      }

      const tokenContext: IExtractorConfigTokenContext = {
        unscopedPackageName: 'unknown-package',
        packageName: 'unknown-package',
        rootFolder
      };

      if (packageJson) {
        tokenContext.packageName = packageJson.name;
        tokenContext.unscopedPackageName = PackageName.getUnscopedName(packageJson.name);
      }

      if (!configObject.mainEntryPointFile) {
        // A merged configuration should have this
        throw new Error('mainEntryPointFile is missing');
      }
      const mainEntryPointFile: string = ExtractorConfig._resolvePathWithTokens('mainEntryPointFile',
        configObject.mainEntryPointFile, tokenContext);

      if (!ExtractorConfig.hasDtsFileExtension(mainEntryPointFile)) {
        throw new Error('The mainEntryPointFile is not a declaration file: ' + mainEntryPointFile);
      }

      if (!FileSystem.exists(mainEntryPointFile)) {
        throw new Error('The mainEntryPointFile does not exist: ' + mainEntryPointFile);
      }

      let apiReportEnabled: boolean = false;
      let reportFilePath: string = '';
      let reportTempFilePath: string = '';
      if (configObject.apiReport) {
        apiReportEnabled = !!configObject.apiReport.enabled;

        const reportFilename: string = ExtractorConfig._expandStringWithTokens('reportFileName',
          configObject.apiReport.reportFileName || '', tokenContext);

        if (!reportFilename) {
          // A merged configuration should have this
          throw new Error('reportFilename is missing');
        }
        if (reportFilename.indexOf('/') >= 0 || reportFilename.indexOf('\\') >= 0) {
          // A merged configuration should have this
          throw new Error(`The reportFilename contains invalid characters: "${reportFilename}"`);
        }

        const reportFolder: string = ExtractorConfig._resolvePathWithTokens('reportFolder',
          configObject.apiReport.reportFolder, tokenContext);
        const reportTempFolder: string = ExtractorConfig._resolvePathWithTokens('reportTempFolder',
          configObject.apiReport.reportTempFolder, tokenContext);

        reportFilePath = path.join(reportFolder, reportFilename);
        reportTempFilePath = path.join(reportTempFolder, reportFilename);
      }

      let docModelEnabled: boolean = false;
      let apiJsonFilePath: string = '';
      if (configObject.docModel) {
        docModelEnabled = !!configObject.docModel.enabled;
        apiJsonFilePath = ExtractorConfig._resolvePathWithTokens('apiJsonFilePath',
          configObject.docModel.apiJsonFilePath, tokenContext);
      }

      let tsdocMetadataEnabled: boolean = false;
      let tsdocMetadataFilePath: string = '';
      if (configObject.tsdocMetadata) {
        tsdocMetadataEnabled = !!configObject.tsdocMetadata.enabled;

        if (tsdocMetadataEnabled) {
          tsdocMetadataFilePath = configObject.tsdocMetadata.tsdocMetadataFilePath || '';

          if (tsdocMetadataFilePath.trim() === '<lookup>') {
            if (!packageJson) {
              throw new Error('The "<lookup>" token cannot be used with compiler.rootFolder because'
                + 'the "packageJson" option was not provided');
            }
            if (!packageJsonFullPath) {
              throw new Error('The "<lookup>" token cannot be used with compiler.rootFolder because'
                + 'the "packageJsonFullPath" option was not provided');
            }
            tsdocMetadataFilePath = PackageMetadataManager.resolveTsdocMetadataPath(
              path.dirname(packageJsonFullPath),
              packageJson
            );
          } else {
            tsdocMetadataFilePath = ExtractorConfig._resolvePathWithTokens('tsdocMetadataFilePath',
              configObject.tsdocMetadata.tsdocMetadataFilePath, tokenContext);
          }

          if (!tsdocMetadataFilePath) {
            throw new Error('The tsdocMetadata.enabled was specified, but tsdocMetadataFilePath is not specified');
          }
        }
      }

      let rollupEnabled: boolean = false;
      let untrimmedFilePath: string = '';
      let betaTrimmedFilePath: string = '';
      let publicTrimmedFilePath: string = '';

      if (configObject.dtsRollup) {
        rollupEnabled = !!configObject.dtsRollup.enabled;
        untrimmedFilePath = ExtractorConfig._resolvePathWithTokens('untrimmedFilePath',
          configObject.dtsRollup.untrimmedFilePath, tokenContext);
        betaTrimmedFilePath = ExtractorConfig._resolvePathWithTokens('betaTrimmedFilePath',
          configObject.dtsRollup.betaTrimmedFilePath, tokenContext);
        publicTrimmedFilePath = ExtractorConfig._resolvePathWithTokens('publicTrimmedFilePath',
          configObject.dtsRollup.publicTrimmedFilePath, tokenContext);
      }

      return new ExtractorConfig({
        rootFolder,
        packageJson,
        packageJsonFullPath,
        mainEntryPointFile,
        overrideTsconfig: configObject.compiler.overrideTsconfig,
        skipLibCheck: !!configObject.compiler.skipLibCheck,
        apiReportEnabled,
        reportFilePath,
        reportTempFilePath,
        docModelEnabled,
        apiJsonFilePath,
        rollupEnabled,
        untrimmedFilePath,
        betaTrimmedFilePath,
        publicTrimmedFilePath,
        tsdocMetadataEnabled,
        tsdocMetadataFilePath,
        messages: configObject.messages || { },
        testMode: !!configObject.testMode
      });

    } catch (e) {
      throw new Error(`Error parsing ${filenameForErrors}:\n` + e.message);
    }
  }

  private static _resolvePathWithTokens(fieldName: string, value: string | undefined,
    tokenContext: IExtractorConfigTokenContext): string {

    value = ExtractorConfig._expandStringWithTokens(fieldName, value, tokenContext);
    if (value !== '') {
      value = path.resolve(tokenContext.rootFolder, value);
    }
    return value;
  }

  private static _expandStringWithTokens(fieldName: string, value: string | undefined,
    tokenContext: IExtractorConfigTokenContext): string {
    value = value ? value.trim() : '';
    if (value !== '') {
      value = Text.replaceAll(value, '<unscopedPackageName>', tokenContext.unscopedPackageName);
      value = Text.replaceAll(value, '<packageName>', tokenContext.packageName);
      if (value.indexOf('<lookup>') >= 0) {
        throw new Error(`The ${fieldName} value incorrectly uses the "<lookup>" token`);
      }
      ExtractorConfig._rejectAnyTokensInPath(value, fieldName);
    }
    return value;
  }

  /**
   * Returns true if the specified file path has the ".d.ts" file extension.
   */
  public static hasDtsFileExtension(filePath: string): boolean {
    return ExtractorConfig._declarationFileExtensionRegExp.test(filePath);
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
