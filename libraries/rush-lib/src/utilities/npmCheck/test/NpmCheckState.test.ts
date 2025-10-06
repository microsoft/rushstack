// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { INpmCheckState } from '../interfaces/INpmCheck';
import initializeState from '../NpmCheckState';

describe('NpmCheckState', () => {
  it('should create with default options', async () => {
    const state: INpmCheckState = await initializeState();
    expect(state).toBeDefined();
    expect(state.cwd).toBe(process.cwd());
    expect(state.cwdPackageJson).toHaveProperty('name');
    expect(state.cwdPackageJson).toHaveProperty('version');
  });
});
