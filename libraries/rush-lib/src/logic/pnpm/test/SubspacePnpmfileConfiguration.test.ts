// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../../api/RushConfiguration';
import { SubspacePnpmfileConfiguration } from '../SubspacePnpmfileConfiguration';
import { JsonFile, type JsonObject } from '@rushstack/node-core-library';

describe(SubspacePnpmfileConfiguration.name, () => {
  const repoPath: string = `${__dirname}/repo-with-subspace`;
  const rushFilename: string = `${repoPath}/rush.json`;
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
  const shimPath: string = `${rushConfiguration.defaultSubspace.getSubspaceTempFolderPath()}/pnpmfileSettings.json`;

  beforeAll(async () => {
    const subspace = rushConfiguration.defaultSubspace;
    await SubspacePnpmfileConfiguration.writeCommonTempSubspaceGlobalPnpmfileAsync(
      rushConfiguration,
      subspace,
      undefined
    );
  });

  it('should use the smallest-available SemVer range (preferredVersions)', async () => {
    const shimJson: JsonObject = await JsonFile.loadAsync(shimPath);
    expect(shimJson.allPreferredVersions).toHaveProperty('@rushstack/terminal', '0.19.2');
  });

  it('should record allPreferredVersions in pnpmfileSettings.json', async () => {
    const shimJson: JsonObject = await JsonFile.loadAsync(shimPath);
    expect(shimJson.allPreferredVersions).toHaveProperty('@rushstack/terminal', '0.19.2');
  });

  it('should record allowedAlternativeVersions in pnpmfileSettings.json', async () => {
    const shimJson: JsonObject = await JsonFile.loadAsync(shimPath);
    const allowedAlternativeVersions = shimJson.allowedAlternativeVersions as
      | Record<string, readonly string[]>
      | undefined;
    expect(allowedAlternativeVersions).toBeDefined();
    expect(allowedAlternativeVersions).toHaveProperty('foo', ['1.0.0']);
  });
});
