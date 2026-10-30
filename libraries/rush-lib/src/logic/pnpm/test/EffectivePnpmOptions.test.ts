// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { TestUtilities } from '@rushstack/heft-config-file';

import { RushConfiguration } from '../../../api/RushConfiguration';
import type { Subspace } from '../../../api/Subspace';
import {
  getCommonPnpmConfigFilePath,
  getEffectivePnpmCatalogs,
  getEffectivePnpmOptions,
  getOtherSubspacesSharingPnpmConfig,
  type IEffectivePnpmOptions,
  mergePnpmCatalogs,
  type PnpmCatalogs
} from '../EffectivePnpmOptions';

const COMMON_CATALOGS_REPO_RUSH_JSON: string = path.resolve(
  __dirname,
  '../../test/repoWithSubspacesCommonCatalogs/rush.json'
);
const SUBSPACE_CATALOGS_REPO_RUSH_JSON: string = path.resolve(
  __dirname,
  '../../test/repoWithSubspacesCatalogs/rush.json'
);
const NO_SUBSPACES_CATALOGS_REPO_RUSH_JSON: string = path.resolve(
  __dirname,
  '../../../api/test/repoCatalogs/rush.json'
);
const NO_CATALOGS_REPO_RUSH_JSON: string = path.resolve(__dirname, '../../../api/test/repo/rush-pnpm.json');
const NPM_REPO_RUSH_JSON: string = path.resolve(__dirname, '../../../api/test/repo/rush-npm.json');

function getSubspaceNames(subspaces: readonly Subspace[]): string[] {
  return subspaces.map((subspace: Subspace) => subspace.subspaceName).sort();
}

describe('EffectivePnpmOptions', () => {
  describe(getEffectivePnpmOptions.name, () => {
    it('uses common/config/rush/pnpm-config.json when subspaces are disabled', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        NO_SUBSPACES_CATALOGS_REPO_RUSH_JSON
      );
      const subspace: Subspace = rushConfiguration.defaultSubspace;

      const effective: IEffectivePnpmOptions = getEffectivePnpmOptions(subspace, rushConfiguration);
      expect(effective.isFallback).toBe(false);
      expect(effective.pnpmOptions).toBe(subspace.getPnpmOptions());
      expect(effective.pnpmConfigFilePath).toEqual(subspace.getPnpmConfigFilePath());
      expect(effective.pnpmConfigFilePath).toEqual(getCommonPnpmConfigFilePath(rushConfiguration));
      expect(effective.pnpmOptions.globalCatalogs).toEqual(rushConfiguration.pnpmOptions.globalCatalogs);
    });

    it("uses the subspace's own pnpm-config.json when it exists", () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        SUBSPACE_CATALOGS_REPO_RUSH_JSON
      );
      const subspace: Subspace = rushConfiguration.getSubspace('project-change-analyzer-test-subspace');

      const effective: IEffectivePnpmOptions = getEffectivePnpmOptions(subspace, rushConfiguration);
      expect(effective.isFallback).toBe(false);
      expect(effective.pnpmOptions).toBe(subspace.getPnpmOptions());
      expect(effective.pnpmConfigFilePath).toEqual(subspace.getPnpmConfigFilePath());
      expect(effective.pnpmConfigFilePath).not.toEqual(getCommonPnpmConfigFilePath(rushConfiguration));
      expect(TestUtilities.stripAnnotations(effective.pnpmOptions.globalCatalogs)).toEqual({
        default: { foo: '~2.0.0', bar: '^3.0.0' },
        tools: { typescript: '~5.3.0', eslint: '^8.50.0' }
      });
    });

    it('falls back to common/config/rush/pnpm-config.json for a subspace without its own pnpm-config.json', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        COMMON_CATALOGS_REPO_RUSH_JSON
      );

      for (const subspaceName of ['default', 'other-subspace']) {
        const subspace: Subspace = rushConfiguration.getSubspace(subspaceName);
        expect(subspace.getPnpmOptions()).toBeUndefined();

        const effective: IEffectivePnpmOptions = getEffectivePnpmOptions(subspace, rushConfiguration);
        expect(effective.isFallback).toBe(true);
        expect(effective.pnpmOptions).toBe(rushConfiguration.pnpmOptions);
        expect(effective.pnpmConfigFilePath).toEqual(getCommonPnpmConfigFilePath(rushConfiguration));
        expect(effective.pnpmConfigFilePath).not.toEqual(subspace.getPnpmConfigFilePath());
      }

      const ownConfigSubspace: Subspace = rushConfiguration.getSubspace('own-config-subspace');
      const ownEffective: IEffectivePnpmOptions = getEffectivePnpmOptions(
        ownConfigSubspace,
        rushConfiguration
      );
      expect(ownEffective.isFallback).toBe(false);
      expect(ownEffective.pnpmOptions).toBe(ownConfigSubspace.getPnpmOptions());
      expect(ownEffective.pnpmConfigFilePath).toEqual(ownConfigSubspace.getPnpmConfigFilePath());
    });
  });

  describe(getEffectivePnpmCatalogs.name, () => {
    it('returns the common catalogs for subspaces without their own pnpm-config.json', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        COMMON_CATALOGS_REPO_RUSH_JSON
      );
      const expectedCatalogs: PnpmCatalogs = {
        default: { react: '^18.0.0', foo: '~2.0.0' },
        tools: { typescript: '~5.3.0' }
      };

      const getCatalogs = (subspaceName: string): PnpmCatalogs | undefined =>
        TestUtilities.stripAnnotations(
          getEffectivePnpmCatalogs(rushConfiguration.getSubspace(subspaceName), rushConfiguration)
        );

      expect(getCatalogs('default')).toEqual(expectedCatalogs);
      expect(getCatalogs('other-subspace')).toEqual(expectedCatalogs);
      expect(getCatalogs('own-config-subspace')).toEqual({ default: { react: '^17.0.0' } });
    });

    it('returns undefined when no catalogs are defined', () => {
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(NO_CATALOGS_REPO_RUSH_JSON);
      expect(getEffectivePnpmCatalogs(rushConfiguration.defaultSubspace, rushConfiguration)).toBeUndefined();
    });

    it('returns undefined when the package manager is not PNPM', () => {
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(NPM_REPO_RUSH_JSON);
      expect(getEffectivePnpmCatalogs(rushConfiguration.defaultSubspace, rushConfiguration)).toBeUndefined();
    });
  });

  describe(getOtherSubspacesSharingPnpmConfig.name, () => {
    it('returns the other subspaces that fall back to the common pnpm-config.json', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        COMMON_CATALOGS_REPO_RUSH_JSON
      );

      expect(
        getSubspaceNames(
          getOtherSubspacesSharingPnpmConfig(rushConfiguration.getSubspace('default'), rushConfiguration)
        )
      ).toEqual(['other-subspace']);
      expect(
        getSubspaceNames(
          getOtherSubspacesSharingPnpmConfig(
            rushConfiguration.getSubspace('other-subspace'),
            rushConfiguration
          )
        )
      ).toEqual(['default']);
      expect(
        getOtherSubspacesSharingPnpmConfig(
          rushConfiguration.getSubspace('own-config-subspace'),
          rushConfiguration
        )
      ).toEqual([]);
    });

    it('returns an empty array when every subspace has its own pnpm-config.json', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        SUBSPACE_CATALOGS_REPO_RUSH_JSON
      );
      for (const subspace of rushConfiguration.subspaces) {
        expect(getOtherSubspacesSharingPnpmConfig(subspace, rushConfiguration)).toEqual([]);
      }
    });

    it('returns an empty array when subspaces are disabled', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        NO_SUBSPACES_CATALOGS_REPO_RUSH_JSON
      );
      expect(
        getOtherSubspacesSharingPnpmConfig(rushConfiguration.defaultSubspace, rushConfiguration)
      ).toEqual([]);
    });
  });

  describe(mergePnpmCatalogs.name, () => {
    it('adds and updates entries without removing any', () => {
      const existingCatalogs: PnpmCatalogs = {
        default: { react: '^18.0.0', foo: '~2.0.0' },
        tools: { typescript: '~5.3.0' }
      };
      const catalogsToAdd: PnpmCatalogs = {
        default: { react: '^18.3.0' },
        lint: { eslint: '^9.0.0' }
      };

      expect(mergePnpmCatalogs(existingCatalogs, catalogsToAdd)).toEqual({
        default: { react: '^18.3.0', foo: '~2.0.0' },
        tools: { typescript: '~5.3.0' },
        lint: { eslint: '^9.0.0' }
      });

      // The inputs are not modified
      expect(existingCatalogs).toEqual({
        default: { react: '^18.0.0', foo: '~2.0.0' },
        tools: { typescript: '~5.3.0' }
      });
      expect(catalogsToAdd).toEqual({ default: { react: '^18.3.0' }, lint: { eslint: '^9.0.0' } });
    });

    it('handles undefined inputs', () => {
      const catalogs: PnpmCatalogs = { default: { react: '^18.0.0' } };
      expect(mergePnpmCatalogs(undefined, undefined)).toBeUndefined();
      expect(mergePnpmCatalogs(undefined, {})).toBeUndefined();
      expect(mergePnpmCatalogs(catalogs, undefined)).toEqual(catalogs);
      expect(mergePnpmCatalogs(undefined, catalogs)).toEqual(catalogs);
    });

    it('does not copy the configuration file annotations of loaded catalogs', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        COMMON_CATALOGS_REPO_RUSH_JSON
      );
      const loadedCatalogs: PnpmCatalogs | undefined = rushConfiguration.pnpmOptions.globalCatalogs;
      expect(Object.getOwnPropertySymbols(loadedCatalogs!.default)).not.toHaveLength(0);

      const mergedCatalogs: PnpmCatalogs | undefined = mergePnpmCatalogs(loadedCatalogs, {
        default: { react: '^18.3.0' }
      });
      expect(mergedCatalogs).toEqual({
        default: { react: '^18.3.0', foo: '~2.0.0' },
        tools: { typescript: '~5.3.0' }
      });
    });
  });
});
