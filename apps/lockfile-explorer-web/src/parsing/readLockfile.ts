// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LockfileEntry } from './LfxGraph';
import * as lfxGraphLoader from './lfxGraphLoader';

const serviceUrl: string = window.appContext.serviceUrl;

export async function readLockfileAsync(): Promise<LockfileEntry[]> {
  const response = await fetch(`${serviceUrl}/api/lockfile`);
  const lockfile: { doc: lfxGraphLoader.ILockfilePackageType; subspaceName: string } = await response.json();

  return lfxGraphLoader.generateLockfileGraph(lockfile.doc, lockfile.subspaceName).entries;
}
