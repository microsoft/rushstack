// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

import { DaemonClient } from '@rushstack/rush-client-core';
import type { IDaemonRequestEnvelope } from '@rushstack/rush-daemon-protocol';

import { RushXDaemonTestFixture, type IRequestResult, type IScriptResult } from './RushXDaemonTestFixture';

jest.setTimeout(30_000);

describe('native Rushx execution boundaries', () => {
  let fixture: RushXDaemonTestFixture;

  afterEach(async () => {
    await fixture?.[Symbol.asyncDispose]();
  });

  async function startAsync(hooks: boolean = false, pnpmSync: boolean = false): Promise<string> {
    fixture = new RushXDaemonTestFixture(hooks, pnpmSync);
    await fixture.startAsync();
    return path.join(fixture.folder, 'projects/a');
  }

  it('rejects active hooks before execution/input, then native CLI fallback runs both hooks and the pipe once', async () => {
    const cwd: string = await startAsync(true);
    const input: PassThrough = new PassThrough();
    input.end('untouched');
    const result: IRequestResult = await fixture.runAsync(fixture.request(['pipe'], cwd), undefined, { stdin: input });
    expect(result.outcome).toMatchObject({ kind: 'fallback', reason: 'unsupported' });
    expect(input.read().toString()).toBe('untouched');
    expect(fs.existsSync(path.join(fixture.folder, 'hooks.txt'))).toBe(false);
    const fallback: IScriptResult = await fixture.invokeAsync(false, ['-q', 'pipe'], cwd, undefined, Buffer.from('piped'));
    expect(fallback.exitCode).toBe(0);
    expect(fallback.stdout.toString()).toContain('piped');
    expect(fallback.stderr.toString()).toContain('using in-process Rush');
    expect(fs.readFileSync(path.join(fixture.folder, 'hooks.txt'), 'utf8')).toBe('hook\nhook\n');
  });

  it('reuses native ignored and recursive hook behavior, including failure skipping post hooks', async () => {
    const cwd: string = await startAsync(true);
    for (const script of ['args', 'fail']) {
      const argv: string[] = ['--ignore-hooks', script];
      expect(await fixture.invokeAsync(false, argv, cwd)).toEqual(await fixture.invokeAsync(true, argv, cwd));
    }
    const environment = fixture.environment({ _RUSH_RECURSIVE_RUSHX_CALL: '1' });
    expect(await fixture.invokeAsync(false, ['args'], cwd, environment))
      .toEqual(await fixture.invokeAsync(true, ['args'], cwd, environment));
    expect(fs.existsSync(path.join(fixture.folder, 'hooks.txt'))).toBe(false);
  });

  it('executes the governing nested package and its real node_modules/.bin executable', async () => {
    const cwd: string = await startAsync();
    fixture.write('projects/a/subfolder/package.json', JSON.stringify({
      name: 'nested', version: '1.0.0', scripts: { bin: 'fixture-bin' }
    }));
    const bin: string = process.platform === 'win32' ? 'fixture-bin.cmd' : 'fixture-bin';
    fixture.write(`projects/a/subfolder/node_modules/.bin/${bin}`,
      process.platform === 'win32' ? '@echo path-ok\r\n' : '#!/bin/sh\nprintf "path-ok\\n"\n');
    fs.chmodSync(path.join(cwd, 'subfolder/node_modules/.bin', bin), 0o755);
    const nested: string = path.join(cwd, 'subfolder');
    const native: IScriptResult = await fixture.invokeAsync(true, ['-q', 'bin'], nested);
    expect(await fixture.invokeAsync(false, ['-q', 'bin'], nested)).toEqual(native);
    expect(native.exitCode).toBe(0);
    expect(native.stdout.toString().trim()).toBe('path-ok');
  });

  it('does real injected-dependency synchronization with native quiet/debug behavior', async () => {
    const cwd: string = await startAsync(false, true);
    fixture.write('projects/a/node_modules/.pnpm-sync.json', JSON.stringify({
      version: '0.3.4',
      postbuildInjectedCopy: { sourceFolder: '..', targetFolders: [{ folderPath: '../../../injected/a' }] }
    }));
    fixture.write('injected/a/output.txt', 'old-content');
    for (const argv of [['-q', 'sync'], ['-d', 'sync']]) {
      const native: IScriptResult = await fixture.invokeAsync(true, argv, cwd);
      const daemon: IScriptResult = await fixture.invokeAsync(false, argv, cwd);
      const normalize = (value: Buffer): string => value.toString().replace(/Synced (\d+ files?) in \d+ ms/g, 'Synced $1 in N ms');
      expect({ code: daemon.exitCode, out: normalize(daemon.stdout), err: normalize(daemon.stderr) })
        .toEqual({ code: native.exitCode, out: normalize(native.stdout), err: normalize(native.stderr) });
      expect(daemon.exitCode).toBe(0);
      expect(fs.readFileSync(path.join(fixture.folder, 'injected/a/output.txt'), 'utf8')).toBe('new-content');
      expect(fs.statSync(path.join(fixture.folder, 'injected/a/output.txt')).ino)
        .toBe(fs.statSync(path.join(cwd, 'output.txt')).ino);
    }
  });

  it('reads changed scripts and dotenv files without retaining a fake warm script engine', async () => {
    const cwd: string = await startAsync();
    expect((await fixture.runAsync(fixture.request(['-q', 'build'], cwd))).exitCode).toBe(0);
    fixture.write('projects/a/script.cjs', 'console.log(process.env.REPO_VALUE);');
    fixture.write('.env', 'REPO_VALUE=changed\n');
    const result: IRequestResult = await fixture.runAsync(fixture.request(['-q', 'build'], cwd));
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe('changed\n');
    expect(fixture.session.operationGraph).toBeUndefined();
  });

  it.each(['hooks', 'experiments', 'dotenv-configuration', 'vault', 'invalid-quiet'])(
    'rejects unsupported %s before consuming stdin or executing', async (kind) => {
      const cwd: string = await startAsync();
      const environment = fixture.environment();
      if (kind === 'hooks') {
        const file: string = path.join(fixture.folder, 'rush.json');
        const config = JSON.parse(fs.readFileSync(file, 'utf8'));
        fixture.write('rush.json', JSON.stringify({ ...config, eventHooks: { preRushx: ['node hook.cjs'] } }));
      } else if (kind === 'experiments') {
        fixture.write('common/config/rush/experiments.json', '{"usePnpmSyncForInjectedDependencies":true}');
      } else if (kind === 'dotenv-configuration') {
        fixture.write('.env', `RUSH_TEMP_FOLDER=${fixture.folder}/alternate-temp\n`);
      } else if (kind === 'vault') {
        environment.DOTENV_KEY = 'unsupported-vault';
      } else {
        environment.RUSH_QUIET_MODE = 'invalid';
      }
      const stdin: PassThrough = new PassThrough();
      stdin.end('not-read');
      const result = await fixture.runAsync(fixture.request(['build'], cwd, environment), undefined, { stdin });
      expect(result.outcome).toMatchObject({ kind: 'fallback', reason: 'unsupported' });
      expect(stdin.read().toString()).toBe('not-read');
      expect(fs.existsSync(path.join(cwd, 'runs.txt'))).toBe(false);
    }
  );

  it('fails visibly without running or reading when hooks change during queue admission', async () => {
    const cwd: string = await startAsync();
    let release: () => void = () => {};
    let started: () => void = () => {};
    const released: Promise<void> = new Promise((resolve) => { release = resolve; });
    const holding: Promise<void> = new Promise((resolve) => { started = resolve; });
    const holdAsync = async (): Promise<{ exitCode: number }> => {
      started();
      await released;
      return { exitCode: 0 };
    };
    jest.spyOn(fixture.phasedResolver, 'resolveRequestAsync').mockResolvedValue({
      kind: 'global', executor: holdAsync
    });
    const holder = fixture.runAsync({ ...fixture.request(['hold'], cwd), invocationKind: 'rush' });
    await holding;
    const stdin: PassThrough = new PassThrough();
    stdin.end('not-consumed');
    try {
      const result = await fixture.runAsync(fixture.request(['build'], cwd), undefined, {
        stdin,
        onQueuePositionAsync: async () => {
          const file: string = path.join(fixture.folder, 'rush.json');
          const config = JSON.parse(fs.readFileSync(file, 'utf8'));
          fixture.write('rush.json', JSON.stringify({ ...config, eventHooks: { preRushx: ['node hook.cjs'] } }));
          release();
        }
      });
      expect(result.outcome).toMatchObject({ kind: 'result', result: { exitCode: 1, outcome: 'failure' } });
      expect(result.stderr.toString()).toContain('Rush configuration changed');
      expect(stdin.read().toString()).toBe('not-consumed');
      expect(fs.existsSync(path.join(cwd, 'runs.txt'))).toBe(false);
    } finally {
      release();
      await holder;
    }
  });

  it('does not guess package scripts for legacy or custom workspace requests', async () => {
    const cwd: string = await startAsync();
    const phased = jest.spyOn(fixture.phasedResolver, 'resolveRequestAsync');
    for (const invocationKind of [undefined, 'rush'] as const) {
      const request: IDaemonRequestEnvelope = { ...fixture.request(['build'], cwd), invocationKind };
      expect((await fixture.runAsync(request)).outcome).toMatchObject({ kind: 'fallback', reason: 'unsupported' });
    }
    expect(phased).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(path.join(cwd, 'runs.txt'))).toBe(false);
  });

  it('cancels the owned script and descendant before publishing the authoritative result', async () => {
    const cwd: string = await startAsync();
    const controller: AbortController = new AbortController();
    let output: string = '';
    const result = await fixture.runAsync(fixture.request(['-q', 'tree'], cwd), undefined, {
      abortSignal: controller.signal,
      onStdoutAsync: async (bytes) => {
        output += Buffer.from(bytes).toString();
        if (output.includes('PARENT:') && output.includes('DESCENDANT:')) controller.abort();
      }
    });
    expect(result.outcome).toMatchObject({ kind: 'result', result: { exitCode: 1, aborted: true, outcome: 'aborted' } });
    assertChildrenStopped(output);
    expect((await fixture.runAsync(fixture.request(['-q', 'args'], cwd))).exitCode).toBe(0);
  });

  it('cleans disconnected children without retrying the request', async () => {
    const cwd: string = await startAsync();
    const client: DaemonClient = await DaemonClient.connectAsync({ socketPath: fixture.host.paths.socketPath });
    let output: string = '';
    await expect(client.executeAsync({
      request: fixture.request(['-q', 'tree'], cwd),
      onStdoutAsync: async (bytes) => {
        output += Buffer.from(bytes).toString();
        if (output.includes('PARENT:') && output.includes('DESCENDANT:')) await client.closeAsync();
      },
      onStderrAsync: async () => {}
    })).rejects.toThrow('not retried');
    await fixture.host.closeAsync();
    assertChildrenStopped(output);
  });
});

function assertChildrenStopped(output: string): void {
  const pids: number[] = Array.from(output.matchAll(/(?:PARENT|DESCENDANT):(\d+)/g), (match) => Number(match[1]));
  expect(pids).toHaveLength(2);
  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      // Linux containers may retain a reparented zombie until init reaps it; it cannot execute or own streams.
      if (process.platform === 'linux') {
        expect(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].startsWith('Z ')).toBe(true);
      } else {
        throw new Error(`Script descendant ${pid} is still running.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH' && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
