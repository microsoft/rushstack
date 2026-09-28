// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { DaemonClientError } from '@rushstack/rush-client-core';
import { computeDaemonWorkspaceKey, resolveDaemonPathsFromProcess } from '@rushstack/rush-daemon-transport';

import { getDaemonConnectionOptions, getDaemonConnectionOptionsAsync } from '../daemonConnectionOptions';

describe('version-selected daemon connection options', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-connection-'));
    fs.writeFileSync(path.join(repoRoot, 'rush.json'), JSON.stringify({ rushVersion: Rush.version }));
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
      const base: string = path.join(repoRoot, 'runtime');
      fs.mkdirSync(base);
      fs.symlinkSync(repoRoot, path.join(base, `rushd-${process.getuid?.()}`));
      const previous: string | undefined = process.env.RUSHD_RUNTIME_DIR;
      process.env.RUSHD_RUNTIME_DIR = base;
      let error: unknown;
      try {
        getDaemonConnectionOptions(repoRoot, Rush.version, process.env, false);
      } catch (thrown) {
        error = thrown;
      } finally {
        if (previous === undefined) delete process.env.RUSHD_RUNTIME_DIR;
        else process.env.RUSHD_RUNTIME_DIR = previous;
      }
      expect(error).toBeInstanceOf(DaemonClientError);
      expect(error).toMatchObject({ code: 'startupFailed' });
      expect((error as Error).message).toContain('is unsafe: it is a symbolic link');
    }
  );

  it('does not select or install a launcher for a connect-only invocation', async () => {
    const options = await getDaemonConnectionOptionsAsync(repoRoot, '5.178.1', {}, false);
    expect(options.startCommand).toBeUndefined();
    expect(options.expectedDaemonVersion).toBeUndefined();
  });
});
