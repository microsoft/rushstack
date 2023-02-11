// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Compilation, Compiler, WebpackPluginInstance, sources } from 'webpack';

const PLUGIN_NAME: 'EmbeddedDependenciesWebpackPlugin' = 'EmbeddedDependenciesWebpackPlugin';

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

type PackageMapKey = `${string}@${string}`;
type ThirdPartyPackageMap = Map<PackageMapKey, { dir: string; data: IPackageData }>;

const makePackageMapKeyForPackage = (pkg: IPackageData): PackageMapKey => `${pkg.name}@${pkg.version}`;

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
      compilation.hooks.processAssets.tap(
        { name: PLUGIN_NAME, stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        (assets) => {
          console.log(thirdPartyPackages);

          compilation.emitAsset(
            'embedded-dependencies.json',
            new sources.RawSource(JSON.stringify(Array.from(thirdPartyPackages.values())))
          );
        }
      );
    });
  }
}
