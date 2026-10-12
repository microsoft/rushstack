// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * A file system monitor hook for Git, which reports the paths that a test logs.
 */
export interface IFsmonitorHook {
  /**
   * The path of the hook, the value of Git's `core.fsmonitor` setting.
   */
  readonly hookPath: string;
  /**
   * Logs a path that changed, which the hook then reports to Git.
   */
  logChange(relativePath: string): void;
}

/**
 * Creates a file system monitor hook in the given folder. Its token is the number of paths that were logged when Git
 * queried it, and it reports every path as changed for a token that it didn't create.
 */
export function createFsmonitorHook(folderPath: string): IFsmonitorHook {
  const hookPath: string = path.join(folderPath, 'fsmonitor-hook');
  const logPath: string = path.join(folderPath, 'fsmonitor-hook.log');
  fs.writeFileSync(logPath, '');
  const script: string = [
    '#!/bin/sh',
    `log='${logPath}'`,
    `count=$(wc -l < "$log" | tr -d ' ')`,
    `printf 't:%s\\0' "$count"`,
    'case "$2" in',
    `  t:*) tail -n "+$((\${2#t:} + 1))" "$log" | tr '\\n' '\\0' ;;`,
    `  *) printf '/\\0' ;;`,
    'esac',
    ''
  ].join('\n');
  fs.writeFileSync(hookPath, script, { mode: 0o755 });
  return {
    hookPath,
    logChange: (relativePath: string) => fs.appendFileSync(logPath, `${relativePath}\n`)
  };
}
