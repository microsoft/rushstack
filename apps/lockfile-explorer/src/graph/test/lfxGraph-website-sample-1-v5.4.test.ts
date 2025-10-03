// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxWorkspace } from '../../../build/lfx-shared';

import * as graphTestHelpers from './graphTestHelpers';

export const workspace: IJsonLfxWorkspace = {
  workspaceRootFullPath: '/repo',
  pnpmLockfilePath: 'common/temp/pnpm-lock.yaml',
  pnpmLockfileFolder: 'common/temp',
  pnpmfilePath: 'common/temp/.pnpmfile.cjs',
  rushConfig: {
    rushVersion: '5.83.3',
    subspaceName: '',
    rushPnpmfilePath: 'common/config/.pnpmfile.cjs'
  }
};

describe('lfxGraph-website-sample-1-v5.4', () => {
  it('loads a workspace', async () => {
    const serializedYaml: string = await graphTestHelpers.loadAndSerializeLfxGraphAsync({
      lockfilePathUnderFixtures: '/website-sample-1/pnpm-lock-v5.4-rush.yaml',
      workspace: workspace
    });
    expect(serializedYaml).toMatchSnapshot();
  });
});
