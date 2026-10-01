// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { DaemonClientError } from '@rushstack/rush-client-core';
import { computeDaemonWorkspaceKey, resolveDaemonPathsFromProcess } from '@rushstack/rush-daemon-transport';

import { getDaemonConnectionOptions, getDaemonConnectionOptionsAsync } from '../daemonConnectionOptions';

function captureErrorWithRuntimeDir(base: string, action: () => void): unknown {
  const previous: string | undefined = process.env.RUSHD_RUNTIME_DIR;
  process.env.RUSHD_RUNTIME_DIR = base;
  try {
    action();
  } catch (error) {
    return error;
  } finally {
    if (previous === undefined) delete process.env.RUSHD_RUNTIME_DIR;
    else process.env.RUSHD_RUNTIME_DIR = previous;
  }
}

describe('version-selected daemon connection options', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-connection-'));
    fs.writeFileSync(
      path.join(repoRoot, 'rush.json'),
      JSON.stringify({ rushVersion: Rush.version, suppressNodeLtsWarning: true })
    );
  });
  afterEach(() => fs.rmSync(repoRoot, { recursive: true }));

  it('uses the same native filesystem identity as the daemon host', async () => {
    const nativeRoot: string = await fs.promises.realpath(repoRoot);
    const options = getDaemonConnectionOptions(repoRoot, Rush.version, process.env, true);
    expect(options.paths).toEqual(
      resolveDaemonPathsFromProcess(
        computeDaemonWorkspaceKey({
          canonicalRepoRoot: nativeRoot,
          rushVersion: Rush.version
        })
      )
    );
    expect(options.startCommand?.cwd).toBe(nativeRoot);
  });

  it('creates an attested async launcher without changing current synchronous callers', async () => {
    const synchronous = getDaemonConnectionOptions(repoRoot, Rush.version, process.env, true);
    const asynchronous = await getDaemonConnectionOptionsAsync(repoRoot, Rush.version, process.env, true);
    expect(asynchronous.paths).toEqual(synchronous.paths);
    expect(asynchronous.expectedDaemonVersion).toBe(synchronous.expectedDaemonVersion);
    expect(asynchronous.startCommand).toBeUndefined();
    expect((await asynchronous.resolveStartCommandAsync?.())?.args).toEqual(synchronous.startCommand?.args);
  });

  it('does not claim a different requested engine in the synchronous default launcher', () => {
    expect(() => getDaemonConnectionOptions(repoRoot, '5.178.1', {}, true)).toThrow(
      'asynchronous version selection'
    );
  });

  (process.platform === 'win32' ? it.skip : it)(
    'refuses an unsafe runtime folder before any daemon command uses it',
    () => {
      const base: string =
        process.platform === 'darwin'
          ? path.join('/tmp', `rushd-runtime-${process.pid}-${Date.now()}`)
          : path.join(path.dirname(repoRoot), `rd-${process.pid.toString(36)}`);
      try {
        fs.rmSync(base, { recursive: true, force: true });
        fs.mkdirSync(base);
        fs.symlinkSync(repoRoot, path.join(base, `rushd-${process.getuid?.()}`));
        const error: unknown = captureErrorWithRuntimeDir(base, () =>
          getDaemonConnectionOptions(repoRoot, Rush.version, process.env, false)
        );
        expect(error).toBeInstanceOf(DaemonClientError);
        expect(error).toMatchObject({ code: 'startupFailed' });
        expect((error as Error).message).toContain('is unsafe: it is a symbolic link');
      } finally {
        fs.rmSync(base, { recursive: true, force: true });
      }
    }
  );

  (process.platform === 'win32' ? it.skip : it)(
    'refuses a RUSHD_RUNTIME_DIR too long for a socket path before any daemon command uses it',
    () => {
      // Too long on every platform: the base alone is longer than a socket address allows.
      const base: string = path.join(repoRoot, 'r'.repeat(80));
      const error: unknown = captureErrorWithRuntimeDir(base, () =>
        getDaemonConnectionOptions(repoRoot, Rush.version, process.env, true)
      );
      expect(error).toBeInstanceOf(DaemonClientError);
      expect(error).toMatchObject({ code: 'startupFailed' });
      expect((error as Error).message).toMatch(
        /^The daemon socket path .*\.sock is \d+ bytes long, but this platform allows at most 10[48]\. Set RUSHD_RUNTIME_DIR to an absolute path of at most \d+ bytes, or unset it\.$/
      );
      expect(fs.existsSync(base)).toBe(false);
    }
  );

  it('does not select or install a launcher for a connect-only invocation', async () => {
    const options = await getDaemonConnectionOptionsAsync(repoRoot, '5.178.1', {}, false);
    expect(options.startCommand).toBeUndefined();
    expect(options.expectedDaemonVersion).toBeUndefined();
  });
});
