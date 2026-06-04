// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../../api/RushConfiguration';
import { PnpmfileSettingsFile } from '../PnpmfileSettingsFile';
import type { IPnpmfileShimSettings } from '../IPnpmfile';

describe(PnpmfileSettingsFile.name, () => {
  const repoPath: string = `${__dirname}/repo-with-subspace`;
  const rushFilename: string = `${repoPath}/rush.json`;
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
  const subspace = rushConfiguration.defaultSubspace;

  it('gets common pnpmfile shim settings for a subspace', () => {
    const settings: Omit<IPnpmfileShimSettings, 'workspaceVersions'> =
      PnpmfileSettingsFile.getCommonPnpmfileShimSettings(rushConfiguration, subspace, undefined);

    // project "a" has @rushstack/terminal@~0.19.0
    // common-versions.json has @rushstack/terminal@0.19.2, which satisfies the "~0.19.0"
    // so the preferred version for @rushstack/terminal should be 0.19.2
    expect(settings.allPreferredVersions).toHaveProperty('@rushstack/terminal', '0.19.2');
  });
});
