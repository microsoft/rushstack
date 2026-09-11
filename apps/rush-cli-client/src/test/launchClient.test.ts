// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { Rush } from '@microsoft/rush-lib';
import { DaemonClient, connectOrStartDaemonAsync, getDaemonLogFilePath } from '@rushstack/rush-client-core';
import { RushDaemonHost, WorkspaceSession } from '@rushstack/rush-daemon';
import {
  removeTestFolderAsync,
  waitForTestProcessExitAsync
} from '@rushstack/rush-daemon/lib/test/TestProcessExit';
import { captureTestDaemonListenerAsync } from '@rushstack/rush-daemon/lib/test/TestDaemonListener';
import { readDaemonLockfile } from '@rushstack/rush-daemon-transport';

import { getDaemonConnectionOptions } from '../daemonConnectionOptions';

interface IInvocationResult {
  readonly code: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

describe('standalone rushx fallback', () => {
  let folder: string;
  let project: string;
  let logFilePath: string;
  let host: RushDaemonHost | undefined;
  let invocationClosures: Promise<unknown>[];
  let daemonPids: Set<number>;

  beforeEach(() => {
    invocationClosures = [];
    daemonPids = new Set();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-cli-client-'));
    project = path.join(folder, 'project');
    fs.mkdirSync(project);
    fs.mkdirSync(path.join(folder, 'common/config/rush'), { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'rush.json'),
      JSON.stringify({
        rushVersion: Rush.version,
        pnpmVersion: '10.27.0',
        daemon: { enabled: false, autoStart: false },
        projects: [{ packageName: 'sample', projectFolder: 'project' }],
        projectFolderMinDepth: 1
      })
    );
    logFilePath = getDaemonLogFilePath(getDaemonConnectionOptions(folder, Rush.version, {}, false).paths);
    fs.writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({
        name: 'sample',
        version: '1.0.0',
        scripts: {
          sample:
            'node -e "process.stdout.write(process.env.CLIENT_MARKER); process.stderr.write(\'script-error\'); process.exitCode=7;"'
        }
      })
    );
  });

  afterEach(async () => {
    const closingHost: RushDaemonHost | undefined = host;
    const closingFolder: string = folder;
    const closingLogFilePath: string = logFilePath;
    const closingDaemonPids: Set<number> = daemonPids;
    host = undefined;
    await Promise.all(invocationClosures);
    await closingHost?.closeAsync();
    await Promise.all(Array.from(closingDaemonPids, (pid) => waitForTestProcessExitAsync(pid)));
    await removeTestFolderAsync(closingLogFilePath, true);
    await removeTestFolderAsync(closingFolder);
  });

  async function invokeAsync(
    client: boolean,
    optIn: boolean,
    fakeTty: boolean = false,
    managementArgs?: ReadonlyArray<string>,
    environmentOverrides: NodeJS.ProcessEnv = {}
  ): Promise<IInvocationResult> {
    const invocationDaemonPids: Set<number> = daemonPids;
    const entry: string = client
      ? path.resolve(__dirname, managementArgs ? '../../bin/rush-client' : '../../bin/rushx-client')
      : path.resolve(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rushx');
    const args: string[] = fakeTty
      ? [
          '-e',
          `Object.defineProperty(process.stdin, 'isTTY', { value: true }); process.argv = [process.execPath, ${JSON.stringify(entry)}, 'sample']; require(${JSON.stringify(entry)});`
        ]
      : [entry, ...(managementArgs ?? [...(client ? ['--no-daemon'] : []), 'sample'])];
    const child: ChildProcess = spawn(process.execPath, args, {
      cwd: project,
      env: {
        ...process.env,
        CLIENT_MARKER: 'script-output',
        RUSH_DAEMON: optIn ? '1' : '0',
        CI: managementArgs ? 'true' : 'false',
        TF_BUILD: 'false',
        GITHUB_ACTIONS: 'false',
        ...environmentOverrides
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout: string = '';
    let stderr: string = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const closed: Promise<unknown[]> = once(child, 'close');
    invocationClosures.push(closed);
    const [code] = await closed;
    if (
      code === 0 &&
      managementArgs?.[0] === 'daemon' &&
      (managementArgs[1] === 'start' || managementArgs[1] === 'restart')
    ) {
      const { pid }: { pid: unknown } = JSON.parse(stdout);
      if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) {
        throw new Error('The started fixture daemon did not report a valid PID.');
      }
      if (pid !== process.pid) invocationDaemonPids.add(pid);
    }
    return { code: typeof code === 'number' ? code : undefined, stdout, stderr };
  }

  it('preserves native project-script output and exit code for --no-daemon', async () => {
    const native: IInvocationResult = await invokeAsync(false, false);
    expect(native.code).toBe(7);
    expect(await invokeAsync(true, true)).toEqual(native);
  }, 15000);

  it('keeps unknown interactive scripts on the native path even when a daemon is running', async () => {
    const daemonPackage: { version: string } = require('@rushstack/rush-daemon/package.json');
    host = await RushDaemonHost.startAsync({
      repoRoot: folder,
      rushVersion: Rush.version,
      daemonVersion: daemonPackage.version
    });
    const native: IInvocationResult = await invokeAsync(false, false);
    const client: IInvocationResult = await invokeAsync(true, true, true);
    expect(client.code).toBe(native.code);
    expect(client.stdout).toBe(native.stdout);
    expect(client).toEqual(native);
  }, 15000);

  it('starts idempotently and reports real readiness in CI without execution opt-in', async () => {
    const daemonPackage: { version: string } = require('@rushstack/rush-daemon/package.json');
    host = await RushDaemonHost.startAsync({
      repoRoot: folder,
      rushVersion: Rush.version,
      daemonVersion: daemonPackage.version
    });
    for (const verb of ['start', 'start', 'status']) {
      const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', verb]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      const status: Record<string, unknown> = JSON.parse(result.stdout);
      expect(status).toMatchObject({
        state: 'ready',
        socketPath: host.paths.socketPath,
        daemonVersion: daemonPackage.version
      });
      expect(status.uptimeMs).toEqual(expect.any(Number));
      expect(status.pid).toBe(process.pid);
      expect(status.residentMemoryBytes).toEqual(expect.any(Number));
      expect(status).not.toHaveProperty('warmProjects');
    }
  }, 15000);

  it('status never starts an absent daemon or falls back to command execution', async () => {
    const result: IInvocationResult = await invokeAsync(true, true, false, ['daemon', 'status']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Could not connect to daemon');
    expect(result.stderr).not.toContain('using in-process');
    const { paths } = getDaemonConnectionOptions(folder, Rush.version, {}, false);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
  });

  it('starts an absent daemon that survives the client and then shuts down when idle', async () => {
    const rushJsonPath: string = path.join(folder, 'rush.json');
    const config: Record<string, unknown> = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
    fs.writeFileSync(
      rushJsonPath,
      JSON.stringify({
        ...config,
        daemon: { enabled: false, autoStart: false, idleTimeoutSeconds: 2 }
      })
    );
    const { paths } = getDaemonConnectionOptions(folder, Rush.version, {}, false);
    try {
      const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'start']);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({ state: 'ready', socketPath: paths.socketPath });
      expect(fs.existsSync(paths.lockfilePath)).toBe(true);
    } finally {
      const deadline: number = Date.now() + 7000;
      while (fs.existsSync(paths.lockfilePath) && Date.now() < deadline) await delayAsync(50);
      expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    }
    const stopped: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'status']);
    expect(stopped.code).toBe(1);
    const log: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'logs']);
    expect(log.code).toBe(0);
    expect(log.stdout).toContain('rushd ready at');
  }, 15000);

  it('reads a saved launcher log without connecting or auto-starting', async () => {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true, mode: 0o700 });
    const contents: string = `${'startup output\n'.repeat(20000)}startup error\n`;
    fs.writeFileSync(logFilePath, contents, { mode: 0o600 });
    const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'logs']);
    expect(result).toEqual({ code: 0, stdout: contents, stderr: '' });
    expect(
      fs.existsSync(getDaemonConnectionOptions(folder, Rush.version, {}, false).paths.lockfilePath)
    ).toBe(false);
  });

  it('returns an actionable missing-log error without creating a log or daemon', async () => {
    const result: IInvocationResult = await invokeAsync(true, true, false, ['daemon', 'logs']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('No launcher log exists');
    expect(result.stderr).toContain(logFilePath);
    expect(fs.existsSync(logFilePath)).toBe(false);
  });

  it('accepts an empty launcher log and rejects extra follow arguments', async () => {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(logFilePath, '', { mode: 0o600 });
    expect(await invokeAsync(true, false, false, ['daemon', 'logs'])).toEqual({
      code: 0,
      stdout: '',
      stderr: ''
    });
    expect((await invokeAsync(true, false, false, ['daemon', 'logs', '--follow', 'extra'])).code).toBe(1);
  });

  it('does not start an absent daemon when stop or restart cannot be acknowledged', async () => {
    for (const verb of ['stop', 'restart']) {
      const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', verb]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Could not connect to daemon');
    }
  });

  it.each([false, true])(
    'restarts after ownership release and stops the successor (embedded: %s)',
    async (embedded) => {
      const rushJsonPath: string = path.join(folder, 'rush.json');
      const config: Record<string, unknown> = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
      fs.writeFileSync(
        rushJsonPath,
        JSON.stringify({
          ...config,
          daemon: { enabled: false, autoStart: false, idleTimeoutSeconds: 5 }
        })
      );
      const { paths } = getDaemonConnectionOptions(folder, Rush.version, {}, false);
      try {
        if (embedded) {
          const daemonPackage: { version: string } = require('@rushstack/rush-daemon/package.json');
          host = await RushDaemonHost.startAsync({
            repoRoot: folder,
            rushVersion: Rush.version,
            daemonVersion: daemonPackage.version
          });
        } else {
          const started: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'start']);
          expect(started.code).toBe(0);
        }
        const originalLock: { startedAt: string } = JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8'));
        const restarted: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'restart']);
        expect(restarted.stderr).toBe('');
        expect(restarted.code).toBe(0);
        expect(JSON.parse(restarted.stdout)).toMatchObject({
          state: 'ready',
          pid: expect.any(Number),
          residentMemoryBytes: expect.any(Number)
        });
        const successorLock: { startedAt: string } = JSON.parse(fs.readFileSync(paths.lockfilePath, 'utf8'));
        expect(successorLock.startedAt).not.toBe(originalLock.startedAt);
        await host?.closeAsync();
        expect(fs.existsSync(paths.lockfilePath)).toBe(true);
        const stopped: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'stop']);
        expect(stopped.code).toBe(0);
        expect(JSON.parse(stopped.stdout)).toMatchObject({ state: 'shutdownAccepted' });
      } finally {
        const deadline: number = Date.now() + 7000;
        while (fs.existsSync(paths.lockfilePath) && Date.now() < deadline) await delayAsync(50);
        expect(fs.existsSync(paths.lockfilePath)).toBe(false);
      }
    },
    30000
  );

  it('bounds restart after failed workspace cleanup without deleting live ownership', async () => {
    const errors: Error[] = [];
    const cleanupFailure: Error = new Error('workspace cleanup failed');
    const { value: failedHost, listener } = await captureTestDaemonListenerAsync(() =>
      RushDaemonHost.startAsync({
        repoRoot: folder,
        rushVersion: Rush.version,
        daemonVersion: 'cleanup-failure-test',
        onError: (error) => {
          errors.push(error);
        },
        createWorkspaceSessionAsync: async (sessionOptions) =>
          WorkspaceSession.createAsync({
            ...sessionOptions,
            createComponentsAsync: async () => ({
              [Symbol.asyncDispose]: async () => {
                throw cleanupFailure;
              }
            })
          })
      })
    );
    let client: DaemonClient | undefined;
    try {
      const originalRecord: string = fs.readFileSync(failedHost.paths.lockfilePath, 'utf8');
      const previousDaemon = readDaemonLockfile(failedHost.paths.lockfilePath)!;
      client = await DaemonClient.connectAsync({ socketPath: failedHost.paths.socketPath });
      await client.shutdownAsync();
      await failedHost.closed;
      await expect(failedHost.closeAsync()).rejects.toThrow('workspace cleanup failed');
      expect(errors).toHaveLength(1);
      await expect(
        connectOrStartDaemonAsync({
          ...getDaemonConnectionOptions(folder, Rush.version, {}, true),
          previousDaemon,
          startupTimeoutMs: 40
        })
      ).rejects.toThrow('previous daemon still owns');
      expect(fs.readFileSync(failedHost.paths.lockfilePath, 'utf8')).toBe(originalRecord);
      if (process.platform !== 'win32') expect(fs.existsSync(failedHost.paths.socketPath)).toBe(true);
    } finally {
      const cleanup = await Promise.allSettled([client?.closeAsync(), failedHost.closeAsync()]);
      try {
        expect(cleanup).toEqual([
          { status: 'fulfilled', value: undefined },
          { status: 'rejected', reason: cleanupFailure }
        ]);
      } finally {
        // The only injected failure owns no live resources; release the real fixture listener last.
        await listener.closeAsync();
      }
    }
    expect(fs.existsSync(failedHost.paths.lockfilePath)).toBe(false);
    if (process.platform !== 'win32') expect(fs.existsSync(failedHost.paths.socketPath)).toBe(false);
  });

  it('rejects extra management arguments without silently ignoring them', async () => {
    const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'status', 'extra']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Usage: rush-client daemon start|status');
  });

  it('does not guess a daemon launcher for a different selected Rush version', async () => {
    const rushJsonPath: string = path.join(folder, 'rush.json');
    const config: Record<string, unknown> = JSON.parse(fs.readFileSync(rushJsonPath, 'utf8'));
    fs.writeFileSync(rushJsonPath, JSON.stringify({ ...config, rushVersion: '0.0.0' }));
    let registryRequests: number = 0;
    const registry = http.createServer((request, response) => {
      registryRequests++;
      request.resume();
      response.writeHead(404, { 'content-type': 'application/json', connection: 'close' });
      response.end(JSON.stringify({ error: 'no supported release' }));
    });
    await new Promise<void>((resolve) => registry.listen(0, '127.0.0.1', resolve));
    try {
      const address = registry.address();
      if (!address || typeof address === 'string') throw new Error('Expected a local registry address.');
      const registryUrl: string = `http://127.0.0.1:${address.port}`;
      // Native Rush subprocesses discard NPM_CONFIG_* overrides.
      fs.writeFileSync(
        path.join(folder, 'common/config/rush/.npmrc'),
        `registry=${registryUrl}\ncache=${path.join(folder, 'npm-cache')}\naudit=false\nfund=false\n`
      );
      const home: string = path.join(folder, 'home');
      fs.mkdirSync(home);
      fs.writeFileSync(path.join(home, '.npmrc'), '');
      const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'start'], {
        HOME: home,
        USERPROFILE: home,
        RUSH_GLOBAL_FOLDER: path.join(folder, 'global'),
        // Use Node's npm rather than a user-specific wrapper that depends on the real HOME.
        PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter)
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Cannot launch selected Rush 0.0.0');
      expect(result.stdout).toBe('');
      expect(registryRequests).toBeGreaterThan(0);
      expect(fs.existsSync(getDaemonConnectionOptions(folder, '0.0.0', {}, false).paths.lockfilePath)).toBe(
        false
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        registry.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }, 15000);

  it('rejects explicit startup combined with --no-daemon', async () => {
    const result: IInvocationResult = await invokeAsync(true, false, false, [
      'daemon',
      'start',
      '--no-daemon'
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--no-daemon cannot be combined with daemon start');
  });
});
