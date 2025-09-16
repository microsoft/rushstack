// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxWorkspace } from '../../../build/lfx-shared';

import * as graphTestHelpers from './graphTestHelpers';

export const workspace: IJsonLfxWorkspace = {
  workspaceRootFullPath: '/repo',
  pnpmLockfilePath: 'common/temp/pnpm-lock.yaml',
  pnpmLockfileFolder: 'common/temp',
  rushConfig: {
    rushVersion: '5.158.1',
    subspaceName: ''
  }
};

describe('lfxGraph-website-sample-1-v6.0', () => {
  it('loads a workspace', async () => {
    const serializedYaml: string = await graphTestHelpers.loadAndSerializeLFxGraphAsync({
      lockfilePathUnderFixtures: '/website-sample-1/pnpm-lock-v6.0-rush.yaml',
      workspace: workspace
    });
    expect(serializedYaml).toMatchSnapshot();
  });
});
