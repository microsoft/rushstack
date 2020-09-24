// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { RigConfig } from '../RigConfig';

const testProjectFolder: string = path.join(__dirname, 'test-project');

function isSameFilePath(path1: string, path2: string): boolean {
  return path.relative(path1, path2) === '';
}

describe('RigConfig tests', () => {
  it('loads a rig.json file', () => {
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder(testProjectFolder);
    expect(rigConfig.enabled).toBe(true);
    expect(isSameFilePath(rigConfig.filePath, path.join(testProjectFolder, 'config/rig.json'))).toBe(true);
    expect(rigConfig.profile).toBe('web-app');
    expect(rigConfig.rigPackageName).toBe('example-rig');
  });
  it('handles a missing rig.json file', () => {
    const rigConfig: RigConfig = RigConfig.loadForProjectFolder(__dirname);
    expect(rigConfig.enabled).toBe(false);
    expect(rigConfig.filePath).toBe('');
    expect(rigConfig.profile).toBeUndefined();
    expect(rigConfig.rigPackageName).toBe('');
  });
});
