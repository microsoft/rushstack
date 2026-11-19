// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IPackageJson, JsonFile, type JsonObject } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import { PnpmfileConfiguration } from '../PnpmfileConfiguration';

describe(PnpmfileConfiguration.name, () => {
  const repoPath: string = `${__dirname}/repo`;
  const rushFilename: string = `${repoPath}/rush3.json`;
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
  const shimPath: string = `${rushConfiguration.defaultSubspace.getSubspaceTempFolderPath()}/pnpmfileSettings.json`;

  beforeAll(async () => {
    const subspace = rushConfiguration.defaultSubspace;
    await PnpmfileConfiguration.writeCommonTempPnpmfileShimAsync(
      rushConfiguration,
      subspace.getSubspaceTempFolderPath(),
      subspace,
      undefined
    );
  });

  it('should use the smallest-available SemVer range (preferredVersions)', async () => {
    const shimJson: JsonObject = await JsonFile.loadAsync(shimPath);
    expect(shimJson.allPreferredVersions).toHaveProperty('core-js', '3.6.5');
  });

  it('should use the smallest-available SemVer range (per-project)', async () => {
    const shimJson: JsonObject = await JsonFile.loadAsync(shimPath);
    expect(shimJson.allPreferredVersions).toHaveProperty('delay', '5.0.0');
  });

  it('should override preferredVersions when per-project versions conflict', async () => {
    const shimJson: JsonObject = await JsonFile.loadAsync(shimPath);
    expect(shimJson.allPreferredVersions).toHaveProperty('find-up', '5.0.0');
  });

  describe('with PNPM catalogs', () => {
    const catalogRushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${__dirname}/repoWithCatalogs/rush.json`
    );
    const catalogShimPath: string = `${catalogRushConfiguration.defaultSubspace.getSubspaceTempFolderPath()}/pnpmfileSettings.json`;

    it('does not crash when a package in preferredVersions is referenced through a catalog', async () => {
      const subspace = catalogRushConfiguration.defaultSubspace;
      await PnpmfileConfiguration.writeCommonTempPnpmfileShimAsync(
        catalogRushConfiguration,
        subspace.getSubspaceTempFolderPath(),
        subspace,
        undefined
      );

      const shimJson: JsonObject = await JsonFile.loadAsync(catalogShimPath);
      expect(shimJson.allPreferredVersions).toEqual({
        typescript: '~5.8.2',
        tslib: '~2.3.1',
        eslint: '~9.37.0',
        // Not comparable as SemVer ranges, so the explicitly preferred versions win
        'aliased-dep': '^1.0.0',
        'git-dep': 'git+https://github.com/example/git-dep.git'
      });
    });

    it('narrows the dependency ranges of external packages to the catalog versions', async () => {
      const pnpmfileConfiguration: PnpmfileConfiguration = await PnpmfileConfiguration.initializeAsync(
        catalogRushConfiguration,
        catalogRushConfiguration.defaultSubspace,
        undefined
      );

      const transformed: IPackageJson = pnpmfileConfiguration.transform({
        name: 'some-external-package',
        version: '1.0.0',
        dependencies: {
          typescript: '^5.0.0',
          tslib: '^2.0.0',
          eslint: '^9.0.0'
        }
      });
      expect(transformed.dependencies).toEqual({
        typescript: '~5.8.2',
        tslib: '~2.3.1',
        eslint: '~9.37.0'
      });
    });
  });
});
