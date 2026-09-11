// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

import { RushXDaemonTestFixture, type IRequestResult, type IScriptResult } from './RushXDaemonTestFixture';

jest.setTimeout(30_000);

describe('native Rushx through a real daemon', () => {
  let fixture: RushXDaemonTestFixture;
  let cwd: string;
  let serverCwd: string;
  let serverEnvironment: NodeJS.ProcessEnv;

  beforeEach(async () => {
    fixture = new RushXDaemonTestFixture();
    await fixture.startAsync();
    cwd = path.join(fixture.folder, 'projects/a');
    serverCwd = process.cwd();
    serverEnvironment = { ...process.env };
  });

  afterEach(async () => {
    expect(process.cwd()).toBe(serverCwd);
    expect(process.env).toEqual(serverEnvironment);
    expect(fixture.session.operationGraph).toBeUndefined();
    await fixture[Symbol.asyncDispose]();
  });

  it('executes rushx build through the actual CLI and never enters the phased resolver', async () => {
    const phased = jest.spyOn(fixture.phasedResolver, 'resolveRequestAsync');
    const native: IScriptResult = await fixture.invokeAsync(true, ['build'], cwd);
    const daemon: IScriptResult = await fixture.invokeAsync(false, ['build'], cwd);
    expect(daemon).toEqual(native);
    expect(daemon.exitCode).toBe(0);
    expect(phased).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(cwd, 'runs.txt'), 'utf8')).toBe('ran\nran\n');
  });

  it('isolates overlapping requests from different nested cwds, homes and environments', async () => {
    fixture.write('second-home/.rush-user/.env', 'USER_VALUE=second-user\n');
    const requests = ['a', 'b'].map((name) => {
      const project: string = path.join(fixture.folder, 'projects', name);
      const home: string = path.join(fixture.folder, name === 'a' ? 'home' : 'second-home');
      const environment = fixture.environment({ CLIENT_MARKER: name, HOME: home, USERPROFILE: home });
      return { project, nested: path.join(project, 'subfolder'), environment };
    });
    const native = await Promise.all(requests.map(({ nested, environment }) =>
      fixture.invokeAsync(true, ['--quiet', 'build'], nested, environment)
    ));
    const daemon = await Promise.all(requests.map(({ nested, environment }) =>
      fixture.runAsync(fixture.request(['--quiet', 'build'], nested, environment))
    ));
    daemon.forEach((result, index) => {
      expect({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }).toEqual(native[index]);
      expect(JSON.parse(result.stdout.toString())).toMatchObject({
        cwd: requests[index].project, invoked: requests[index].nested,
        init: path.join(fixture.folder, 'common/temp'),
        bin: path.join(requests[index].project, 'node_modules/.bin'),
        marker: index === 0 ? 'a' : 'b', repo: 'from-repo',
        user: index === 0 ? 'from-user' : 'second-user',
        order: 'from-repo', client: 'from-client', recursive: '1'
      });
      expect(JSON.parse(result.stdout.toString())).not.toHaveProperty('npmConfig');
      expect(JSON.parse(result.stdout.toString())).not.toHaveProperty('absent');
    });
  });

  it('uses native parsing and escaping for arbitrary arguments, flags after the command and --', async () => {
    const args: string[] = [
      '-q', '--debug', 'args', '--help', '--quiet', '--reporter=json',
      'two words', 'single\' quote', '"double quote"', '; echo bad', 'a & b', 'a\\ b',
      '--', '--no-daemon', '--no-wait', '--wait-timeout', 'bogus'
    ];
    const native: IScriptResult = await fixture.invokeAsync(true, args, cwd);
    expect(await fixture.invokeAsync(false, args, cwd)).toEqual(native);
    expect(JSON.parse(native.stdout.toString())).toEqual(args.slice(3));
  });

  it.each(['', 'single\'quote', '"double"', '$(printf native)', 'a\\b'])(
    'preserves native escaping semantics even for shell-sensitive argument %s', async (arg) => {
      const argv: string[] = ['-q', 'args', arg];
      expect(await fixture.invokeAsync(false, argv, cwd)).toEqual(await fixture.invokeAsync(true, argv, cwd));
    }
  );

  it.each([0, 257, 3 * 1024 * 1024])('preserves raw binary pipe bytes and EOF (%s bytes)', async (size) => {
    const input: Buffer = Buffer.alloc(size);
    for (let index: number = 0; index < size; index++) input[index] = index % 256;
    const native: IScriptResult = await fixture.invokeAsync(true, ['-q', 'pipe'], cwd, undefined, input);
    expect(await fixture.invokeAsync(false, ['-q', 'pipe'], cwd, undefined, input)).toEqual(native);
    expect(native.stdout).toEqual(input);
    expect(native.stderr).toEqual(Buffer.from([255, 0, 3, 10]));
    expect(native.exitCode).toBe(0);
  });

  it('preserves the exact nonzero exit code, command display and native error suffix', async () => {
    const args: string[] = ['fail', 'two words', '--flag'];
    const native: IScriptResult = await fixture.invokeAsync(true, args, cwd);
    expect(await fixture.invokeAsync(false, args, cwd)).toEqual(native);
    expect(native.exitCode).toBe(7);
    expect(native.stderr.toString()).toContain('raw-err\x1b[31mError: Failed calling');
  });

  it('retains unregistered-project warnings and native missing-script errors without fallback', async () => {
    for (const [project, script] of [['unregistered', 'args'], ['a', 'missing']]) {
      const folder: string = path.join(fixture.folder, 'projects', project);
      const native: IScriptResult = await fixture.invokeAsync(true, [script], folder);
      expect(await fixture.invokeAsync(false, [script], folder)).toEqual(native);
    }
  });

  it('does not replace a script failure with pipe errors when the script exits without reading', async () => {
    const input: Buffer = Buffer.alloc(3 * 1024 * 1024);
    const native: IScriptResult = await fixture.invokeAsync(true, ['-q', 'early'], cwd, undefined, input);
    expect(await fixture.invokeAsync(false, ['-q', 'early'], cwd, undefined, input)).toEqual(native);
    expect(native.exitCode).toBe(23);
  });

  it('rejects symlink cwd escapes and forged Rushx origins before consuming input', async () => {
    const escaped: string = path.join(fixture.folder, 'outside');
    fs.symlinkSync(path.dirname(fixture.folder), escaped, process.platform === 'win32' ? 'junction' : 'dir');
    for (const request of [
      fixture.request(['build'], escaped),
      { ...fixture.request(['build'], cwd), commandOrigin: 'built-in' as const },
      { ...fixture.request(['daemon'], cwd), commandOrigin: 'built-in' as const }
    ]) {
      const input: PassThrough = new PassThrough();
      input.end('untouched');
      const result: IRequestResult = await fixture.runAsync(request, undefined, { stdin: input });
      expect(result.outcome).toMatchObject({ kind: 'rejected', rejection: { code: 'invalidRequest' } });
      expect(input.read().toString()).toBe('untouched');
    }
    expect(fs.existsSync(path.join(cwd, 'runs.txt'))).toBe(false);
  });

  it('leaves a controlling-terminal request in-process without emulating a PTY or reading stdin', async () => {
    const input: PassThrough = new PassThrough();
    input.end('untouched');
    const request = fixture.request(['pipe'], cwd);
    const result: IRequestResult = await fixture.runAsync({
      ...request, terminal: { ...request.terminal, terminalRequirement: 'controllingTerminal' }
    }, undefined, { stdin: input });
    expect(result.outcome).toMatchObject({ kind: 'fallback', reason: 'controllingTerminalRequired' });
    expect(input.read().toString()).toBe('untouched');
  });
});
