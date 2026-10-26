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
  watchTriggers?: boolean[];
  iterations?: string[][];
  sameApi?: boolean;
  reusedSource?: boolean;
  disposedSnapshots?: boolean;
  outputTriggered?: boolean;
  scheduledOnly?: boolean;
  sameConfiguration?: boolean;
  maxProjects?: number;
}

interface IRunOptions {
  project?: string;
  typescriptPackagePath?: string;
  aborted?: boolean;
  watchChange?: { filePath: string; contents?: string };
  watchChanges?: { filePath: string; contents?: string; abortAfterSemantic?: boolean }[];
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
const changes = options.watchChanges || (options.watchChange ? [options.watchChange] : undefined);
const adapter = changes ? new WatchFileSystemAdapter() : undefined;
adapter?.setBaseline();
const tracked = new Set();
let notify;
const track = (filePath) => tracked.add(filePath);
const result = { errors: [], warnings: [], tracked: [] };
let controller = new AbortController();
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
const builder = new TypeScript7Builder({
  typescriptPackagePath: options.typescriptPackagePath,
  buildFolderPath: options.root,
  tsconfigPath: path.resolve(options.root, options.project || 'tsconfig.json'),
  abortSignal: controller.signal,
  watchFs,
  requestRun: adapter ? () => notify?.() : undefined,
  logger: {
    emitError(error) { result.errors.push(error.message); },
    emitWarning(error) { result.warnings.push(error.message); },
    terminal: { writeLine() {} }
  }
});
const build = () => builder.invokeAsync(controller.signal);
(async () => {
  await build();
  if (adapter) {
    const api = builder._api;
    result.sameApi = true;
    result.scheduledOnly = true;
    const configuration = builder._programConfiguration;
    result.sameConfiguration = true;
    result.maxProjects = builder._snapshot?.getProjects().length || 0;
    result.disposedSnapshots = true;
    result.watchTriggers = [];
    result.iterations = [result.errors.slice()];
    const stablePath = path.join(options.root, 'src/stable.ts');
    let stableSource;
    if (fs.existsSync(stablePath)) {
      stableSource = await builder._snapshot.getProgram(builder._projectId).getSourceFile(stablePath);
      result.reusedSource = true;
    }
    for (const change of changes) {
      const notified = new Promise(resolve => {
        const timeout = setTimeout(() => resolve(false), 8000);
        notify = () => { clearTimeout(timeout); resolve(true); };
      });
      await new Promise(resolve => setTimeout(resolve, 250));
      const changedPath = path.resolve(options.root, change.filePath);
      const scheduledSnapshot = builder._snapshot;
      if (change.contents === undefined) fs.unlinkSync(changedPath);
      else {
        fs.mkdirSync(path.dirname(changedPath), { recursive: true });
        fs.writeFileSync(changedPath, change.contents);
      }
      result.watchTriggered = await notified;
      result.scheduledOnly &&= builder._snapshot === scheduledSnapshot;
      result.watchTriggers.push(result.watchTriggered);
      adapter.setBaseline();
      result.errors = [];
      const snapshot = builder._snapshot;
      controller = new AbortController();
      const prototype = builder._typescript.Program.prototype;
      const getSemanticDiagnostics = prototype.getSemanticDiagnostics;
      if (change.abortAfterSemantic) {
        prototype.getSemanticDiagnostics = async function (...args) {
          const diagnostics = await getSemanticDiagnostics.apply(this, args);
          controller.abort();
          return diagnostics;
        };
      }
      try { await build(); }
      finally { prototype.getSemanticDiagnostics = getSemanticDiagnostics; }
      result.sameApi &&= builder._api === api;
      result.sameConfiguration &&= builder._programConfiguration === configuration;
      result.maxProjects = Math.max(result.maxProjects, builder._snapshot?.getProjects().length || 0);
      result.disposedSnapshots &&= !snapshot || snapshot.isDisposed();
      if (stableSource) {
        result.reusedSource &&= stableSource ===
          await builder._snapshot.getProgram(builder._projectId).getSourceFile(stablePath);
      }
      result.iterations.push(result.errors.slice());
    }
    result.outputTriggered = await new Promise(resolve => {
      const timeout = setTimeout(() => resolve(false), 500);
      notify = () => { clearTimeout(timeout); resolve(true); };
    });
  }
})().catch(error => { result.failure = error.message; }).finally(async () => {
   await builder.closeAsync();
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
    { encoding: 'utf8', timeout: 60000 }
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
    write('base.json', '{"compilerOptions":{"noImplicitAny":false}}');
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

  it('retains the API and native source files across new, changed and deleted watch inputs', () => {
    write('src/stable.ts', 'export const stable = 1;');
    write('base.json', '{"compilerOptions":{"noImplicitAny":false}}');
    configure({}, { extends: './base.json' });
    write('src/index.ts', 'export { value } from "./nested/new";');
    const result: IResult = run({
      watchChanges: [
        { filePath: 'src/nested/new.ts', contents: 'export const value = 1;' },
        { filePath: 'src/added.ts', contents: 'export const value: number = "bad";' },
        { filePath: 'src/added.ts' },
        { filePath: 'src/nested/new.ts' },
        { filePath: 'src/nested/new.ts', contents: 'export const value = 2;' },
        { filePath: 'src/index.ts', contents: 'export function value(argument) { return argument; }' },
        { filePath: 'base.json', contents: '{"compilerOptions":{"noImplicitAny":true}}' },
        { filePath: 'base.json', contents: '{"compilerOptions":{"noImplicitAny":false}}' },
        { filePath: 'src/index.ts', contents: 'export const value: number = "bad";' }
      ]
    });
    expect(result.failure).toBeUndefined();
    expect(result.sameApi).toBe(true);
    expect(result.scheduledOnly).toBe(true);
    expect(result.reusedSource).toBe(true);
    expect(result.maxProjects).toBeLessThanOrEqual(2);
    expect(result.disposedSnapshots).toBe(true);
    expect(result.watchTriggers).toEqual(Array(9).fill(true));
    expect(result.iterations!.map((errors) => errors.join('\n'))).toEqual([
      expect.stringContaining('TS2307'), '', expect.stringContaining('TS2322'), '',
      expect.stringContaining('TS2307'), '', '', expect.stringContaining('TS7006'), '',
      expect.stringContaining('TS2322')
    ]);
    expect(result.outputTriggered).toBe(false);
  });

  it('invalidates package metadata and recovers from malformed watch configuration', () => {
    write('package.json', '{"type":"module"}');
    write('src/index.ts', 'import { value } from "./dependency"; export { value };');
    write('src/dependency.ts', 'export const value = 1;');
    const result: IResult = run({
      watchChanges: [
        { filePath: 'package.json', contents: '{"type":"commonjs"}' },
        { filePath: 'tsconfig.json', contents: '{"compilerOptions":' },
        {
          filePath: 'tsconfig.json',
          contents: JSON.stringify({
            compilerOptions: { noEmit: true, module: 'nodenext', types: [] },
            include: ['src/**/*.ts']
          })
        },
        { filePath: 'src/dependency.ts', contents: 'export const value: number = "bad";' }
      ]
    });
    expect(result.failure).toBeUndefined();
    expect(result.sameApi).toBe(true);
    expect(result.watchTriggers).toEqual(Array(4).fill(true));
    expect(result.iterations![0].join('\n')).toContain('TS2835');
    expect(result.iterations![1]).toEqual([]);
    expect(result.iterations![2].length).toBeGreaterThan(0);
    expect(result.iterations![3]).toEqual([]);
    expect(result.iterations![4].join('\n')).toContain('TS2322');
    expect(result.outputTriggered).toBe(false);
  });

  it('does not recursively watch unrelated directories', () => {
    write('unrelated/nested.txt', 'initial');
    const result: IResult = run({
      watchChanges: [{ filePath: 'unrelated/nested.txt', contents: 'changed' }]
    });
    expect(result.failure).toBeUndefined();
    expect(result.watchTriggers).toEqual([false]);
    expect(result.errors).toEqual([]);
    expect(result.sameApi).toBe(true);
    expect(result.outputTriggered).toBe(false);
  });

  it('recovers native snapshots and inherited config changes after an aborted iteration', () => {
    write('base.json', '{"compilerOptions":{"noImplicitAny":false}}');
    configure({}, { extends: './base.json' });
    write('src/index.ts', 'export function value(argument) { return argument; }');
    const result: IResult = run({
      watchChanges: [
        {
          filePath: 'base.json',
          contents: '{"compilerOptions":{"noImplicitAny":true}}',
          abortAfterSemantic: true
        },
        { filePath: 'src/index.ts', contents: 'export function changed(argument) { return argument; }' },
        { filePath: 'base.json', contents: '{"compilerOptions":{"noImplicitAny":false}}' }
      ]
    });
    expect(result.failure).toBeUndefined();
    expect(result.sameApi).toBe(true);
    expect(result.watchTriggers).toEqual([true, true, true]);
    expect(result.iterations![0]).toEqual([]);
    expect(result.iterations![1]).toEqual([]);
    expect(result.iterations![2].join('\n')).toContain('TS7006');
    expect(result.iterations![3]).toEqual([]);
    expect(result.outputTriggered).toBe(false);
  });

  it('discovers a new implicit type package without changing program roots or compiler options', () => {
    configure({ types: ['*'], typeRoots: ['./node_modules/@types'], noEmit: true });
    write('node_modules/@types/.keep', '');
    write('src/index.ts', 'export const value: number = globalValue;');
    write('src/stable.ts', 'export const stable = 1;');
    const result: IResult = run({
      watchChanges: [
        {
          filePath: 'node_modules/@types/new-package/index.d.ts',
          contents: 'declare const globalValue: number;'
        },
        { filePath: 'node_modules/@types/new-package/index.d.ts' },
        {
          filePath: 'node_modules/@types/new-package/index.d.ts',
          contents: 'declare const globalValue: number;'
        }
      ]
    });
    expect(result.failure).toBeUndefined();
    expect(result.sameApi).toBe(true);
    expect(result.sameConfiguration).toBe(true);
    expect(result.reusedSource).toBe(true);
    expect(result.maxProjects).toBeLessThanOrEqual(2);
    expect(result.watchTriggers).toEqual([true, true, true]);
    expect(result.iterations![0].join('\n')).toContain('TS2304');
    expect(result.iterations![1]).toEqual([]);
    expect(result.iterations![2].join('\n')).toContain('TS2304');
    expect(result.iterations![3]).toEqual([]);
    expect(result.outputTriggered).toBe(false);
  });

  it.each(['typescript7-plugin', undefined])('runs the published entry point %s through Heft', (pluginName) => {
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
                taskPlugin: { pluginPackage: '@rushstack/heft-typescript7-plugin', pluginName }
              }
            }
          }
        }
      })
    );
    FileSystem.ensureFolder(path.join(BUILD_FOLDER, 'node_modules/@rushstack'));
    fs.symlinkSync(TYPESCRIPT_PACKAGE, path.join(BUILD_FOLDER, 'node_modules/typescript'), 'junction');
    fs.symlinkSync(
      path.resolve(__dirname, '../..'),
      path.join(BUILD_FOLDER, 'node_modules/@rushstack/heft-typescript7-plugin'),
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
    expect(fs.existsSync(path.join(BUILD_FOLDER, 'out/index.js'))).toBe(false);
  });
});
