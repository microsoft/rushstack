// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** How the Node process of {@link runThenRequireSymlinkedPackage} ended. */
export interface IRequireAfterScriptResult {
  /** The exit code, or undefined when a signal ended the process. */
  readonly status: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs `script`, the body of an async function, in a Node process of its own, and then requires a package that is
 * installed as pnpm installs it, as Rush does when it runs in-process: the package finds its dependency only from
 * its real path. The process writes `found` to stdout when the dependency resolved, or else the error's code.
 * @remarks Jest resolves modules itself, so only such a process shows whether a stat that the script made breaks
 * `require()`. Node's `fs.realpathSync()` stops at a directory that it has cached when the last stat without
 * `{ bigint: true }` found a FIFO or a socket, and then returns a path whose symlinks it did not resolve.
 * The script reads the strings that follow the script's path on the command line from `args`.
 */
export function runThenRequireSymlinkedPackage(
  folder: string,
  script: string,
  args: ReadonlyArray<string>
): IRequireAfterScriptResult {
  const store: string = path.join(folder, 'store', 'node_modules');
  fs.mkdirSync(path.join(store, 'symlinked-package-dependency'), { recursive: true });
  fs.writeFileSync(path.join(store, 'symlinked-package-dependency', 'index.js'), "module.exports = 'found';");
  fs.mkdirSync(path.join(store, 'symlinked-package'));
  fs.writeFileSync(
    path.join(store, 'symlinked-package', 'index.js'),
    "module.exports = require('symlinked-package-dependency');"
  );
  fs.mkdirSync(path.join(folder, 'app', 'node_modules'), { recursive: true });
  fs.symlinkSync(
    path.join(store, 'symlinked-package'),
    path.join(folder, 'app', 'node_modules', 'symlinked-package')
  );
  // The script runs from the folder, so that Node has cached the folder's path as one without symlinks.
  fs.writeFileSync(
    path.join(folder, 'main.js'),
    'const args = process.argv.slice(2);\n' +
      `(async () => {\n${script}\n})().then(() => {\n` +
      "  try { process.stdout.write(require('./app/node_modules/symlinked-package')); }\n" +
      '  catch (error) { process.stdout.write(error.code); }\n' +
      '});\n'
  );
  const child: SpawnSyncReturns<string> = spawnSync(
    process.execPath,
    [path.join(folder, 'main.js'), ...args],
    {
      cwd: folder,
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: undefined, NODE_PRESERVE_SYMLINKS: undefined },
      timeout: 20000
    }
  );
  return { status: child.status ?? undefined, stdout: child.stdout, stderr: child.stderr };
}
