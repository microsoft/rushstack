// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { SuccessfulMutationFixture } from '@rushstack/rush-daemon/lib/test/SuccessfulMutationFixture';
import { computeDaemonWorkspaceKey, resolveDaemonPaths } from '@rushstack/rush-daemon-transport';

interface IClientResult {
  readonly exitCode: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

async function invokeAsync(
  fixture: SuccessfulMutationFixture,
  argv: ReadonlyArray<string>
): Promise<IClientResult> {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../../bin/rush-client'), ...argv], {
    cwd: fixture.repoRoot,
    env: { ...fixture.environment, RUSH_DAEMON: '1', RUSH_REPORTER: 'legacy' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout: string = '';
  let stderr: string = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  const [exitCode] = await once(child, 'close');
  return { exitCode: exitCode ?? undefined, stdout, stderr };
}

describe('native mutations through the standalone CLI and default daemon', () => {
  it.each(['install', 'update'] as const)('runs %s without fallback or administrative replay', async (command) => {
    const fixture: SuccessfulMutationFixture = await SuccessfulMutationFixture.createAsync();
    fixture.paths = resolveDaemonPaths(
      { platform: process.platform, env: fixture.environment, tmpdir: os.tmpdir(), uid: process.getuid?.() },
      computeDaemonWorkspaceKey({ canonicalRepoRoot: fs.realpathSync.native(fixture.repoRoot), rushVersion: Rush.version })
    );
    try {
      expect(await fixture.runWorkerAsync('update')).toMatchObject({ exitCode: 0 });
      const started: IClientResult = await invokeAsync(fixture, ['daemon', 'start']);
      expect(started.exitCode).toBe(0);
      fixture.initialPid = JSON.parse(started.stdout).pid;
      expect(fixture.initialPid).toEqual(expect.any(Number));
      expect(await invokeAsync(fixture, ['build', '--to', '@mutation/app', '--parallelism', '3']))
        .toMatchObject({ exitCode: 0 });
      expect(fixture.readAppOutput()).toBe('provider-one-installed:before');
      const lockfile: string = path.join(fixture.repoRoot, 'common/config/rush/pnpm-lock.yaml');
      const previousLockfile: string = fs.readFileSync(lockfile, 'utf8');
      if (command === 'update') fixture.selectSecondProvider();
      else fixture.removeInstalledAppDependency();

      const mutation: IClientResult = await invokeAsync(fixture, [command, '--bypass-policy', '--offline']);
      expect(mutation.exitCode).toBe(0);
      expect(mutation.stderr).not.toMatch(/using in-process/i);
      expect(mutation.stdout).toContain(`Found pnpm version ${fixture.pnpmVersion}`);
      const successor = await fixture.waitForSuccessorAsync();
      expect(successor.pid).not.toBe(fixture.initialPid);
      const status: IClientResult = await invokeAsync(fixture, ['daemon', 'status']);
      expect(status.exitCode).toBe(0);
      expect(JSON.parse(status.stdout).pid).toBe(successor.pid);
      const currentLockfile: string = fs.readFileSync(lockfile, 'utf8');
      if (command === 'install') expect(currentLockfile).toBe(previousLockfile);
      else expect(currentLockfile).not.toBe(previousLockfile);

      const rebuilt: IClientResult = await invokeAsync(fixture, ['rebuild', '--to', '@mutation/app', '--parallelism', '3']);
      expect(rebuilt.exitCode).toBe(0);
      expect(rebuilt.stderr).not.toMatch(/using in-process/i);
      expect(fixture.readAppOutput()).toBe(`${command === 'install' ? 'provider-one' : 'provider-two'}-installed:before`);
      expect(fs.readFileSync(lockfile, 'utf8')).toBe(currentLockfile);
      expect(JSON.parse((await invokeAsync(fixture, ['daemon', 'status'])).stdout).pid).toBe(successor.pid);
    } finally {
      await fixture[Symbol.asyncDispose]();
    }
  }, 120_000);
});
