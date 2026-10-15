// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../../api/RushConfiguration';
import type { ISubspacePnpmfileShimSettings } from '../IPnpmfile';
import { SubspacePnpmfileConfiguration } from '../SubspacePnpmfileConfiguration';

// "catalog-consumer" (consumer-subspace) injects "catalog-provider" (default). Each subspace has its own catalogs.
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

      // Not consumer-subspace's own catalogs, nor those of unrelated-subspace, which has no injected projects
      expect(settings.catalogsBySubspaceName).toEqual({
        default: rushConfiguration.pnpmOptions.globalCatalogs
      });
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
