// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

import { RushXDaemonTestFixture, type IScriptResult } from './RushXDaemonTestFixture';

jest.setTimeout(30_000);

describe('native Rushx invocation namespaces', () => {
  let fixture: RushXDaemonTestFixture;
  let aliasContainer: string;
  let aliasRoot: string;
  let physicalRoot: string;
  let serverCwd: string;
  let serverEnvironment: NodeJS.ProcessEnv;

  beforeEach(async () => {
    fixture = new RushXDaemonTestFixture(false, true);
    physicalRoot = fs.realpathSync.native(fixture.folder);
    aliasContainer = fs.mkdtempSync(path.join(os.tmpdir(), 'rushx-invocation-alias-'));
    aliasRoot = path.join(aliasContainer, 'workspace');
    fs.symlinkSync(physicalRoot, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');
    fixture.write('projects/a/script.cjs', `
const path = require('node:path');
console.log(JSON.stringify({
  cwd: process.cwd(), invoked: process.env.RUSH_INVOKED_FOLDER,
  init: process.env.INIT_CWD, bin: process.env.PATH.split(path.delimiter)[0],
  base: process.env.RUSHSTACK_FILE_ERROR_BASE_FOLDER, marker: process.env.CLIENT_MARKER
}));
`);
    await fixture.startAsync();
    serverCwd = process.cwd();
    serverEnvironment = { ...process.env };
  });

  afterEach(async () => {
    try {
      expect(process.cwd()).toBe(serverCwd);
      expect(process.env).toEqual(serverEnvironment);
      expect(fixture.session.metadata.repoRoot).toBe(physicalRoot);
      expect(fixture.session.rushConfiguration.rushJsonFolder).toBe(physicalRoot);
      expect(fixture.session.operationGraph).toBeUndefined();
    } finally {
      await fixture[Symbol.asyncDispose]();
      fs.rmSync(aliasContainer, { recursive: true, force: true });
    }
  });

  it('preserves native cwd, invocation, PATH and configuration namespaces across aliases on one host', async () => {
    const phased = jest.spyOn(fixture.phasedResolver, 'resolveRequestAsync');
    for (const root of [aliasRoot, physicalRoot]) {
      const cwd: string = path.join(root, 'projects/a/subfolder');
      const environment = fixture.environment({
        RUSHSTACK_FILE_ERROR_BASE_FOLDER: undefined,
        CLIENT_MARKER: root
      });
      const native: IScriptResult = await fixture.invokeAsync(true, ['-q', 'build'], cwd, environment);
      expect(await fixture.invokeAsync(false, ['-q', 'build'], cwd, environment)).toEqual(native);
      expect(native.exitCode).toBe(0);
      const namespaceRoot: string = process.platform === 'win32' ? root : physicalRoot;
      expect(JSON.parse(native.stdout.toString())).toEqual({
        cwd: path.join(namespaceRoot, 'projects/a'),
        invoked: path.join(namespaceRoot, 'projects/a/subfolder'),
        init: path.join(namespaceRoot, 'common/temp'),
        bin: path.join(namespaceRoot, 'projects/a/node_modules/.bin'),
        base: namespaceRoot,
        marker: root
      });
    }
    expect(phased).not.toHaveBeenCalled();
  });

  it('preserves native registration warnings for a project alias instead of substituting physical membership', async () => {
    const cwd: string = path.join(fixture.folder, 'project-alias');
    fs.symlinkSync(path.join(physicalRoot, 'projects/a'), cwd, process.platform === 'win32' ? 'junction' : 'dir');
    const native: IScriptResult = await fixture.invokeAsync(true, ['-q', 'args'], cwd);
    expect(await fixture.invokeAsync(false, ['-q', 'args'], cwd)).toEqual(native);
    expect(native.exitCode).toBe(0);
    expect(native.stdout.toString().includes('this project is not registered')).toBe(process.platform === 'win32');
  });

  it('preserves exact alias-qualified native pnpm-sync diagnostics without rewriting displayed paths', async () => {
    fixture.write('projects/a/node_modules/.pnpm-sync.json', '{"version":"incompatible-fixture-version"}');
    const cwd: string = path.join(aliasRoot, 'projects/a/subfolder');
    const native: IScriptResult = await fixture.invokeAsync(true, ['-d', 'sync'], cwd);
    expect(await fixture.invokeAsync(false, ['-d', 'sync'], cwd)).toEqual(native);
    expect(native.exitCode).toBe(1);
    const namespaceRoot: string = process.platform === 'win32' ? aliasRoot : physicalRoot;
    expect(native.stdout.toString()).toContain(
      `Starting operation for ${path.join(namespaceRoot, 'projects/a/node_modules/.pnpm-sync.json')}`
    );
  });

  it('rejects a workspace alias retargeted outside the physical workspace before reading stdin', async () => {
    const outsideRoot: string = path.join(aliasContainer, 'outside');
    fs.mkdirSync(path.join(outsideRoot, 'projects/a'), { recursive: true });
    fs.writeFileSync(path.join(outsideRoot, 'projects/a/package.json'), '{"name":"outside","version":"1.0.0"}');
    fs.unlinkSync(aliasRoot);
    fs.symlinkSync(outsideRoot, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');
    const input: PassThrough = new PassThrough();
    input.end('untouched');
    const result = await fixture.runAsync(
      fixture.request(['build'], path.join(aliasRoot, 'projects/a')), undefined, { stdin: input }
    );
    expect(result.outcome).toMatchObject({
      kind: 'rejected', rejection: { code: 'invalidRequest', message: expect.stringContaining('outside the daemon workspace') }
    });
    expect(input.read().toString()).toBe('untouched');
    expect(result.stdout.length).toBe(0);
  });

  it('pins physical request identity when an alias changes while waiting for admission', async () => {
    fixture.write('retargeted/projects/a/package.json', JSON.stringify({
      name: 'retargeted', version: '1.0.0', scripts: { build: 'node script.cjs' }
    }));
    fixture.write('retargeted/projects/a/script.cjs', "require('node:fs').writeFileSync('executed', 'wrong project');");
    let started: () => void = () => {};
    let release: () => void = () => {};
    const holding: Promise<void> = new Promise((resolve) => { started = resolve; });
    const released: Promise<void> = new Promise((resolve) => { release = resolve; });
    const holdAsync = async (): Promise<{ exitCode: number }> => {
      started();
      await released;
      return { exitCode: 0 };
    };
    jest.spyOn(fixture.phasedResolver, 'resolveRequestAsync').mockResolvedValue({
      kind: 'global', executor: holdAsync
    });
    const holder = fixture.runAsync({
      ...fixture.request(['hold'], path.join(physicalRoot, 'projects/a')), invocationKind: 'rush'
    });
    await holding;
    const input: PassThrough = new PassThrough();
    input.end('not consumed before execution');
    try {
      const result = await fixture.runAsync(
        fixture.request(['-q', 'build'], path.join(aliasRoot, 'projects/a')), undefined, {
          stdin: input,
          onQueuePositionAsync: async () => {
            fs.unlinkSync(aliasRoot);
            fs.symlinkSync(path.join(physicalRoot, 'retargeted'), aliasRoot,
              process.platform === 'win32' ? 'junction' : 'dir');
            release();
          }
        }
      );
      if (process.platform === 'win32') {
        expect(result.outcome).toMatchObject({
          kind: 'result', result: { exitCode: 1, errorMessage: expect.stringContaining('invocation directory changed') }
        });
        expect(input.read().toString()).toBe('not consumed before execution');
      } else {
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout.toString()).cwd).toBe(path.join(physicalRoot, 'projects/a'));
      }
      expect(fs.existsSync(path.join(physicalRoot, 'retargeted/projects/a/executed'))).toBe(false);
    } finally {
      release();
      await holder;
    }
  });

  it('falls back before input for relative temporary-folder initialization instead of using server cwd', async () => {
    const input: PassThrough = new PassThrough();
    input.end('untouched');
    const result = await fixture.runAsync(fixture.request(
      ['build'], path.join(aliasRoot, 'projects/a'), fixture.environment({ RUSH_TEMP_FOLDER: 'relative-temp' })
    ), undefined, { stdin: input });
    expect(result.outcome).toMatchObject({
      kind: 'fallback', reason: 'unsupported', message: expect.stringContaining('Relative RUSH_TEMP_FOLDER')
    });
    expect(input.read().toString()).toBe('untouched');
    expect(result.stdout.length).toBe(0);
  });
});
