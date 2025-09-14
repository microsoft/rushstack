// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxWorkspace } from '../../build/lfx-shared';

export interface IAppState {
  lockfileExplorerProjectRoot: string;
  currentWorkingDirectory: string;
  projectRoot: string;
  pnpmLockfileLocation: string;
  pnpmfileLocation: string;
  appVersion: string;
  debugMode: boolean;
  lfxWorkspace: IJsonLfxWorkspace;
}
