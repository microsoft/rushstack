// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ILfxWorkspace } from '@rushstack/lockfile-explorer-web/lib/types/lfxProtocol';

export interface IAppState {
  lockfileExplorerProjectRoot: string;
  currentWorkingDirectory: string;
  projectRoot: string;
  pnpmLockfileLocation: string;
  pnpmfileLocation: string;
  appVersion: string;
  debugMode: boolean;
  lfxWorkspace: ILfxWorkspace;
}
