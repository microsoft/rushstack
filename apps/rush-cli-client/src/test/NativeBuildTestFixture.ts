// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delayAsync } from 'node:timers/promises';

import { Rush } from '@microsoft/rush-lib';
import { removeTestFolderAsync } from '@rushstack/rush-daemon/lib/test/TestProcessExit';
import { RUSHD_GRAPH_SNAPSHOT, type IDaemonGraphSnapshotPayload } from '@rushstack/rush-daemon-protocol';
import {
  computeDaemonWorkspaceKey,
  resolveDaemonPaths,
  type IDaemonPaths
} from '@rushstack/rush-daemon-transport';

export interface INativeBuildResult {
  readonly code: number | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

export interface INativeBuildTestFixture {
  readonly folder: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly paths: IDaemonPaths;
  invokeAsync(argv: ReadonlyArray<string>, rushx?: boolean): Promise<INativeBuildResult>;
  snapshotAsync(...args: string[]): Promise<IDaemonGraphSnapshotPayload['snapshot']>;
  runAsync(work: (fixture: INativeBuildTestFixture) => Promise<void>): Promise<void>;
  trackWatch(child: ChildProcess, closed: Promise<unknown[]>): void;
  closeAsync(): Promise<void>;
}

export function createNativeBuildTestFixture(): INativeBuildTestFixture {
  const folder: string = fs.mkdtempSync(path.join(os.tmpdir(), 'rush-client-native-'));
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    RUSH_DAEMON: '1',
    RUSH_REPORTER: 'legacy',
    CI: 'false',
    TF_BUILD: 'false',
    GITHUB_ACTIONS: 'false',
    XDG_RUNTIME_DIR: folder
  };
  const invocationClosures: Promise<unknown[]>[] = [];
  const callbacks: Promise<void>[] = [];
  const watchers: Set<ChildProcess> = new Set();
  let acceptingInvocations: boolean = true;
  const write = (name: string, text: string): void => {
    const filename: string = path.join(folder, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, text);
  };
  write(
    'rush.json',
    JSON.stringify({
      rushVersion: Rush.version,
      npmVersion: '10.0.0',
      daemon: { enabled: true, autoStart: true, idleTimeoutSeconds: 30 },
      projectFolderMinDepth: 1,
      projects: ['a', 'b'].map((name) => ({ packageName: name, projectFolder: name }))
    })
  );
  write('.gitignore', 'common/temp/\n**/.rush/\n**/rush-logs/\n**/lib/\nruns.txt\nrushd*/\n');
  write('common/temp/last-link.flag', '{}');
  write('common/config/rush/npm-shrinkwrap.json', '{"lockfileVersion":3,"packages":{}}');
  write(
    'common/config/rush/command-line.json',
    JSON.stringify({
      phases: [{ name: '_phase:compile', dependencies: { upstream: ['_phase:compile'] } }],
      commands: [
        {
          commandKind: 'phased',
          name: 'build',
          phases: ['_phase:compile'],
          incremental: true,
          enableParallelism: true
        }
      ]
    })
  );
  for (const name of ['a', 'b']) {
    write(
      `${name}/package.json`,
      JSON.stringify({
        name,
        version: '1.0.0',
        scripts: { '_phase:compile': 'node build.cjs', build: 'node -e "console.log(\'rushx-only\')"' },
        dependencies: name === 'b' ? { a: '1.0.0' } : {}
      })
    );
    write(`${name}/input.txt`, 'one');
    write(
      `${name}/build.cjs`,
      "const fs=require('node:fs');const name=require('./package.json').name;" +
        "const value=fs.readFileSync('input.txt','utf8');" +
        "fs.appendFileSync('../runs.txt',name+':'+value+'\\n');console.log('built-'+name+'-'+value);"
    );
  }
  execFileSync('git', ['init', '--quiet'], { cwd: folder });
  execFileSync('git', ['config', '--local', 'core.autocrlf', 'false'], { cwd: folder });
  execFileSync('git', ['add', '.'], { cwd: folder });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Client Test',
      '-c',
      'user.email=client@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture'
    ],
    { cwd: folder }
  );
  const paths: IDaemonPaths = resolveDaemonPaths(
    { platform: process.platform, env: environment, tmpdir: os.tmpdir(), uid: process.getuid?.() },
    computeDaemonWorkspaceKey({
      canonicalRepoRoot: fs.realpathSync.native(folder),
      rushVersion: Rush.version
    })
  );

  function invokeAsync(argv: ReadonlyArray<string>, rushx: boolean = false): Promise<INativeBuildResult> {
    if (!acceptingInvocations) throw new Error('The native build fixture is already closing.');
    return spawnClientAsync(argv, rushx);
  }

  async function spawnClientAsync(
    argv: ReadonlyArray<string>,
    rushx: boolean = false
  ): Promise<INativeBuildResult> {
    const entry: string = path.resolve(__dirname, rushx ? '../../bin/rushx-client' : '../../bin/rush-client');
    const child = spawn(process.execPath, [entry, ...argv], {
      cwd: rushx ? path.join(folder, 'b') : folder,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout: string = '';
    let stderr: string = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (text: string) => {
      stdout += text;
    });
    child.stderr.on('data', (text: string) => {
      stderr += text;
    });
    const closed: Promise<unknown[]> = once(child, 'close');
    invocationClosures.push(closed);
    const [code] = await closed;
    return { code: typeof code === 'number' ? code : undefined, stdout, stderr };
  }

  async function snapshotAsync(...args: string[]): Promise<IDaemonGraphSnapshotPayload['snapshot']> {
    const result = await invokeAsync(['daemon', 'graph', ...args]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('\u001b');
    const records = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ type: 'extension', payload: { name: RUSHD_GRAPH_SNAPSHOT } });
    expect(records[1]).toMatchObject({ kind: 'requestResult', payload: { exitCode: 0 } });
    return records[0].payload.data.snapshot;
  }

  const fixture: INativeBuildTestFixture = {
    folder,
    environment,
    paths,
    invokeAsync,
    snapshotAsync,
    runAsync: (work) => {
      if (!acceptingInvocations) throw new Error('The native build fixture is already closing.');
      const running: Promise<void> = Promise.resolve().then(() => work(fixture));
      callbacks.push(running);
      return running;
    },
    trackWatch: (child, closed) => {
      watchers.add(child);
      child.once('close', () => watchers.delete(child));
      invocationClosures.push(closed);
      if (!acceptingInvocations) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        throw new Error('The native build fixture is already closing.');
      }
    },
    closeAsync: async () => {
      acceptingInvocations = false;
      for (const child of watchers) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      }
      // Jest owns callback failures. Drain complete continuations, not only their current child process.
      await Promise.allSettled(callbacks);
      await Promise.allSettled(invocationClosures);
      if (fs.existsSync(paths.lockfilePath)) {
        const stopped: INativeBuildResult = await spawnClientAsync(['daemon', 'stop']);
        expect(stopped.code).toBe(0);
      }
      const deadline: number = Date.now() + 5000;
      while (fs.existsSync(paths.lockfilePath) && Date.now() < deadline) await delayAsync(20);
      expect(fs.existsSync(paths.lockfilePath)).toBe(false);
      await removeTestFolderAsync(folder);
    }
  };
  return fixture;
}
