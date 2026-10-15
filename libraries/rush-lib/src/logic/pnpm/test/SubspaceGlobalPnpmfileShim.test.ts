// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import type { IPnpmfileContext, ISubspacePnpmfileShimSettings } from '../IPnpmfile';
import { hooks, reset } from '../SubspaceGlobalPnpmfileShim';
import { SubspacePnpmfileConfiguration } from '../SubspacePnpmfileConfiguration';

// "catalog-consumer" (consumer-subspace) injects "catalog-provider" (default). Each subspace has its own catalogs.
const INJECTED_SUBSPACE_CATALOGS_RUSH_JSON: string = `${__dirname}/repoWithInjectedSubspaceCatalogs/rush.json`;

describe('SubspaceGlobalPnpmfileShim', () => {
  let rushConfiguration: RushConfiguration;
  let settings: ISubspacePnpmfileShimSettings;

  function readPackage(pkg: IPackageJson): IPackageJson {
    const context: IPnpmfileContext = {
      log: () => {},
      splitWorkspacePnpmfileShimSettings: settings
    } as IPnpmfileContext;
    return hooks.readPackage!(pkg, context);
  }

  function getPackageJson(packageName: string): IPackageJson {
    return JSON.parse(JSON.stringify(rushConfiguration.getProjectByName(packageName)!.packageJson));
  }

  beforeEach(() => {
    reset();
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(INJECTED_SUBSPACE_CATALOGS_RUSH_JSON);
    settings = SubspacePnpmfileConfiguration.getSubspacePnpmfileShimSettings(
      rushConfiguration,
      rushConfiguration.getSubspace('consumer-subspace'),
      undefined
    );
  });

  afterEach(() => {
    reset();
  });

  describe('readPackage', () => {
    it("resolves catalog references of an injected project with its own subspace's catalogs", () => {
      const pkg: IPackageJson = readPackage(getPackageJson('catalog-provider'));

      // From the default subspace's catalogs, not consumer-subspace's
      expect(pkg.dependencies).toEqual({
        'left-pad': '^1.3.0',
        lodash: '^4.17.21',
        semver: '~7.5.4',
        'transitive-provider': 'file:../transitive-provider'
      });
      expect(pkg.optionalDependencies).toEqual({ fsevents: '~2.3.2' });
      expect(pkg.peerDependencies).toEqual({ typescript: '~5.3.0' });
      // PNPM does not install the devDependencies of an external package
      expect(pkg.devDependencies).toEqual({ jest: 'catalog:' });
    });

    it("does not change the catalog references of the subspace's own projects", () => {
      const pkg: IPackageJson = readPackage(getPackageJson('catalog-consumer'));
      expect(pkg.dependencies).toEqual({
        lodash: 'catalog:',
        'catalog-provider': 'file:../catalog-provider'
      });
    });

    it('reports an error when the catalog does not have an entry for the dependency', () => {
      const pkg: IPackageJson = getPackageJson('catalog-provider');
      pkg.dependencies!['missing-package'] = 'catalog:';
      expect(() => readPackage(pkg)).toThrow(
        'The "catalog-provider" project depends on "missing-package@catalog:", but the "default" catalog of the "default" subspace has no "missing-package" entry.'
      );
    });

    it('reports an error when the catalog does not exist', () => {
      const pkg: IPackageJson = getPackageJson('catalog-provider');
      pkg.optionalDependencies!.fsevents = 'catalog:missing-catalog';
      expect(() => readPackage(pkg)).toThrow(
        'The "catalog-provider" project depends on "fsevents@catalog:missing-catalog", but the "default" subspace does not define a "missing-catalog" catalog.'
      );
    });

    it('reports an error when no catalogs are available for the subspace of the project', () => {
      expect(() => readPackage(getPackageJson('unrelated'))).toThrow(
        'The "unrelated" project depends on "lodash@catalog:", but no catalogs were found for the "unrelated-subspace" subspace.'
      );
    });
  });
});
