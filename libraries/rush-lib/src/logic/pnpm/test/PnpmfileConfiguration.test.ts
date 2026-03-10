// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../../api/RushConfiguration.ts';
import { PnpmfileConfiguration } from '../PnpmfileConfiguration.ts';
import { JsonFile, type JsonObject } from '@rushstack/node-core-library';

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
});
