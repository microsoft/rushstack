// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PosixModeBits } from '../PosixModeBits';
import { getStatisticsAsync } from './getStatisticsAsync';
import { wrapExceptionAsync } from './wrapExceptionAsync';

/**
 * An async version of {@link FileSystem.changePosixModeBits}.
 */
export async function getPosixModeBitsAsync(path: string): Promise<PosixModeBits> {
  return await wrapExceptionAsync(async () => {
    return (await getStatisticsAsync(path)).mode;
  });
}
