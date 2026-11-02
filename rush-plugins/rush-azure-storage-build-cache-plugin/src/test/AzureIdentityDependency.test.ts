// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { Import, JsonFile, type IPackageJson } from '@rushstack/node-core-library';
import { gte, minVersion } from 'semver';

describe('the Azure Identity dependency chain', () => {
  const identityFolder: string = Import.resolvePackage({
    packageName: '@azure/identity',
    baseFolderPath: __dirname
  });
  const identityPackageJson: IPackageJson = JsonFile.load(path.join(identityFolder, 'package.json'));

  it('requires MSAL Node 7.1.0 or newer for fresh installs', () => {
    const msalRange: string | undefined = identityPackageJson.dependencies?.['@azure/msal-node'];
    if (!msalRange) {
      throw new Error('Azure Identity does not declare its MSAL Node dependency');
    }

    expect(gte(minVersion(msalRange)!, '7.1.0')).toBe(true);
  });

  it('resolves MSAL Node 7.1.0 or newer in the lockfile', () => {
    const msalFolder: string = Import.resolvePackage({
      packageName: '@azure/msal-node',
      baseFolderPath: identityFolder
    });
    const msalPackageJson: IPackageJson = JsonFile.load(path.join(msalFolder, 'package.json'));

    expect(gte(msalPackageJson.version, '7.1.0')).toBe(true);
  });
});
