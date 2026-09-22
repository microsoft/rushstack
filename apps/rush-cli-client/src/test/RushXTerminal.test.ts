// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { RushXDaemonRequestResolver } from '@rushstack/rush-daemon';

import { RushXDaemonTestFixture } from './RushXDaemonTestFixture';
import { canRunPtyTests, invokeRushxPtyAsync } from './PtyTestProcess';

describe('native Rushx terminal boundaries', () => {
  let fixture: RushXDaemonTestFixture;
  let cwd: string;

  beforeEach(async () => {
    fixture = new RushXDaemonTestFixture();
    cwd = path.join(fixture.folder, 'projects/a');
    fixture.write(
      'projects/a/package.json',
      JSON.stringify({
        name: 'a',
        version: '1.0.0',
        scripts: { terminal: 'node terminal.cjs', tty: 'node tty.cjs' }
      })
    );
    fixture.write(
      'projects/a/terminal.cjs',
      'process.stdout.write(JSON.stringify({color:process.env.FORCE_COLOR,width:process.env.COLUMNS}));'
    );
    fixture.write(
      'projects/a/tty.cjs',
      `
const fs=require('node:fs');
fs.appendFileSync('tty-runs.txt','run\\n');
fs.writeFileSync('tty.pid',String(process.pid));
if (!process.stdout.isTTY) throw new Error('Expected native stdout terminal.');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.on('SIGINT',()=>{
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write('restored='+!!process.stdin.isRaw+'\\n');
  process.exit(130);
});
process.stdout.write('raw-ready\\n');
process.stdin.resume();
setInterval(()=>{},1000);
`
    );
    await fixture.startAsync();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fixture[Symbol.asyncDispose]();
  });

  it('projects terminal color and width after lifecycle preparation without leaking between requests', async () => {
    const originalEnvironment: NodeJS.ProcessEnv = { ...process.env };
    const environment = fixture.environment({ FORCE_COLOR: undefined, COLUMNS: undefined });
    const requests = [
      { isTTY: true, supportsColor: true, columns: 123 },
      { isTTY: true, supportsColor: false, columns: 71 },
      { isTTY: false, supportsColor: false }
    ].map((terminal) => ({
      ...fixture.request(['-q', 'terminal'], cwd, environment),
      terminal: { ...terminal, acceptsStdin: true }
    }));
    const results = await Promise.all(requests.map((request) => fixture.runAsync(request)));
    expect(results.map((result) => result.exitCode)).toEqual([0, 0, 0]);
    expect(results.map((result) => JSON.parse(result.stdout.toString()))).toEqual([
      { color: '1', width: '123' },
      { color: '0', width: '71' },
      {}
    ]);
    expect(process.env).toEqual(originalEnvironment);
    const explicitEnvironment = fixture.environment({ FORCE_COLOR: '2', COLUMNS: '99' });
    expect(await fixture.invokeAsync(false, ['-q', 'terminal'], cwd, explicitEnvironment)).toEqual(
      await fixture.invokeAsync(true, ['-q', 'terminal'], cwd, explicitEnvironment)
    );
  }, 15000);

  (canRunPtyTests ? it : it.skip).each([true, false])(
    'preserves real PTY raw mode, SIGINT and single execution before daemon admission (TTY stdin: %s)',
    async (stdinIsTTY) => {
      const resolve = jest.spyOn(RushXDaemonRequestResolver.prototype, 'resolveRequestAsync');
      const environment = fixture.environment({ FORCE_COLOR: undefined, COLUMNS: undefined, TERM: 'xterm' });
      const native = await invokeRushxPtyAsync(
        path.join(path.dirname(require.resolve('@microsoft/rush/package.json')), 'bin/rushx'),
        cwd,
        environment,
        stdinIsTTY
      );
      expect(native).toMatchObject({ exitCode: 130, restored: true });
      expect(native.output).toContain('raw-ready\r\nrestored=false\r\n');
      expect(fs.readFileSync(path.join(cwd, 'tty-runs.txt'), 'utf8')).toBe('run\n');
      const client = await invokeRushxPtyAsync(
        path.resolve(__dirname, '../../bin/rushx-client'),
        cwd,
        environment,
        stdinIsTTY
      );
      expect(client).toEqual(native);
      expect(fs.readFileSync(path.join(cwd, 'tty-runs.txt'), 'utf8')).toBe('run\nrun\n');
      expect(resolve).not.toHaveBeenCalled();
    },
    40000
  );
});
