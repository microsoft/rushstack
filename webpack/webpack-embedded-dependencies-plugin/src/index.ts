// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import path from 'path';

import type { IPackageJson } from '@rushstack/node-core-library';

import { LegacyAdapters, FileSystem } from '@rushstack/node-core-library';
import { Compilation, Compiler, WebpackPluginInstance, sources, WebpackError } from 'webpack';

import { LICENSE_FILES_REGEXP, COPYRIGHT_REGEX } from './regexpUtils';

const PLUGIN_NAME: 'EmbeddedDependenciesWebpackPlugin' = 'EmbeddedDependenciesWebpackPlugin';

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

type LicenseFileGeneratorFunction = (packages: IPackageJson[]) => string;
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
  public generateLicenseFileFunction?: LicenseFileGeneratorFunction;
  public generatedLicenseFilename: LicenseFileName;

  public constructor(options?: IEmbeddedDependenciesWebpackPluginOptions) {
    this.outputFileName = options?.outputFileName || 'embedded-dependencies.json';
    this.generateLicenseFile = options?.generateLicenseFile || false;
    this.generateLicenseFileFunction = options?.generateLicenseFileFunction || undefined;
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
      compilation.hooks.processAssets.tapAsync(
        { name: PLUGIN_NAME, stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        async (assets, callback) => {
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
            if (packages.length === 0) {
              compilation.warnings.push(
                new WebpackError(
                  `[embedded-dependencies-webpack-plugin]: No third party dependencies were found. Skipping license file generation.`
                )
              );
              callback();
              return;
            }
            // We should try catch here because generator function can be output from user config
            try {
              if (this.generateLicenseFileFunction) {
                compilation.emitAsset(
                  this.generatedLicenseFilename,
                  new sources.RawSource(this.generateLicenseFileFunction(packages))
                );
              } else {
                compilation.emitAsset(
                  this.generatedLicenseFilename,
                  new sources.RawSource(this._defaultLicenseFileGenerator(packages))
                );
              }
            } catch (e) {
              compilation.errors.push(
                new WebpackError(
                  `[embedded-dependencies-webpack-plugin]: Failed to generate license file: ${e}`
                )
              );
            }
          }

          callback();
        }
      );
    });
  }

  private async _getLicenseFilePath(modulePath: string, compiler: Compiler): Promise<string | undefined> {
    type InputFileSystemReadDirResults = Parameters<
      Parameters<typeof compiler.inputFileSystem.readdir>[1]
    >[1];

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
