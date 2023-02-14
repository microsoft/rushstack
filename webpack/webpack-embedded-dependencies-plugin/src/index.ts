// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import path from 'path';
import type { IOptions } from 'glob';

import { FileSystem, Import, LegacyAdapters } from '@rushstack/node-core-library';
import { Compilation, Compiler, WebpackPluginInstance, sources } from 'webpack';

const glob: typeof import('glob') = Import.lazy('glob', require);
const globAsync = (pattern: string, options: IOptions = {}): Promise<string[]> => {
  return LegacyAdapters.convertCallbackToPromise(glob, pattern, options);
};

const COPYRIGHT_REGEX: RegExp = /^Copyright .*$/m;
const LICENSE_FILES: string = '@(LICENSE|LICENSE-MIT.txt|LICENSE.md|LICENSE.txt|license)';
const PLUGIN_NAME: 'EmbeddedDependenciesWebpackPlugin' = 'EmbeddedDependenciesWebpackPlugin';

interface IEmbeddedDependenciesFile {
  name?: string;
  version?: string;
  embeddedDependencies: IPackageData[];
}

interface IDependency {
  [key: string]: string;
}

interface IResourceResolveData {
  descriptionFileData?: IPackageData;
  descriptionFileRoot?: string;
  relativePath?: string;
}

interface IWebpackModuleCreateData {
  resourceResolveData?: IResourceResolveData;
}

interface IPackageData {
  name: string;
  version: string;
  copyright: string | undefined;
  author?: string | { name?: string };
  license?: string;

  // tslint:disable-next-line:no-reserved-keywords
  licenses?: Array<{ type: string; url: string }>;

  dependencies?: IDependency;
  peerDependencies?: IDependency;
  devDependencies?: IDependency;
}

interface IEmbeddedDependenciesWebpackPluginOptions {
  outputFileName?: string;
  generateLicenseFile?: boolean;
  generateLicenseFileFunction?: (packages: IPackageData[]) => string;
}

type PackageMapKey = `${string}@${string}`;
type ThirdPartyPackageMap = Map<PackageMapKey, { dir: string; data: IPackageData }>;
type FlattenedPackageEntry = [PackageMapKey, { dir: string; data: IPackageData }];

export default class EmbeddedDependenciesWebpackPlugin implements WebpackPluginInstance {
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
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
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
            const copyright: string | undefined = (await parseCopyright(dir)) || parsePackageAuthor(data);
            packages.push({
              name,
              version,
              license,
              copyright
            });
          }

          const dataToStringify: IEmbeddedDependenciesFile = {
            embeddedDependencies: packages
          };

          console.log(dataToStringify);

          compilation.emitAsset(
            'embedded-dependencies.json',
            new sources.RawSource(JSON.stringify(dataToStringify))
          );

          callback();
        }
      );
    });
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

/**
 * Given a module path, try to parse the module's copyright attribution.
 */
async function parseCopyright(modulePath: string): Promise<string | undefined> {
  // Add copyright info
  const licenseFile: string[] = await globAsync(path.join(modulePath, LICENSE_FILES));

  if (licenseFile.length > 0) {
    const license: string = await FileSystem.readFileAsync(licenseFile[0]);
    const match: RegExpMatchArray | null = license.match(COPYRIGHT_REGEX);

    if (match) {
      return match[0];
    }
  }

  return undefined;
}

function parsePackageAuthor(p: IPackageData): string | undefined {
  return typeof p.author === 'string' ? p.author : p.author ? p.author.name : undefined;
}
