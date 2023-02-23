// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import path from 'path';

import type { IPackageJson } from '@rushstack/node-core-library';

import { LegacyAdapters, FileSystem } from '@rushstack/node-core-library';
import { Compilation, Compiler, WebpackPluginInstance, sources, WebpackError } from 'webpack';

import { LICENSE_FILES_REGEXP, COPYRIGHT_REGEX } from './regexpUtils';

const PLUGIN_NAME: 'EmbeddedDependenciesWebpackPlugin' = 'EmbeddedDependenciesWebpackPlugin';
const PLUGIN_ERROR_PREFIX: string = '[embedded-dependencies-webpack-plugin]';

interface IEmbeddedDependenciesFile {
  name?: string;
  version?: string;
  embeddedDependencies: IPackageData[];
}

interface IResourceResolveData {
  descriptionFileData?: IPackageData;
  descriptionFileRoot?: string;
  relativePath?: string;
}

interface IWebpackModuleCreateData {
  resourceResolveData?: IResourceResolveData;
}

interface IPackageData extends IPackageJson {
  copyright: string | undefined;
  author?: string | { name?: string };
  licenses?: { type: string; url: string }[];
  licensePath?: string;
}

interface IEmbeddedDependenciesWebpackPluginOptions {
  outputFileName?: string;
  generateLicenseFile?: boolean;
  generateLicenseFileFunction?: LicenseFileGeneratorFunction;
  generatedLicenseFilename?: LicenseFileName;
}

type LicenseFileGeneratorFunction = (packages: IPackageData[]) => string;
type PackageMapKey = `${string}@${string}`;
type LicenseFileName = `${string}.${'html' | 'md' | 'txt'}`;
type ThirdPartyPackageMap = Map<PackageMapKey, { dir: string; data: IPackageData }>;
type FlattenedPackageEntry = [PackageMapKey, { dir: string; data: IPackageData }];

/**
 * @alpha
 * Webpack plugin that generates a file with the list of embedded dependencies
 * and their licenses.
 */
export default class EmbeddedDependenciesWebpackPlugin implements WebpackPluginInstance {
  public outputFileName: string;
  public generateLicenseFile: boolean;
  public generateLicenseFileFunction: LicenseFileGeneratorFunction;
  public generatedLicenseFilename: LicenseFileName;

  public constructor(options?: IEmbeddedDependenciesWebpackPluginOptions) {
    this.outputFileName = options?.outputFileName || 'embedded-dependencies.json';
    this.generateLicenseFile = options?.generateLicenseFile || false;
    this.generateLicenseFileFunction =
      options?.generateLicenseFileFunction || this._defaultLicenseFileGenerator;
    this.generatedLicenseFilename = options?.generatedLicenseFilename || 'THIRD-PARTY-NOTICES.html';
  }

  public apply(compiler: Compiler): void {
    const thirdPartyPackages: ThirdPartyPackageMap = new Map();

    compiler.hooks.normalModuleFactory.tap(PLUGIN_NAME, (normalModuleFactory) => {
      normalModuleFactory.hooks.module.tap(
        PLUGIN_NAME,
        (module, moduleCreateData: IWebpackModuleCreateData, resolveData) => {
          const { resourceResolveData } = moduleCreateData;
          const pkg: IPackageData | undefined = resourceResolveData?.descriptionFileData;
          const filePath: string | undefined = resourceResolveData?.descriptionFileRoot;

          if (pkg && filePath && filePath.includes('node_modules')) {
            const key: PackageMapKey = makePackageMapKeyForPackage(pkg);
            thirdPartyPackages.set(key, { dir: filePath, data: pkg });
          }

          return module;
        }
      );
    });

    // Tap into compilation so we can tap into compilation.hooks.processAssets
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        { name: PLUGIN_NAME, stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        async (assets) => {
          const rawPackages: FlattenedPackageEntry[] = Array.from(thirdPartyPackages).sort((first, next) => {
            return first[0].localeCompare(next[0]);
          });

          const packages: IPackageData[] = [];

          for (const [, { dir, data }] of rawPackages) {
            const { name, version } = data;
            const license: string | undefined = parseLicense(data);
            const licensePath: string | undefined = await this._getLicenseFilePath(dir, compiler);
            const copyright: string | undefined =
              (await this._parseCopyright(dir, compiler)) || parsePackageAuthor(data);

            packages.push({
              name,
              version,
              license,
              licensePath,
              copyright
            });
          }

          const dataToStringify: IEmbeddedDependenciesFile = {
            embeddedDependencies: packages
          };

          compilation.emitAsset(this.outputFileName, new sources.RawSource(JSON.stringify(dataToStringify)));

          if (this.generateLicenseFile) {
            // We should try catch here because generator function can be output from user config
            try {
              compilation.emitAsset(
                this.generatedLicenseFilename,
                new sources.RawSource(this.generateLicenseFileFunction(packages))
              );
            } catch (error: unknown) {
              this._emitWebpackError(compilation, 'Failed to generate license file', error);
            }
          }

          return;
        }
      );
    });
  }

  /**
   * Default error handler for try/catch blocks in the plugin
   * try/catches emit errors of type `unknown` and we need to handle them based on what
   * type the error is. This function provides a convenient way to handle errors and then
   * propagate them to webpack as WebpackError objects on `compilation.errors` array.
   *
   * @remarks
   * _If we need to push errors to `compilation.warnings` array, we should just create a companion function
   * that does the same thing but pushes to `compilation.warnings` array instead._
   *
   * @example
   * ```typescript
   * try {
   *   // do some operation
   *   FileSystem.readFile('some-file');
   * } catch (error: unknown) {
   *   this._emitWebpackError(compilation, 'Failed to do some operation', error);
   * }
   * ```
   */
  private _emitWebpackError(compilation: Compilation, errorMessage: string, error: unknown): void {
    // If the error is a string, we can just emit it as is with message prefix and error message
    if (typeof error === 'string') {
      compilation.errors.push(new WebpackError(`${PLUGIN_ERROR_PREFIX}: ${errorMessage}: ${error}`));
      // If error is an instance of Error, we can emit it with message prefix, error message and stack trace
    } else if (error instanceof Error) {
      compilation.errors.push(
        new WebpackError(`${PLUGIN_ERROR_PREFIX}: ${errorMessage}: ${error.message}\n${error.stack || ''}`)
      );
      // If error is not a string or an instance of Error, we can emit it with message prefix and error message and JSON.stringify it
    } else {
      compilation.errors.push(
        new WebpackError(`${PLUGIN_ERROR_PREFIX}: ${errorMessage}: ${JSON.stringify(error || '')}`)
      );
    }
  }

  private async _getLicenseFilePath(modulePath: string, compiler: Compiler): Promise<string | undefined> {
    type InputFileSystemReadDirResults = Parameters<
      Parameters<typeof compiler.inputFileSystem.readdir>[1]
    >[1];

    // TODO: Real fs.readdir can take an arguement ({ withFileTypes: true }) which will filter out directories for better performance
    //       and return a list of Dirent objects. Currently the webpack types are hand generated for fs.readdir so
    //       we can't use this feature yet, or we would have to cast the types of inputFileSystem.readdir.
    const files: InputFileSystemReadDirResults = await LegacyAdapters.convertCallbackToPromise(
      compiler.inputFileSystem.readdir,
      modulePath
    );

    return files
      ?.map((file) => file.toString())
      .filter((file) => LICENSE_FILES_REGEXP.test(file))
      .map((file) => path.join(modulePath, file))[0]; // Grabbing the first license file if multiple are found
  }

  /**
   * Given a module path, try to parse the module's copyright attribution.
   */
  private async _parseCopyright(modulePath: string, compiler: Compiler): Promise<string | undefined> {
    const licenseFile: string | undefined = await this._getLicenseFilePath(modulePath, compiler);

    if (licenseFile) {
      const license: string = await FileSystem.readFileAsync(licenseFile);
      const match: RegExpMatchArray | null = license.match(COPYRIGHT_REGEX);

      if (match) {
        return match[0];
      }
    }

    return undefined;
  }

  private _defaultLicenseFileGenerator(packages: IPackageData[]): string {
    const licenseFileStrings: string[] = [];

    const licenseTemplateForPackage = (pkg: IPackageData, licenseContent: string): string => {
      return `
        <hr />
        ${pkg.name} - ${pkg.version}
        <br />
        <br />
        ${licenseContent}
      `;
    };

    for (const pkg of packages) {
      if (pkg.licensePath) {
        const licenseContent: string | undefined = FileSystem.readFile(pkg.licensePath);
        licenseFileStrings.push(licenseTemplateForPackage(pkg, licenseContent));
      }
    }

    return licenseFileStrings.join('\n');
  }
}

function makePackageMapKeyForPackage(pkg: IPackageData): PackageMapKey {
  return `${pkg.name}@${pkg.version}`;
}

/**
 * Returns the license type
 */
function parseLicense(packageData: IPackageData): string | undefined {
  if (packageData.license) {
    return packageData.license;
  } else if (typeof packageData.licenses === 'string') {
    return packageData.licenses;
  } else if (packageData.licenses && packageData.licenses.length) {
    return packageData.licenses.length === 1
      ? packageData.licenses[0].type
      : `(${packageData.licenses
          .map((license: { type: string; url: string }) => license.type)
          .join(' OR ')})`;
  }

  return undefined;
}

function parsePackageAuthor(p: IPackageData): string | undefined {
  return typeof p.author === 'string' ? p.author : p.author?.name;
}
