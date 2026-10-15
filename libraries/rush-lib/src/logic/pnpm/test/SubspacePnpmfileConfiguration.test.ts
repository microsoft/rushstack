// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../../api/RushConfiguration';
import type { ISubspacePnpmfileShimSettings } from '../IPnpmfile';
import { SubspacePnpmfileConfiguration } from '../SubspacePnpmfileConfiguration';

// The "catalog-consumer" project in "consumer-subspace" injects the "catalog-provider" project from the
// default subspace, which depends on "transitive-provider" from the default subspace. The default subspace
// uses the catalogs from common/config/rush/pnpm-config.json, and "consumer-subspace" and
// "unrelated-subspace" have their own catalogs.
const INJECTED_SUBSPACE_CATALOGS_RUSH_JSON: string = `${__dirname}/repoWithInjectedSubspaceCatalogs/rush.json`;

describe(SubspacePnpmfileConfiguration.name, () => {
  describe(SubspacePnpmfileConfiguration.getSubspacePnpmfileShimSettings.name, () => {
    it('includes the catalogs of the subspaces of injected projects from other subspaces', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        INJECTED_SUBSPACE_CATALOGS_RUSH_JSON
      );

      const settings: ISubspacePnpmfileShimSettings =
        SubspacePnpmfileConfiguration.getSubspacePnpmfileShimSettings(
          rushConfiguration,
          rushConfiguration.getSubspace('consumer-subspace'),
          undefined
        );

      // Only the default subspace's catalogs: not the consumer's own catalogs, which PNPM resolves itself,
      // and not the catalogs of "unrelated-subspace", which has no injected projects
      expect(settings.catalogsBySubspaceName).toEqual({
        default: rushConfiguration.pnpmOptions.globalCatalogs
      });

      expect(settings.subspaceProjects['catalog-consumer'].subspaceName).toEqual('consumer-subspace');
      expect(settings.subspaceProjects['catalog-consumer'].injectedDependencies).toEqual([
        'catalog-provider'
      ]);
      expect(settings.workspaceProjects['catalog-provider'].subspaceName).toEqual('default');
      expect(settings.workspaceProjects['catalog-provider'].injectedDependencies).toEqual([
        'transitive-provider'
      ]);
      expect(settings.workspaceProjects['transitive-provider'].subspaceName).toEqual('default');
      expect(settings.workspaceProjects.unrelated.subspaceName).toEqual('unrelated-subspace');
    });

    it('does not include catalogs when no projects from other subspaces are injected', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        INJECTED_SUBSPACE_CATALOGS_RUSH_JSON
      );

      for (const subspaceName of ['default', 'unrelated-subspace']) {
        const settings: ISubspacePnpmfileShimSettings =
          SubspacePnpmfileConfiguration.getSubspacePnpmfileShimSettings(
            rushConfiguration,
            rushConfiguration.getSubspace(subspaceName),
            undefined
          );
        expect(settings).not.toHaveProperty('catalogsBySubspaceName');
      }
    });

    it('does not include catalogs for injected projects from the same subspace', () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${__dirname}/../../../api/test/repoInjectedDeps/rush.json`
      );

      const settings: ISubspacePnpmfileShimSettings =
        SubspacePnpmfileConfiguration.getSubspacePnpmfileShimSettings(
          rushConfiguration,
          rushConfiguration.defaultSubspace,
          undefined
        );
      expect(settings.subspaceProjects.consumer.injectedDependencies).toEqual(['provider']);
      expect(settings).not.toHaveProperty('catalogsBySubspaceName');
    });
  });
});
