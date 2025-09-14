// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxWorkspace } from '../../../temp/lfx-shared';

import * as graphTestHelpers from './graphTestHelpers';

export const workspace: IJsonLfxWorkspace = {
  workspaceRootFolder: '/repo',
  pnpmLockfilePath: 'common/temp/pnpm-lock.yaml',
  rushConfig: {
    rushVersion: '5.83.3',
    subspaceName: ''
  }
};

describe('lfxGraphLoader 5.4', () => {
  it('loads a workspace', async () => {
    const serializedYaml: string = await graphTestHelpers.loadAndSerializeLFxGraph({
      lockfilePathUnderFixtures: '/website-sample-1/pnpm-lock-rush-5.4.yaml',
      workspace: workspace
    });
    expect(serializedYaml).toMatchSnapshot();
  });
});
