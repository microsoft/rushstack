// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import { FileSystem } from '@rushstack/node-core-library';

interface IResult {
  errors: string[];
  warnings: string[];
  tracked: string[];
  failure?: string;
  watchTriggered?: boolean;
}

interface IRunOptions {
  project?: string;
  typescriptPackagePath?: string;
  aborted?: boolean;
  watchChange?: { filePath: string; contents?: string };
}

const BUILD_FOLDER: string = path.resolve(__dirname, '../../temp/typescript7-tests');
const TYPESCRIPT_PACKAGE: string = path.dirname(require.resolve('typescript-7/package.json'));

// Run outside Jest's VM: this also exercises the packaged CJS-to-native-ESM loader.
const RUNNER: string = `
const fs = require('node:fs');
const path = require('node:path');
const { TypeScript7Builder } = require(process.argv[1]);
const { WatchFileSystemAdapter } = require('@rushstack/heft/lib/utilities/WatchFileSystemAdapter');
const options = JSON.parse(process.argv[2]);
const adapter = options.watchChange ? new WatchFileSystemAdapter() : undefined;
adapter?.setBaseline();
const tracked = new Set();
const track = (filePath) => tracked.add(filePath);
const result = { errors: [], warnings: [], tracked: [] };
const controller = new AbortController();
if (options.aborted) controller.abort();
const watchFs = {
  statSync(filePath) {
    track(filePath);
    return adapter ? adapter.statSync(filePath) : fs.statSync(filePath);
  },
  readdirSync(filePath, options) {
    track(filePath);
    return adapter ? adapter.readdirSync(filePath, options) : fs.readdirSync(filePath, options);
  },
  getStateAndTrack(filePath) { track(filePath); return adapter?.getStateAndTrack(filePath); }
};
const build = () => new TypeScript7Builder({
  typescriptPackagePath: options.typescriptPackagePath,
  buildFolderPath: options.root,
  tsconfigPath: path.resolve(options.root, options.project || 'tsconfig.json'),
  abortSignal: controller.signal,
  watchFs,
  logger: {
    emitError(error) { result.errors.push(error.message); },
    emitWarning(error) { result.warnings.push(error.message); },
    terminal: { writeLine() {} }
  }
}).invokeAsync();
(async () => {
  await build();
  if (adapter) {
    const notified = new Promise(resolve => {
      const timeout = setTimeout(() => resolve(false), 8000);
      adapter.watch(() => { clearTimeout(timeout); resolve(true); });
    });
    await new Promise(resolve => setTimeout(resolve, 250));
    const changedPath = path.resolve(options.root, options.watchChange.filePath);
    if (options.watchChange.contents === undefined) fs.unlinkSync(changedPath);
    else fs.writeFileSync(changedPath, options.watchChange.contents);
    result.watchTriggered = await notified;
    adapter.setBaseline();
    result.errors = [];
    await build();
  }
})().catch(error => { result.failure = error.message; }).finally(() => {
  adapter?.setBaseline();
  result.tracked = Array.from(tracked);
  console.log(JSON.stringify(result));
});
`;

function run(options: IRunOptions = {}): IResult {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      RUNNER,
      path.resolve(__dirname, '../TypeScript7Builder.js'),
      JSON.stringify({ root: BUILD_FOLDER, typescriptPackagePath: TYPESCRIPT_PACKAGE, ...options })
    ],
    { encoding: 'utf8', timeout: 30000 }
  );
  if (result.error || result.status !== 0) {
    throw new Error(`Native compiler process failed: ${result.error || result.stderr}`);
  }
  return JSON.parse(result.stdout) as IResult;
}

function write(filePath: string, contents: string): void {
  FileSystem.writeFile(path.join(BUILD_FOLDER, filePath), contents, { ensureFolderExists: true });
}

function configure(compilerOptions: object = {}, extraConfig: object = {}): void {
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'es2022',
        module: 'nodenext',
        types: [],
        rootDir: './src',
        outDir: './out',
        ...compilerOptions
      },
      include: ['src/**/*.ts', 'src/**/*.mts', 'src/**/*.cts'],
      ...extraConfig
    })
  );
}

describe('TypeScript 7 native compiler integration', () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(BUILD_FOLDER);
    write('src/index.ts', 'export const value: number = 1;');
    configure();
  });

  afterAll(() => {
    FileSystem.deleteFolder(BUILD_FOLDER);
  });

  it('emits declarations and maps, never JavaScript, without changing module kinds', () => {
    configure({ declaration: false, emitDeclarationOnly: false, declarationMap: true });
    write('src/module.mts', 'export const esm = 1;');
    write('src/module.cts', 'export const cjs = 1;');
    expect(run().errors).toEqual([]);
    expect(fs.readdirSync(path.join(BUILD_FOLDER, 'out')).sort()).toEqual([
      'index.d.ts',
      'index.d.ts.map',
      'module.d.cts',
      'module.d.cts.map',
      'module.d.mts',
      'module.d.mts.map'
    ]);
  });

  it('performs semantic checks even when noCheck is configured', () => {
    configure({ noCheck: true, noEmit: true });
    write('src/index.ts', 'export const value: number = "incorrect";');
    const result: IResult = run();
    expect(result.failure).toBeUndefined();
    expect(result.errors.join('\n')).toContain('TS2322');
    expect(result.errors.join('\n')).toContain('src/index.ts(1,');
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out'))).toBe(false);
  });

  it('honors pure noEmit checking', () => {
    configure({ noEmit: true });
    expect(run().errors).toEqual([]);
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out'))).toBe(false);
  });

  it.each([true, false])('honors noEmitOnError=%s', (noEmitOnError) => {
    configure({ noEmitOnError });
    write('src/index.ts', 'export const value: number = "incorrect";');
    const result: IResult = run();
    expect(result.errors.filter((message) => message.includes('TS2322'))).toHaveLength(1);
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out/index.d.ts'))).toBe(!noEmitOnError);
  });

  it('reports config, options, global and syntax errors', () => {
    configure({ module: 'not-a-module-kind', noLib: true });
    write('src/index.ts', 'export const value = ;');
    const result: IResult = run();
    expect(result.failure).toBeUndefined();
    expect(result.errors.join('\n')).toContain('TS6046');
    expect(result.errors.join('\n')).toContain('TS2318');
    expect(result.errors.join('\n')).toContain('TS1109');
  });

  it('reports declaration diagnostics', () => {
    write('src/index.ts', 'export const value = class { private secret = 1; };');
    expect(run().errors.join('\n')).toContain('TS4094');
  });

  it('reports missing and malformed configs', () => {
    expect(run({ project: 'missing.json' }).failure).toContain('missing.json');
    write('tsconfig.json', '{"compilerOptions":');
    expect(run().errors.length).toBeGreaterThan(0);
  });

  it('rejects project references rather than silently skipping builds', () => {
    configure({}, { references: [{ path: './other' }] });
    expect(run().failure).toContain('does not build project references');
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out'))).toBe(false);
  });

  it('rejects legacy TypeScript and skips aborted runs', () => {
    expect(run({ typescriptPackagePath: path.dirname(require.resolve('typescript/package.json')) }).failure)
      .toContain('requires TypeScript 7');
    expect(run({ aborted: true, typescriptPackagePath: '/not-a-package' })).toEqual({
      errors: [],
      warnings: [],
      tracked: []
    });
  });

  it('tracks inherited configs, glob folders and missing imports, and rebuilds after changes', () => {
    write('base.json', JSON.stringify({ compilerOptions: { strict: true } }));
    configure({}, { extends: './base.json' });
    write('src/index.ts', 'export { value } from "./new";');
    const initial: IResult = run();
    expect(initial.errors.join('\n')).toContain('TS2307');
    for (const filePath of ['tsconfig.json', 'base.json', 'src', 'src/index.ts', 'src/new.ts']) {
      expect(initial.tracked).toContain(path.join(BUILD_FOLDER, filePath));
    }
    write('src/new.ts', 'export const value: number = 1;');
    expect(run().errors).toEqual([]);
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out/new.d.ts'))).toBe(true);
    write('src/added.ts', 'export const added: number = "incorrect";');
    expect(run().errors.join('\n')).toContain('TS2322');
    fs.unlinkSync(path.join(BUILD_FOLDER, 'src/added.ts'));
    fs.unlinkSync(path.join(BUILD_FOLDER, 'src/new.ts'));
    expect(run().errors.join('\n')).toContain('TS2307');
    write('src/index.ts', 'export function value(argument) { return argument; }');
    expect(run().errors.join('\n')).toContain('TS7006');
    write('base.json', JSON.stringify({ compilerOptions: { strict: false, noEmit: true } }));
    expect(run().errors).toEqual([]);
  });

  it.each([
    { filePath: 'src/index.ts', contents: 'export const value: number = "incorrect";' },
    { filePath: 'src/added.ts', contents: 'export const value: number = "incorrect";' },
    { filePath: 'src/dependency.ts' },
    { filePath: 'base.json', contents: '{"compilerOptions":{"noImplicitAny":true}}' }
  ])('schedules a Heft watch rebuild for $filePath', (watchChange) => {
    write('base.json', '{}');
    configure({}, { extends: './base.json' });
    write('src/dependency.ts', 'export const dependency = 1;');
    write(
      'src/index.ts',
      'export { dependency } from "./dependency"; export function value(argument) { return argument; }'
    );
    const result: IResult = run({ watchChange });
    expect(result.failure).toBeUndefined();
    expect(result.watchTriggered).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.each([
    { pluginName: 'typescript7-plugin', compilerPackage: 'typescript-7', emitsJavaScript: false },
    { pluginName: 'typescript-plugin', compilerPackage: 'typescript', emitsJavaScript: true }
  ])('runs the published $pluginName entry point through Heft', ({
    pluginName,
    compilerPackage,
    emitsJavaScript
  }) => {
    configure({ declaration: true });
    write(
      'package.json',
      JSON.stringify({
        name: 'typescript-plugin-integration-test',
        version: '1.0.0',
        private: true,
        devDependencies: { typescript: '*' }
      })
    );
    write(
      'config/heft.json',
      JSON.stringify({
        phasesByName: {
          build: {
            tasksByName: {
              typescript: {
                taskPlugin: { pluginPackage: '@rushstack/heft-typescript-plugin', pluginName }
              }
            }
          }
        }
      })
    );
    FileSystem.ensureFolder(path.join(BUILD_FOLDER, 'node_modules/@rushstack'));
    fs.symlinkSync(
      path.dirname(require.resolve(`${compilerPackage}/package.json`)),
      path.join(BUILD_FOLDER, 'node_modules/typescript'),
      'junction'
    );
    fs.symlinkSync(
      path.resolve(__dirname, '../..'),
      path.join(BUILD_FOLDER, 'node_modules/@rushstack/heft-typescript-plugin'),
      'junction'
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(path.dirname(require.resolve('@rushstack/heft/package.json')), 'bin/heft'),
        'run',
        '--only',
        'build'
      ],
      { cwd: BUILD_FOLDER, encoding: 'utf8', timeout: 30000 }
    );
    expect(result.error || result.stderr).toBeFalsy();
    expect(result.stdout).not.toContain('Encountered');
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out/index.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out/index.js'))).toBe(emitsJavaScript);
  });
});
