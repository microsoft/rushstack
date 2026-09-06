// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { Rush } from '@microsoft/rush-lib';
import { RushDaemonHost } from '@rushstack/rush-daemon';

import { getDaemonConnectionOptions } from '../daemonConnectionOptions';

interface IInvocationResult {
  readonly code: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

describe('standalone rushx fallback', () => {
  let folder: string;
  let project: string;
  let host: RushDaemonHost | undefined;

  beforeEach(() => {
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
    host = undefined;
    await closingHost?.closeAsync();
    fs.rmSync(folder, { recursive: true });
  });

  async function invokeAsync(
    client: boolean,
    optIn: boolean,
    fakeTty: boolean = false,
    managementArgs?: ReadonlyArray<string>
  ): Promise<IInvocationResult> {
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
        GITHUB_ACTIONS: 'false'
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
    const [code] = await once(child, 'close');
    return { code: code ?? undefined, stdout, stderr };
  }

  it('preserves native project-script output and exit code for --no-daemon', async () => {
    const native: IInvocationResult = await invokeAsync(false, false);
    expect(native.code).toBe(7);
    expect(await invokeAsync(true, true)).toEqual(native);
  }, 15000);

  it('falls back after the actual standalone host rejects an unsupported request', async () => {
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
    expect(client.stderr).toContain('using in-process Rush');
    expect(client.stderr).toContain(native.stderr);
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
      expect(status).not.toHaveProperty('pid');
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
  }, 15000);

  it('rejects stop/restart until the host has negotiated lifecycle controls', async () => {
    for (const verb of ['stop', 'restart']) {
      const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', verb]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('requires negotiated host lifecycle controls');
    }
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
    const result: IInvocationResult = await invokeAsync(true, false, false, ['daemon', 'start']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('no version-selected daemon launcher');
  });

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
