// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { Rush } from '@microsoft/rush-lib';
import { DaemonClient } from '@rushstack/rush-client-core';
import { RUSHD_GRAPH_SNAPSHOT, type IDaemonGraphSnapshotPayload } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  resolveDaemonPaths,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

interface IResult {
  readonly code: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

describe('native build through the standalone client', () => {
  let folder: string;
  let environment: NodeJS.ProcessEnv;
  let paths: IDaemonPaths;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-native-'));
    environment = {
      ...process.env, RUSH_DAEMON: '1', RUSH_REPORTER: 'legacy', CI: 'false', TF_BUILD: 'false',
      GITHUB_ACTIONS: 'false', XDG_RUNTIME_DIR: folder
    };
    const write = (name: string, text: string): void => {
      const filename: string = path.join(folder, name);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, text);
    };
    write('rush.json', JSON.stringify({
      rushVersion: Rush.version, npmVersion: '10.0.0',
      daemon: { enabled: true, autoStart: true, idleTimeoutSeconds: 30 },
      projectFolderMinDepth: 1,
      projects: ['a', 'b'].map((name) => ({ packageName: name, projectFolder: name }))
    }));
    write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\nruns.txt\nrushd*/\n');
    write('common/temp/last-link.flag', '{}');
    write('common/config/rush/npm-shrinkwrap.json', '{"lockfileVersion":3,"packages":{}}');
    write('common/config/rush/command-line.json', JSON.stringify({
      phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
      commands: [{
        commandKind: 'phased', name: 'build', phases: ['_phase:compile'],
        incremental: true, enableParallelism: true
      }]
    }));
    for (const name of ['a', 'b']) {
      write(`${name}/package.json`, JSON.stringify({
        name, version: '1.0.0',
        scripts: { '_phase:compile': 'node build.cjs', build: 'node -e "console.log(\'rushx-only\')"' },
        dependencies: name === 'b' ? { a: '1.0.0' } : {}
      }));
      write(`${name}/input.txt`, 'one');
      write(`${name}/build.cjs`,
        "const fs=require('node:fs');const name=require('./package.json').name;" +
        "const value=fs.readFileSync('input.txt','utf8');" +
        "fs.appendFileSync('../runs.txt',name+':'+value+'\\n');console.log('built-'+name+'-'+value);"
      );
    }
    execFileSync('git', ['init', '--quiet'], { cwd: folder });
    execFileSync('git', ['add', '.'], { cwd: folder });
    execFileSync('git', [
      '-c', 'user.name=Client Test', '-c', 'user.email=client@example.invalid',
      'commit', '--quiet', '-m', 'fixture'
    ], { cwd: folder });
    paths = resolveDaemonPaths(
      { platform: process.platform, env: environment, tmpdir: os.tmpdir(), uid: process.getuid?.() },
      computeDaemonWorkspaceKey({ canonicalRepoRoot: fs.realpathSync(folder), rushVersion: Rush.version })
    );
  });

  afterEach(async () => {
    if (fs.existsSync(paths.lockfilePath)) await invokeAsync(['daemon', 'stop']);
    const deadline: number = Date.now() + 5000;
    while (fs.existsSync(paths.lockfilePath) && Date.now() < deadline) await delayAsync(20);
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    fs.rmSync(folder, { recursive: true });
  });

  async function invokeAsync(argv: ReadonlyArray<string>, rushx: boolean = false): Promise<IResult> {
    const entry: string = path.resolve(__dirname, rushx ? '../../bin/rushx-client' : '../../bin/rush-client');
    const child = spawn(process.execPath, [entry, ...argv], {
      cwd: rushx ? path.join(folder, 'b') : folder, env: environment, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout: string = '';
    let stderr: string = '';
    child.stdout.on('data', (bytes: Buffer) => { stdout += bytes.toString(); });
    child.stderr.on('data', (bytes: Buffer) => { stderr += bytes.toString(); });
    const [code] = await once(child, 'close');
    return { code: typeof code === 'number' ? code : undefined, stdout, stderr };
  }

  it('executes selected scripts, reuses warm state, and never confuses rushx build with rush build', async () => {
    const argv: string[] = ['build', '--to', 'b', '--verbose'];
    const first: IResult = await invokeAsync(argv);
    expect(first.code).toBe(0);
    expect(first.stderr).not.toMatch(/using in-process/i);
    expect(first.stdout).toContain('built-a-one');
    expect(first.stdout).toContain('built-b-one');
    expect(first.stdout).toContain('==[');
    const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: paths.socketPath });
    const firstPid: number | undefined = (await client.status).pid;
    await client.closeAsync();
    expect((await invokeAsync(argv)).code).toBe(0);
    expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');
    const native: IResult = await invokeAsync(['--no-daemon', ...argv]);
    expect(native.code).toBe(0);
    expect(native.stderr).not.toContain('Another Rush command');
    const beforeChange: string = fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8');
    fs.writeFileSync(path.join(folder, 'a/input.txt'), 'two');
    expect((await invokeAsync(argv)).code).toBe(0);
    expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe(`${beforeChange}a:two\nb:one\n`);
    const status = await invokeAsync(['daemon', 'status']);
    expect(JSON.parse(status.stdout).pid).toBe(firstPid);
    const script: IResult = await invokeAsync(['build'], true);
    expect(script.code).toBe(0);
    expect(script.stderr).not.toMatch(/using in-process/i);
    expect(script.stdout).toContain('rushx-only');
    expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe(`${beforeChange}a:two\nb:one\n`);
  }, 30000);

  it('provides presentation-free graph commands through the real standalone native daemon', async () => {
    environment.RUSH_DAEMON_EXPERIMENTAL = '0';
    const disabled = await invokeAsync(['daemon', 'graph', 'show']);
    expect(disabled.code).toBe(1);
    expect(JSON.parse(disabled.stdout)).toMatchObject({ kind: 'graphError' });
    expect(disabled.stderr).toBe('');
    expect(fs.existsSync(paths.lockfilePath)).toBe(false);
    environment.RUSH_DAEMON_EXPERIMENTAL = '1';
    expect((await invokeAsync(['daemon', 'start'])).code).toBe(0);

    const snapshotAsync = async (...args: string[]): Promise<IDaemonGraphSnapshotPayload['snapshot']> => {
      const result = await invokeAsync(['daemon', 'graph', ...args]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).not.toContain('\u001b');
      const records = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({ type: 'extension', payload: { name: RUSHD_GRAPH_SNAPSHOT } });
      expect(records[1]).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
      return records[0].payload.data.snapshot;
    };
    expect(await snapshotAsync('show')).toMatchObject({ initialized: false });
    expect(fs.existsSync(path.join(folder, 'runs.txt'))).toBe(false);
    expect((await invokeAsync(['daemon', 'graph', 'watch'])).code).toBe(1);
    expect((await invokeAsync(['build', '--to', 'b', '--parallelism', '3'])).code).toBe(0);
    expect(await snapshotAsync('scope-out', '--project', 'a')).toMatchObject({
      operations: [{ enabled: false }, { enabled: false }]
    });
    expect(await snapshotAsync('scope-in', '--operation', 'b (compile)')).toMatchObject({
      operations: [{ enabled: true }, { enabled: true, dependencyIds: ['a (compile)'] }]
    });
    expect(await snapshotAsync('pause')).toMatchObject({ pauseNextIteration: true });
    expect(await snapshotAsync('invalidate', '--project', 'a')).toMatchObject({
      hasScheduledIteration: false, operations: [{ status: 'READY' }, { status: 'SUCCESS' }]
    });
    expect(await snapshotAsync('resume')).toMatchObject({ pauseNextIteration: false });
    expect(await snapshotAsync('status')).toMatchObject({ initialized: true });
    for (const args of [['invalid'], ['scope-out', '--project', 'missing'], ['pause', 'invalid']]) {
      const result = await invokeAsync(['daemon', 'graph', ...args]);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'requestRejected' });
    }
    expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\n');

    const entry: string = path.resolve(__dirname, '../../bin/rush-client');
    const watch = spawn(process.execPath, [entry, 'daemon', 'graph', 'watch'], {
      cwd: folder, env: environment, stdio: ['ignore', 'pipe', 'pipe']
    });
    const closed = once(watch, 'close');
    let output: string = '';
    let errors: string = '';
    watch.stderr.on('data', (bytes: Buffer) => { errors += bytes.toString(); });
    const ready = new Promise<void>((resolve) => {
      watch.stdout.on('data', (bytes: Buffer) => {
        output += bytes.toString();
        if (output.includes('\n')) resolve();
      });
    });
    try {
      await ready;
      expect(await snapshotAsync('scope-out', '--project', 'a')).toMatchObject({
        operations: [{ enabled: false }, { enabled: false }]
      });
      watch.kill('SIGINT');
      expect((await closed)[0]).toBe(130);
      expect(errors).toBe('');
      const records = output.trim().split('\n').map((line) => JSON.parse(line));
      expect(records[0]).toMatchObject({ type: 'extension', payload: { name: RUSHD_GRAPH_SNAPSHOT } });
      expect(records.at(-1)).toMatchObject({ kind: 'requestResult', payload: { outcome: 'aborted', exitCode: 130 } });
    } finally {
      if (watch.exitCode === null) watch.kill('SIGTERM');
      await closed;
    }
  }, 30000);
});
