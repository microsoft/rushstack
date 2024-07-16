// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../../api/RushConfiguration';
import type { Subspace } from '../../../api/Subspace';
import { PnpmfileConfiguration } from '../PnpmfileConfiguration';
import { JsonFile, JsonObject } from '@rushstack/node-core-library';
import { RushConstants } from '../../RushConstants';
import { before } from 'node:test';

describe(PnpmfileConfiguration.name, () => {
  const repoPath: string = `${__dirname}/repo`;
  const rushFilename: string = `${repoPath}/rush3.json`;
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
  const shimPath: string = `${rushConfiguration.defaultSubspace.getSubspaceTempFolder()}/pnpmfileSettings.json`;

  beforeAll(async () => {
    const subspace = rushConfiguration.defaultSubspace;
    await PnpmfileConfiguration.writeCommonTempPnpmfileShimAsync(
      rushConfiguration,
      subspace.getSubspaceTempFolder(),
      subspace
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
