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
    fs.writeFileSync(path.join(folder, 'a/input.txt'), 'two');
    expect((await invokeAsync(argv)).code).toBe(0);
    expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8')).toBe('a:one\nb:one\na:two\nb:one\n');
    const status = await invokeAsync(['daemon', 'status']);
    expect(JSON.parse(status.stdout).pid).toBe(firstPid);
    const script: IResult = await invokeAsync(['build'], true);
    expect(script.code).toBe(0);
    expect(script.stdout).toContain('rushx-only');
    expect(fs.readFileSync(path.join(folder, 'runs.txt'), 'utf8').split('\n').filter(Boolean)).toHaveLength(4);
  }, 30000);
});
