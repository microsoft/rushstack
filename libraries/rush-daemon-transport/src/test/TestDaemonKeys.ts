// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { IDaemonPaths } from '../DaemonPaths';
import { resolveDaemonPaths } from '../DaemonPaths';

const NONCE_BYTES: number = 3;
const COUNTER_STEP: number = 1;
const NO_OVERRIDES: Readonly<Record<string, string>> = {};

// Jest runs several test files in one worker and loads this module afresh for each of them, so a key made of the
// pid and a counter alone would repeat in the next file, and in a later worker that reuses the pid.
const TEST_KEY_PREFIX: string = `rushd-test-${process.pid}-${crypto.randomBytes(NONCE_BYTES).toString('hex')}-`;
let testKeyCounter: number = 0;

function resolveKeyPaths(env: Readonly<Record<string, string>>, workspaceKey: string): IDaemonPaths {
  return resolveDaemonPaths(
    { platform: process.platform, env, tmpdir: os.tmpdir(), uid: process.getuid?.() },
    workspaceKey
  );
}

/** Resolves the paths of a new workspace key of this test file, in the runtime base that `env` selects. */
export function resolveTestKeyPaths(env: Readonly<Record<string, string>>): IDaemonPaths {
  testKeyCounter += COUNTER_STEP;
  return resolveKeyPaths(env, `${TEST_KEY_PREFIX}${testKeyCounter}`);
}

function readFolderIfPresent(folder: string): string[] {
  try {
    return fs.readdirSync(folder);
  } catch {
    return [];
  }
}

/**
 * Deletes every entry that this test file's keys left in the user's shared runtime directory: records, sockets,
 * operation group records, logs and locks. Other files' and real daemons' entries are left alone.
 */
export function removeTestKeyEntries(): void {
  const folder: string = path.dirname(resolveKeyPaths(NO_OVERRIDES, TEST_KEY_PREFIX).lockfilePath);
  const names: string[] = readFolderIfPresent(folder).filter((name: string) =>
    name.startsWith(TEST_KEY_PREFIX)
  );
  for (const name of names) fs.rmSync(path.join(folder, name), { recursive: true, force: true });
}

// Each test file that makes keys loads this module, so each one cleans up after its last test, including records
// that a test keeps on purpose and those of a test that failed before its own cleanup.
afterAll(removeTestKeyEntries);
