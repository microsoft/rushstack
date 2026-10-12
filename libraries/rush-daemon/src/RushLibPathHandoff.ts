// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

/**
 * Returns the daemon's own `_RUSH_LIB_PATH` value for the rush-lib at `entryPoint`.
 *
 * @remarks
 * When rush-lib loads, it may spell its entry point through a `node_modules` link, so that plugins can
 * resolve it by name (for example in a `rush deploy` output). That spelling is kept whenever it names the
 * same file as `entryPoint`. Anything else, such as a foreign client's engine, is replaced by `entryPoint`.
 */
export function getRushLibPathHandoff(entryPoint: string, currentValue: string | undefined): string {
  if (currentValue === undefined || currentValue === entryPoint) {
    return entryPoint;
  }
  const realEntryPoint: string | undefined = tryGetRealPath(entryPoint);
  return realEntryPoint !== undefined && tryGetRealPath(currentValue) === realEntryPoint
    ? currentValue
    : entryPoint;
}

function tryGetRealPath(filePath: string): string | undefined {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return undefined;
  }
}
