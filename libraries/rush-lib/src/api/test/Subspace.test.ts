// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

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
  });
});
