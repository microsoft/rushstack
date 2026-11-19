// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { unlinkIfPresent } from '../DaemonUnlink';

const PACKAGE_NAME: string = 'linked-package';
const DEPENDENCY_NAME: string = 'linked-dependency';
const INDEX_NAME: string = 'index.js';
const MAIN_NAME: string = 'main.js';
const NODE_MODULES: string = 'node_modules';
const SOCKET_NAME: string = 's.sock';
const PUBLISHED_NAME: string = 'p.sock';
const FOLDER_PREFIX: string = 'rushd-linked-';
// Short, as a socket path must be (104 bytes on macOS).
const POSIX_TEMP_FOLDER: string = '/tmp';
const CHILD_TIMEOUT_MS: number = 10000;
const UTF8: BufferEncoding = 'utf8';

/** How a Node process of its own exited, and what it printed. */
export interface IChildOutcome {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Creates a folder in which `node_modules/linked-package` is a symbolic link into a store, as pnpm installs
 * packages. The package finds its dependency only from its real path.
 */
export function createLinkedPackageFolder(): string {
  const folder: string = fs.mkdtempSync(path.join(POSIX_TEMP_FOLDER, FOLDER_PREFIX));
  const store: string = path.join(folder, 'store', NODE_MODULES);
  fs.mkdirSync(path.join(store, DEPENDENCY_NAME), { recursive: true });
  fs.writeFileSync(path.join(store, DEPENDENCY_NAME, INDEX_NAME), "module.exports = 'found';");
  fs.mkdirSync(path.join(store, PACKAGE_NAME));
  fs.writeFileSync(path.join(store, PACKAGE_NAME, INDEX_NAME), `module.exports = require('${DEPENDENCY_NAME}');`);
  fs.mkdirSync(path.join(folder, NODE_MODULES));
  fs.symlinkSync(path.join(store, PACKAGE_NAME), path.join(folder, NODE_MODULES, PACKAGE_NAME));
  return folder;
}

function createMain(call: string): string {
  return [
    "const fs = require('node:fs');",
    "const net = require('node:net');",
    'const [modulePath, socketPath, publishedPath] = process.argv.slice(2);',
    'const target = require(modulePath);',
    "const out = (value) => process.stdout.write(String(value) + ' ');",
    'const server = net.createServer().listen(socketPath, async () => {',
    `  ${call}`,
    `  try { process.stdout.write(require('${PACKAGE_NAME}')); } catch (error) { process.stdout.write(error.code); }`,
    '  server.close();',
    '});'
  ].join('\n');
}

/**
 * Runs `call` in a Node process of its own while a socket listens at `socketPath`, then requires the linked
 * package and prints what it exports, or the error's code. `call` is JavaScript that can use `target` (the module
 * at `modulePath`), `socketPath`, `publishedPath` (a free name), `fs`, `net` and `out` (which prints a value). The
 * main module is in `folder`, so the loader has already cached that path as one without links.
 */
export function runThenRequireLinkedPackage(folder: string, modulePath: string, call: string): IChildOutcome {
  fs.writeFileSync(path.join(folder, MAIN_NAME), createMain(call));
  const socketPaths: string[] = [SOCKET_NAME, PUBLISHED_NAME].map((name: string) => path.join(folder, name));
  const child: SpawnSyncReturns<string> = spawnSync(process.execPath, [MAIN_NAME, modulePath, ...socketPaths], {
    cwd: folder,
    encoding: UTF8,
    env: { ...process.env, NODE_OPTIONS: undefined, NODE_PRESERVE_SYMLINKS: undefined },
    timeout: CHILD_TIMEOUT_MS
  });
  return { status: child.status, stdout: child.stdout, stderr: child.stderr };
}

/**
 * Deletes a folder from {@link createLinkedPackageFolder}. Its sockets are unlinked first: `fs.rmSync` would stat
 * them, and this process's own later `require()` calls could then fail as the child's would.
 */
export function removeLinkedPackageFolder(folder: string): void {
  for (const name of [SOCKET_NAME, PUBLISHED_NAME]) unlinkIfPresent(path.join(folder, name));
  fs.rmSync(folder, { recursive: true, force: true });
}
