// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../../api/RushConfiguration';
import type { IPnpmfileContext, ISubspacePnpmfileShimSettings } from '../IPnpmfile';
import { hooks, reset } from '../SubspaceGlobalPnpmfileShim';
import { SubspacePnpmfileConfiguration } from '../SubspacePnpmfileConfiguration';

// The "catalog-consumer" project in "consumer-subspace" injects the "catalog-provider" project from the
// default subspace, which depends on "transitive-provider" from the default subspace. The default subspace
// uses the catalogs from common/config/rush/pnpm-config.json, and "consumer-subspace" and
// "unrelated-subspace" have their own catalogs.
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

      // The versions come from the default subspace's catalogs, not from the catalogs of "consumer-subspace"
      expect(pkg.dependencies).toEqual({
        'left-pad': '^1.3.0',
        lodash: '^4.17.21',
        semver: '~7.5.4',
        'transitive-provider': 'file:../transitive-provider'
      });
      expect(pkg.optionalDependencies).toEqual({ fsevents: '~2.3.2' });
      expect(pkg.peerDependencies).toEqual({ typescript: '~5.3.0' });
      // PNPM does not install the devDependencies of an injected package
      expect(pkg.devDependencies).toEqual({ jest: 'catalog:' });
    });

    it('resolves catalog references of a transitively injected project', () => {
      const pkg: IPackageJson = readPackage(getPackageJson('transitive-provider'));
      expect(pkg.dependencies).toEqual({ lodash: '^4.17.21' });
    });

    it("does not change the catalog references of the subspace's own projects", () => {
      const pkg: IPackageJson = readPackage(getPackageJson('catalog-consumer'));
      expect(pkg.dependencies).toEqual({
        lodash: 'catalog:',
        'catalog-provider': 'file:../catalog-provider'
      });
    });

    it('does not change packages that are not Rush projects', () => {
      const pkg: IPackageJson = readPackage({
        name: 'external',
        version: '1.0.0',
        dependencies: { lodash: 'catalog:' }
      });
      expect(pkg.dependencies).toEqual({ lodash: 'catalog:' });
    });

    it('reports an error when the catalog does not have an entry for the dependency', () => {
      const pkg: IPackageJson = getPackageJson('catalog-provider');
      pkg.dependencies!['missing-package'] = 'catalog:';
      expect(() => readPackage(pkg)).toThrow(
        'The "catalog-provider" project from the "default" subspace is installed as an external package, and it depends on "missing-package@catalog:". Rush resolves that reference using the "globalCatalogs" from the pnpm-config.json of the "default" subspace, but the "default" catalog of that subspace does not have an entry for "missing-package".'
      );
    });

    it('reports an error when the catalog does not exist', () => {
      const pkg: IPackageJson = getPackageJson('catalog-provider');
      pkg.optionalDependencies!.fsevents = 'catalog:missing-catalog';
      expect(() => readPackage(pkg)).toThrow(
        'The "catalog-provider" project from the "default" subspace is installed as an external package, and it depends on "fsevents@catalog:missing-catalog". Rush resolves that reference using the "globalCatalogs" from the pnpm-config.json of the "default" subspace, but that subspace does not define a catalog named "missing-catalog".'
      );
    });

    it('reports an error when no catalogs are available for the subspace of the project', () => {
      expect(() => readPackage(getPackageJson('unrelated'))).toThrow(
        'The "unrelated" project from the "unrelated-subspace" subspace is installed as an external package, and it depends on "lodash@catalog:". Rush resolves that reference using the "globalCatalogs" from the pnpm-config.json of the "unrelated-subspace" subspace, but no PNPM catalogs were found for that subspace.'
      );
    });
  });
});
