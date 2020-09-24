// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as resolve from 'resolve';

import { ResolvedRigConfig } from '../ResolvedRigConfig';
import { RigConfig } from '../RigConfig';

const testProjectFolder: string = path.join(__dirname, 'test-project');

function expectEqualPaths(path1: string, path2: string): void {
  if (path.relative(path1, path2) !== '') {
    fail('Expected paths to be equal:\npath1: ' + path1 + '\npath2: ' + path2);
  }
}

describe('ResolvedRigConfig tests', () => {
  it('resolves a rig.json file', () => {
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder(testProjectFolder);
    expect(rigConfig.enabled).toBe(true);
    const resolvedRigConfig: ResolvedRigConfig = rigConfig.resolveRig({
      resolve: (moduleName: string, baseFolder: string): string => {
        return resolve.sync(moduleName, { basedir: baseFolder });
      }
    });

    expectEqualPaths(
      resolvedRigConfig.profileFolderPath,
      path.join(testProjectFolder, 'node_modules/example-rig/profile/web-app')
    );
  });
});
