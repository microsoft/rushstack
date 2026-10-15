// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as path from 'node:path';

import type { IPackageJson } from '@rushstack/node-core-library';

import { RushConfiguration } from '../RushConfiguration';
import { Subspace } from '../Subspace';

describe(Subspace.name, () => {
  describe('getPnpmCatalogsHash', () => {
    it('returns undefined when no catalogs are defined', () => {
      const rushJsonFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm.json');
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const catalogsHash: string | undefined = defaultSubspace.getPnpmCatalogsHash();
      expect(catalogsHash).toBeUndefined();
    });

    it('returns undefined for non-pnpm package manager', () => {
      const rushJsonFilename: string = path.resolve(__dirname, 'repo', 'rush-npm.json');
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const catalogsHash: string | undefined = defaultSubspace.getPnpmCatalogsHash();
      expect(catalogsHash).toBeUndefined();
    });

    it('computes hash when catalogs are defined', () => {
      const rushJsonFilename: string = path.resolve(__dirname, 'repoCatalogs', 'rush.json');
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const catalogsHash: string | undefined = defaultSubspace.getPnpmCatalogsHash();
      expect(catalogsHash).toBeDefined();
      expect(typeof catalogsHash).toBe('string');
      expect(catalogsHash).toHaveLength(40); // SHA1 hash is 40 characters
    });

    it('computes consistent hash for same catalog data', () => {
      const rushJsonFilename: string = path.resolve(__dirname, 'repoCatalogs', 'rush.json');
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const hash1: string | undefined = defaultSubspace.getPnpmCatalogsHash();
      const hash2: string | undefined = defaultSubspace.getPnpmCatalogsHash();

      expect(hash1).toBeDefined();
      expect(hash1).toBe(hash2);
    });

    it('computes different hashes for different catalog data', () => {
      // Configuration without catalogs
      const rushJsonWithoutCatalogs: string = path.resolve(__dirname, 'repo', 'rush-pnpm.json');
      const rushConfigWithoutCatalogs: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonWithoutCatalogs);
      const subspaceWithoutCatalogs: Subspace = rushConfigWithoutCatalogs.defaultSubspace;

      // Configuration with catalogs
      const rushJsonWithCatalogs: string = path.resolve(__dirname, 'repoCatalogs', 'rush.json');
      const rushConfigWithCatalogs: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonWithCatalogs);
      const subspaceWithCatalogs: Subspace = rushConfigWithCatalogs.defaultSubspace;

      const hashWithoutCatalogs: string | undefined = subspaceWithoutCatalogs.getPnpmCatalogsHash();
      const hashWithCatalogs: string | undefined = subspaceWithCatalogs.getPnpmCatalogsHash();

      // One should be undefined (no catalogs) and one should have a hash
      expect(hashWithoutCatalogs).toBeUndefined();
      expect(hashWithCatalogs).toBeDefined();
    });

    it('hashes the common catalogs when a subspace has no pnpm-config.json of its own', () => {
      const rushJsonFilename: string = path.resolve(
        __dirname,
        '../../logic/test/repoWithSubspacesCommonCatalogs/rush.json'
      );
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);

      // This must match the catalogs that install writes to the generated pnpm-workspace.yaml
      const expectedHash: string = crypto
        .createHash('sha1')
        .update(JSON.stringify(rushConfiguration.pnpmOptions.globalCatalogs))
        .digest('hex');

      expect(rushConfiguration.getSubspace('default').getPnpmCatalogsHash()).toEqual(expectedHash);
      expect(rushConfiguration.getSubspace('other-subspace').getPnpmCatalogsHash()).toEqual(expectedHash);

      // A subspace with its own pnpm-config.json uses its own catalogs
      const ownConfigHash: string | undefined = rushConfiguration
        .getSubspace('own-config-subspace')
        .getPnpmCatalogsHash();
      expect(ownConfigHash).toEqual(
        crypto
          .createHash('sha1')
          .update(JSON.stringify({ default: { react: '^17.0.0' } }))
          .digest('hex')
      );
    });
  });

  describe(Subspace.prototype.getPackageJsonInjectedDependenciesHash.name, () => {
    it('returns undefined when no injected dependencies exist', () => {
      const rushJsonFilename: string = `${__dirname}/repo/rush-pnpm.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const hash: string | undefined = defaultSubspace.getPackageJsonInjectedDependenciesHash();
      expect(hash).toBeUndefined();
    });

    it('computes a hash when injected dependencies exist', () => {
      const rushJsonFilename: string = `${__dirname}/repoInjectedDeps/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const hash: string | undefined = defaultSubspace.getPackageJsonInjectedDependenciesHash();
      expect(hash).toMatchSnapshot();
    });

    it('does not change when devDependencies of the injected package change', () => {
      const rushJsonFilename: string = `${__dirname}/repoInjectedDeps/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const hashBefore: string | undefined = defaultSubspace.getPackageJsonInjectedDependenciesHash();

      // Mutate devDependencies of the injected provider package
      const providerProject = rushConfiguration.getProjectByName('provider')!;
      providerProject.packageJson.devDependencies = {
        ...providerProject.packageJson.devDependencies,
        jest: '^29.0.0'
      };

      const hashAfter: string | undefined = defaultSubspace.getPackageJsonInjectedDependenciesHash();

      expect(hashBefore).toBeDefined();
      expect(hashAfter).toBeDefined();
      expect(hashBefore).toBe(hashAfter);
    });

    it('changes when production dependencies of the injected package change', () => {
      const rushJsonFilename: string = `${__dirname}/repoInjectedDeps/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      const defaultSubspace: Subspace = rushConfiguration.defaultSubspace;

      const hashBefore: string | undefined = defaultSubspace.getPackageJsonInjectedDependenciesHash();

      // Mutate dependencies of the injected provider package
      const providerProject = rushConfiguration.getProjectByName('provider')!;
      providerProject.packageJson.dependencies = {
        ...providerProject.packageJson.dependencies,
        axios: '^1.6.0'
      };

      const hashAfter: string | undefined = defaultSubspace.getPackageJsonInjectedDependenciesHash();

      expect(hashBefore).toBeDefined();
      expect(hashAfter).toBeDefined();
      expect(hashBefore).not.toBe(hashAfter);
    });

    describe('with catalog references in injected projects from other subspaces', () => {
      // The "catalog-consumer" project in "consumer-subspace" injects the "catalog-provider" project from the
      // default subspace, which depends on "transitive-provider". Both providers reference the default
      // subspace's catalogs.
      const injectedSubspaceCatalogsRushJson: string = path.resolve(
        __dirname,
        '../../logic/pnpm/test/repoWithInjectedSubspaceCatalogs/rush.json'
      );

      it('hashes the catalog versions instead of the catalog references', () => {
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          injectedSubspaceCatalogsRushJson
        );
        const consumerSubspace: Subspace = rushConfiguration.getSubspace('consumer-subspace');

        const hashBefore: string | undefined = consumerSubspace.getPackageJsonInjectedDependenciesHash();

        // Replace the catalog references with the versions from the default subspace's catalogs
        const providerPackageJson: IPackageJson =
          rushConfiguration.getProjectByName('catalog-provider')!.packageJson;
        providerPackageJson.dependencies = {
          ...providerPackageJson.dependencies,
          lodash: '^4.17.21',
          semver: '~7.5.4'
        };
        providerPackageJson.optionalDependencies = { fsevents: '~2.3.2' };
        providerPackageJson.peerDependencies = { typescript: '~5.3.0' };
        rushConfiguration.getProjectByName('transitive-provider')!.packageJson.dependencies = {
          lodash: '^4.17.21'
        };

        const hashAfter: string | undefined = consumerSubspace.getPackageJsonInjectedDependenciesHash();

        expect(hashBefore).toBeDefined();
        expect(hashAfter).toBe(hashBefore);
      });

      it("changes when an entry in the injected project's subspace catalog changes", () => {
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          injectedSubspaceCatalogsRushJson
        );
        const consumerSubspace: Subspace = rushConfiguration.getSubspace('consumer-subspace');

        const hashBefore: string | undefined = consumerSubspace.getPackageJsonInjectedDependenciesHash();

        rushConfiguration.pnpmOptions.globalCatalogs!.default.semver = '~7.6.0';

        const hashAfter: string | undefined = consumerSubspace.getPackageJsonInjectedDependenciesHash();

        expect(hashBefore).toBeDefined();
        expect(hashAfter).toBeDefined();
        expect(hashAfter).not.toBe(hashBefore);
      });

      it("does not change when the consuming subspace's own catalog changes", () => {
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          injectedSubspaceCatalogsRushJson
        );
        const consumerSubspace: Subspace = rushConfiguration.getSubspace('consumer-subspace');

        const hashBefore: string | undefined = consumerSubspace.getPackageJsonInjectedDependenciesHash();

        consumerSubspace.getPnpmOptions()!.globalCatalogs!.default.semver = '^6.1.0';

        const hashAfter: string | undefined = consumerSubspace.getPackageJsonInjectedDependenciesHash();

        expect(hashBefore).toBeDefined();
        expect(hashAfter).toBe(hashBefore);
      });
    });
  });
});
