// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DAEMON_RUNTIME_DIR_ENV_VAR,
  computeDaemonWorkspaceKey,
  resolveDaemonPaths,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

import {
  chooseTestRuntimeRoot,
  createDaemonTestRuntimeBase,
  getLongestTestSocketPath,
  getMaxTestSocketPathBytes
} from './DaemonTestRuntimeBase';

const SOCKET_PLATFORMS: readonly NodeJS.Platform[] = ['linux', 'darwin', 'freebsd'];
// Longer than any real temporary folder.
const LONGEST_TMPDIR_LENGTH: number = 300;
// As long as the temporary folder with which some of these tests used to fail.
const TMPDIR_OF_27_BYTES: string = `/${'t'.repeat(26)}`;
// Twenty two-byte characters: 21 characters, but 41 bytes, too long to keep on Linux.
const TWO_BYTE_TMPDIR: string = `/${'é'.repeat(20)}`;
// The shape of the temporary folder of a macOS user.
const DARWIN_TMPDIR: string = '/var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T';
const PRIVATE_FOLDER_MODE: number = 0o700;
const TEST_SOURCE_FOLDER: string = path.resolve(__dirname, '../../src/test');
// The helper and this file name the variable to test the helper itself.
const HELPER_FILES: ReadonlySet<string> = new Set([
  'DaemonTestRuntimeBase.ts',
  'DaemonTestRuntimeBase.test.ts'
]);
// The files whose tests start daemons, each with a runtime folder of its own.
const FILES_THAT_START_DAEMONS: readonly string[] = [
  'DaemonClosedOutput.test.ts',
  'DaemonProcessExit.test.ts',
  'DaemonShutdownProcess.test.ts',
  'SuccessfulMutationFixture.ts',
  'VersionSelectedDaemonLauncher.test.ts'
];
// The value in `RUSHD_RUNTIME_DIR: value`, `[DAEMON_RUNTIME_DIR_ENV_VAR]: value` or `.RUSHD_RUNTIME_DIR = value`.
const RUNTIME_DIR_VALUE: RegExp =
  /(?:\bRUSHD_RUNTIME_DIR\b|\[DAEMON_RUNTIME_DIR_ENV_VAR\])\s*(?::|=(?!=))\s*([^,;}\r\n]*)/g;
const RUNTIME_BASE_REFERENCE: RegExp = /^(?:this\.)?runtimeBase$/;
// A fixed path, which does not depend on TMPDIR.
const FIXED_PATH: RegExp = /^'[^']*'$/;
// The value in `runtimeBase = value` or `runtimeBase: string = value`.
const RUNTIME_BASE_VALUE: RegExp = /\bruntimeBase(?:\s*:\s*string)?\s*=(?!=)\s*([^;\r\n]*)/g;

function createTmpdir(bytes: number): string {
  return `/${'t'.repeat(bytes - 1)}`;
}

function getValues(source: string, pattern: RegExp): string[] {
  return Array.from(source.matchAll(pattern), (match: RegExpMatchArray) => match[1].trim());
}

function listTypeScriptFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry: fs.Dirent) => {
    const entryPath: string = path.join(folder, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('runtime base folders for test daemons', () => {
  it.each(SOCKET_PLATFORMS)(
    'keep the longest socket path within the limit on %s, however long TMPDIR is',
    (platform: NodeJS.Platform) => {
      const maxBytes: number = getMaxTestSocketPathBytes(platform);
      const tooLong: string[] = [];
      for (let length: number = 1; length <= LONGEST_TMPDIR_LENGTH; length++) {
        // One byte per character, and two.
        for (const tmpdir of [createTmpdir(length), `/${'é'.repeat(length - 1)}`]) {
          const root: string = chooseTestRuntimeRoot(tmpdir, platform);
          const socketPath: string = getLongestTestSocketPath(root, platform);
          if (Buffer.byteLength(socketPath) > maxBytes) tooLong.push(socketPath);
        }
      }
      expect(tooLong).toEqual([]);
    }
  );

  it('leaves one byte of sun_path for its terminating NUL', () => {
    expect(getMaxTestSocketPathBytes('linux')).toBe(107);
    expect(getMaxTestSocketPathBytes('darwin')).toBe(103);
  });

  it.each(SOCKET_PLATFORMS)('keeps a short temporary folder on %s', (platform: NodeJS.Platform) => {
    expect(chooseTestRuntimeRoot(TMPDIR_OF_27_BYTES, platform)).toBe(TMPDIR_OF_27_BYTES);
  });

  it('uses /tmp instead of a temporary folder that is too long', () => {
    expect(chooseTestRuntimeRoot(DARWIN_TMPDIR, 'darwin')).toBe('/tmp');
    expect(chooseTestRuntimeRoot(createTmpdir(LONGEST_TMPDIR_LENGTH), 'linux')).toBe('/tmp');
  });

  it('counts bytes, not characters', () => {
    expect(chooseTestRuntimeRoot(TWO_BYTE_TMPDIR, 'linux')).toBe('/tmp');
  });

  it('keeps any temporary folder on Windows, where daemons listen at named pipes', () => {
    const tmpdir: string = `C:\\${'t'.repeat(LONGEST_TMPDIR_LENGTH)}`;
    expect(chooseTestRuntimeRoot(tmpdir, 'win32')).toBe(tmpdir);
  });

  it('creates an empty private folder in which the socket path of a daemon stays within the limit', () => {
    const base: string = createDaemonTestRuntimeBase();
    try {
      const root: string = path.dirname(base);
      expect(root).toBe(chooseTestRuntimeRoot(path.resolve(os.tmpdir()), process.platform));
      expect(fs.readdirSync(base)).toEqual([]);
      // Windows has no POSIX file modes, and its daemons listen at named pipes.
      if (process.platform === 'win32') return;
      // The permission bits are the mode's last three octal digits.
      expect(fs.statSync(base).mode % 0o1000).toBe(PRIVATE_FOLDER_MODE);
      const uid: number | undefined = process.getuid?.();
      const paths: IDaemonPaths = resolveDaemonPaths(
        {
          platform: process.platform,
          env: { [DAEMON_RUNTIME_DIR_ENV_VAR]: base },
          tmpdir: os.tmpdir(),
          uid
        },
        computeDaemonWorkspaceKey({ canonicalRepoRoot: base, rushVersion: '0.0.0' })
      );
      expect(paths.runtimeDir).toBe(path.join(base, `rushd-${uid}`));
      const bytes: number = Buffer.byteLength(paths.socketPath);
      expect(bytes).toBeLessThanOrEqual(Buffer.byteLength(getLongestTestSocketPath(root, process.platform)));
      expect(bytes).toBeLessThanOrEqual(getMaxTestSocketPathBytes(process.platform));
    } finally {
      fs.rmdirSync(base);
    }
  });

  it('is where every test that starts a daemon puts its runtime folder', () => {
    const filesWithBase: string[] = [];
    const unguarded: string[] = [];
    for (const file of listTypeScriptFiles(TEST_SOURCE_FOLDER)) {
      const name: string = path.relative(TEST_SOURCE_FOLDER, file);
      if (HELPER_FILES.has(name)) continue;
      const source: string = fs.readFileSync(file, 'utf8');
      const runtimeDirs: string[] = getValues(source, RUNTIME_DIR_VALUE);
      for (const runtimeDir of runtimeDirs) {
        if (!RUNTIME_BASE_REFERENCE.test(runtimeDir) && !FIXED_PATH.test(runtimeDir)) {
          unguarded.push(`${name}: RUSHD_RUNTIME_DIR is ${runtimeDir}`);
        }
      }
      if (!runtimeDirs.some((runtimeDir: string) => RUNTIME_BASE_REFERENCE.test(runtimeDir))) continue;
      filesWithBase.push(name);
      const bases: string[] = getValues(source, RUNTIME_BASE_VALUE);
      if (bases.length === 0) unguarded.push(`${name}: runtimeBase is never set`);
      for (const base of bases) {
        if (base !== 'createDaemonTestRuntimeBase()') unguarded.push(`${name}: runtimeBase is ${base}`);
      }
    }
    expect(filesWithBase).toEqual(expect.arrayContaining(FILES_THAT_START_DAEMONS));
    expect(unguarded).toEqual([]);
  });
});
