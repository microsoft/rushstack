// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Rush } from '@microsoft/rush-lib';
import { RushDaemonHost } from '@rushstack/rush-daemon';

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
    fakeTty: boolean = false
  ): Promise<IInvocationResult> {
    const entry: string = client
      ? path.resolve(__dirname, '../../bin/rushx-client')
      : path.resolve(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rushx');
    const args: string[] = fakeTty
      ? [
          '-e',
          `Object.defineProperty(process.stdin, 'isTTY', { value: true }); process.argv = [process.execPath, ${JSON.stringify(entry)}, 'sample']; require(${JSON.stringify(entry)});`
        ]
      : [entry, ...(client ? ['--no-daemon'] : []), 'sample'];
    const child: ChildProcess = spawn(process.execPath, args, {
      cwd: project,
      env: {
        ...process.env,
        CLIENT_MARKER: 'script-output',
        RUSH_DAEMON: optIn ? '1' : '0',
        CI: 'false',
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
});
