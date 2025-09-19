// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxWorkspace } from '../../../build/lfx-shared';

import * as graphTestHelpers from './graphTestHelpers';

export const workspace: IJsonLfxWorkspace = {
  workspaceRootFullPath: '/repo',
  pnpmLockfilePath: 'pnpm-lock.yaml',
  pnpmLockfileFolder: '',
  pnpmfilePath: '.pnpmfile.cjs',
  rushConfig: undefined
};

describe('lfxGraph-edge-cases-v5.4', () => {
  it('loads a workspace', async () => {
    const serializedYaml: string = await graphTestHelpers.loadAndSerializeLFxGraphAsync({
      lockfilePathUnderFixtures: '/edge-cases/pnpm-lock-v5.4.yaml',
      workspace: workspace
    });
    expect(serializedYaml).toMatchSnapshot();
  });
});
