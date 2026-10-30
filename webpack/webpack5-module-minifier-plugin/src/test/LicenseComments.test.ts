// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.disableAutomock();
import { promisify } from 'node:util';

import webpack, { type Compilation, type InputFileSystem, type OutputFileSystem, type Stats } from 'webpack';
import { Volume } from 'memfs/lib/volume';

import { LocalMinifier } from '@rushstack/module-minifier';

import { ModuleMinifierPlugin } from '../ModuleMinifierPlugin';
import type { IRenderedModulePosition } from '../ModuleMinifierPlugin.types';

const LICENSE: string = '/*! @license MIT */\n';
const BANNER: string = '/*! For license information please see bundle.js.LICENSE.txt */\n';
const CODE: string = 'console.log(42);';

interface ITestOptions {
  inlineShortLicenses?: boolean;
  entry?: string;
  modules?: Record<string, string>;
  filename?: string;
  sourceMap?: boolean;
}

interface ITestResult {
  files: Record<string, string>;
  compilation: Compilation;
}

interface ISourceMap {
  mappings: string;
  sources: string[];
  sourcesContent: string[];
}

async function runWebpackAsync(options: ITestOptions): Promise<ITestResult> {
  const {
    inlineShortLicenses,
    entry = `${LICENSE}${CODE}`,
    modules,
    filename = 'bundle.js',
    sourceMap = false
  } = options;
  const memoryFileSystem: Volume = new Volume();
  memoryFileSystem.fromJSON({
    '/package.json': '{}',
    '/entry.js': entry,
    ...modules
  });

  const compiler: webpack.Compiler = webpack({
    entry: '/entry.js',
    output: { path: '/release', filename },
    optimization: { minimizer: [], concatenateModules: false, inlineExports: false },
    context: '/',
    mode: 'production',
    devtool: sourceMap ? 'source-map' : false,
    plugins: [
      new ModuleMinifierPlugin({
        minifier: new LocalMinifier({ terserOptions: { ecma: 2020 } }),
        sourceMap,
        inlineShortLicenses
      })
    ]
  });
  compiler.inputFileSystem = memoryFileSystem as unknown as InputFileSystem;
  compiler.outputFileSystem = memoryFileSystem as unknown as OutputFileSystem;

  try {
    const stats: Stats | undefined = await promisify(compiler.run.bind(compiler))();
    if (!stats) {
      throw new Error('Expected webpack stats');
    }

    if (stats.hasErrors() || stats.hasWarnings()) {
      throw new Error(stats.toString('errors-warnings'));
    }

    const files: Record<string, string> = {};
    for (const filePath of Object.keys(memoryFileSystem.toJSON('/release'))) {
      files[filePath.slice('/release/'.length)] = memoryFileSystem.readFileSync(filePath, 'utf8').toString();
    }

    return { files, compilation: stats.compilation };
  } finally {
    await promisify(compiler.close.bind(compiler))();
  }
}

describe('License comments', () => {
  it.each([undefined, false])(
    'preserves external notices by default (inlineShortLicenses=%s)',
    async (inlineShortLicenses: boolean | undefined): Promise<void> => {
      const { files } = await runWebpackAsync({ inlineShortLicenses });

      expect(files['bundle.js']!.startsWith(BANNER)).toBe(true);
      expect(files['bundle.js.LICENSE.txt']).toBe(LICENSE);
    }
  );

  it('inlines short notices without emitting a companion asset', async (): Promise<void> => {
    const { files } = await runWebpackAsync({ inlineShortLicenses: true });

    expect(files['bundle.js']!.startsWith(LICENSE)).toBe(true);
    expect(Object.keys(files)).toEqual(['bundle.js']);
    expect(files['bundle.js']).not.toContain('For license information please see');
  });

  it.each([-1, 0, 1])(
    'compares complete UTF-8 byte lengths (difference %i)',
    async (difference: number): Promise<void> => {
      const license: string = `/*! ${'x'.repeat(Buffer.byteLength(BANNER) - 8 + difference)} */\n`;
      expect(Buffer.byteLength(license)).toBe(Buffer.byteLength(BANNER) + difference);
      const { files } = await runWebpackAsync({
        inlineShortLicenses: true,
        entry: `${license}${CODE}`
      });

      if (difference < 0) {
        expect(files['bundle.js']!.startsWith(license)).toBe(true);
        expect(files['bundle.js.LICENSE.txt']).toBeUndefined();
      } else {
        expect(files['bundle.js']!.startsWith(BANNER)).toBe(true);
        expect(files['bundle.js.LICENSE.txt']).toBe(license);
      }
    }
  );

  it('does not confuse Unicode character counts with byte lengths', async (): Promise<void> => {
    const license: string = `/*! ${'\u00a9'.repeat(40)} */\n`;
    expect(license.length).toBeLessThan(BANNER.length);
    expect(Buffer.byteLength(license)).toBeGreaterThan(Buffer.byteLength(BANNER));
    const { files } = await runWebpackAsync({
      inlineShortLicenses: true,
      entry: `${license}${CODE}`
    });

    expect(files['bundle.js']!.startsWith(BANNER)).toBe(true);
    expect(files['bundle.js.LICENSE.txt']).toBe(license);
  });

  it('measures the combined deduplicated license text', async (): Promise<void> => {
    const license: string = `/*! @license ${'x'.repeat(25)} */\n`;
    expect(Buffer.byteLength(license)).toBeLessThan(Buffer.byteLength(BANNER));
    expect(Buffer.byteLength(license.repeat(2))).toBeGreaterThan(Buffer.byteLength(BANNER));
    const { files } = await runWebpackAsync({
      inlineShortLicenses: true,
      entry: `${license}import { value } from './value.js'; console.log(value);`,
      modules: { '/value.js': `${license}export const value = 42;` }
    });

    expect(files['bundle.js']!.startsWith(license)).toBe(true);
    expect(files['bundle.js']!.split(license)).toHaveLength(2);
    expect(files['bundle.js.LICENSE.txt']).toBeUndefined();
  });

  it('keeps distinct notices external when their combined text is larger', async (): Promise<void> => {
    const first: string = `/*! @license ${'a'.repeat(25)} */\n`;
    const second: string = `/*! @license ${'b'.repeat(25)} */\n`;
    const { files } = await runWebpackAsync({
      inlineShortLicenses: true,
      entry: `${first}${second}${CODE}`
    });

    expect(files['bundle.js']!.startsWith(BANNER)).toBe(true);
    expect(files['bundle.js.LICENSE.txt']).toBe(`${first}${second}`);
  });

  it('preserves line and block comments together', async (): Promise<void> => {
    const license: string = `// @license Example\n${LICENSE}`;
    const { files } = await runWebpackAsync({
      inlineShortLicenses: true,
      entry: `${license}${CODE}`
    });

    expect(files['bundle.js']!.startsWith(license)).toBe(true);
    expect(files['bundle.js.LICENSE.txt']).toBeUndefined();
  });

  it('does not emit a banner or empty license file without license comments', async (): Promise<void> => {
    const { files } = await runWebpackAsync({ inlineShortLicenses: true, entry: CODE });

    expect(Object.keys(files)).toEqual(['bundle.js']);
    expect(files['bundle.js']).not.toContain('For license information please see');
  });

  it('uses the actual nested chunk filename for the comparison', async (): Promise<void> => {
    const license: string = `/*! ${'x'.repeat(Buffer.byteLength(BANNER) - 8)} */\n`;
    const { files } = await runWebpackAsync({
      inlineShortLicenses: true,
      entry: `${license}${CODE}`,
      filename: 'nested/bundle.[contenthash:8].js'
    });
    const names: string[] = Object.keys(files);

    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^nested\/bundle\.[a-f0-9]{8}\.js$/);
    expect(files[names[0]!]!.startsWith(license)).toBe(true);
  });

  it('includes the option in content hashes', async (): Promise<void> => {
    const filename: string = 'bundle.[contenthash:8].js';
    const { files: external } = await runWebpackAsync({ filename });
    const { files: inline } = await runWebpackAsync({ filename, inlineShortLicenses: true });
    const externalName: string = Object.keys(external).find((name: string): boolean => name.endsWith('.js'))!;
    const inlineName: string = Object.keys(inline)[0]!;

    expect(inlineName).not.toBe(externalName);
    expect(inline[inlineName]!.startsWith(LICENSE)).toBe(true);
    expect(external[`${externalName}.LICENSE.txt`]).toBe(LICENSE);
  });

  it('chooses independently for entry and async chunks', async (): Promise<void> => {
    const longLicense: string = `/*! @license ${'Terms. '.repeat(30)} */\n`;
    const { files } = await runWebpackAsync({
      inlineShortLicenses: true,
      entry: `${LICENSE}import(/* webpackChunkName: 'lazy' */ './lazy.js').then(mod => console.log(mod.value));`,
      modules: { '/lazy.js': `${longLicense}export const value = 42;` }
    });
    const asyncName: string = Object.keys(files).find(
      (name: string): boolean => name.endsWith('.js') && name !== 'bundle.js'
    )!;

    expect(files['bundle.js']!.startsWith(LICENSE)).toBe(true);
    expect(files['bundle.js.LICENSE.txt']).toBeUndefined();
    expect(
      files[asyncName]!.startsWith(`/*! For license information please see ${asyncName}.LICENSE.txt */\n`)
    ).toBe(true);
    expect(files[`${asyncName}.LICENSE.txt`]).toBe(longLicense);
  });

  it('preserves source maps for chunks containing only inlined modules', async (): Promise<void> => {
    const license: string = `// @license Example\n${LICENSE}`;
    const options: ITestOptions = { sourceMap: true, entry: `${license}${CODE}` };
    const { files: external } = await runWebpackAsync(options);
    const { files } = await runWebpackAsync({ ...options, inlineShortLicenses: true });
    const externalMap: ISourceMap = JSON.parse(external['bundle.js.map']!);
    const inlineMap: ISourceMap = JSON.parse(files['bundle.js.map']!);
    const { mappings, sources, sourcesContent } = inlineMap;

    expect(files['bundle.js']!.startsWith(license)).toBe(true);
    expect(mappings).toBe(`;${externalMap.mappings}`);
    expect(sources).toEqual(externalMap.sources);
    expect(sourcesContent).toEqual(externalMap.sourcesContent);
  });

  it('adjusts source maps and module-position metadata for the inline banner', async (): Promise<void> => {
    const license: string = `// @license \u00a9 Example\n${LICENSE}`;
    const options: ITestOptions = {
      sourceMap: true,
      entry: `${license}import { value } from './value.js'; console.log(value);`,
      modules: { '/value.js': 'export const value = 42;' }
    };
    const { files: external, compilation: externalCompilation } = await runWebpackAsync(options);
    const { files, compilation } = await runWebpackAsync({ ...options, inlineShortLicenses: true });
    const externalMap: ISourceMap = JSON.parse(external['bundle.js.map']!);
    const inlineMap: ISourceMap = JSON.parse(files['bundle.js.map']!);
    const { mappings, sources, sourcesContent } = inlineMap;

    expect(mappings).toBe(`;${externalMap.mappings}`);
    expect(sources).toEqual(externalMap.sources);
    expect(sourcesContent).toEqual(externalMap.sourcesContent);
    const { metadataByAssetFileName } = ModuleMinifierPlugin.getCompilationStatistics(compilation)!;
    const { metadataByAssetFileName: externalMetadata } =
      ModuleMinifierPlugin.getCompilationStatistics(externalCompilation)!;
    const positions: Map<string | number, IRenderedModulePosition> =
      metadataByAssetFileName.get('bundle.js')!.positionByModuleId;
    const externalPositions: Map<string | number, IRenderedModulePosition> =
      externalMetadata.get('bundle.js')!.positionByModuleId;
    expect(positions.size).toBeGreaterThan(0);
    for (const [moduleId, position] of positions) {
      const { charOffset, charLength } = position;
      const { charOffset: externalOffset, charLength: externalLength } = externalPositions.get(moduleId)!;
      expect(charOffset - externalOffset).toBe(license.length - BANNER.length);
      expect(charLength).toBe(externalLength);
      expect(files['bundle.js']!.slice(charOffset, charOffset + charLength)).toBe(
        external['bundle.js']!.slice(externalOffset, externalOffset + externalLength)
      );
    }
  });
});
