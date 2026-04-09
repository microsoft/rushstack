// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';
import { MockScopedLogger } from '@rushstack/heft/lib/pluginFramework/logging/MockScopedLogger';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { SassProcessor } from '../SassProcessor';

const projectFolder: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
const fixturesFolder: string = `${projectFolder}/src/test/fixtures`;
const testOutputFolder: string = `${projectFolder}/temp/test-output`;

function createProcessor(preserveIcssExports: boolean): {
  processor: SassProcessor;
  dtsOutputFolder: string;
  cssOutputFolder: string;
  logger: MockScopedLogger;
} {
  const suffix: string = preserveIcssExports ? 'preserve' : 'strip';
  const dtsOutputFolder: string = `${testOutputFolder}/${suffix}/dts`;
  const cssOutputFolder: string = `${testOutputFolder}/${suffix}/css`;

  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider(false);
  const terminal: Terminal = new Terminal(terminalProvider);
  const logger: MockScopedLogger = new MockScopedLogger(terminal);

  const processor: SassProcessor = new SassProcessor({
    logger,
    buildFolder: projectFolder,
    concurrency: 1,
    srcFolder: fixturesFolder,
    dtsOutputFolders: [dtsOutputFolder],
    cssOutputFolders: [{ folder: cssOutputFolder, shimModuleFormat: undefined }],
    exportAsDefault: true,
    preserveIcssExports
  });

  return { processor, dtsOutputFolder, cssOutputFolder, logger };
}

async function compileFixtureAsync(processor: SassProcessor, fixtureFilename: string): Promise<void> {
  const absolutePath: string = `${fixturesFolder}/${fixtureFilename}`;
  await processor.compileFilesAsync(new Set([absolutePath]));
}

async function readCssOutputAsync(cssOutputFolder: string, fixtureFilename: string): Promise<string> {
  // Strip last extension (.scss/.sass), append .css
  const withoutExt: string = fixtureFilename.slice(0, fixtureFilename.lastIndexOf('.'));
  return await FileSystem.readFileAsync(`${cssOutputFolder}/${withoutExt}.css`);
}

async function readDtsOutputAsync(dtsOutputFolder: string, fixtureFilename: string): Promise<string> {
  return await FileSystem.readFileAsync(`${dtsOutputFolder}/${fixtureFilename}.d.ts`);
}

describe(SassProcessor.name, () => {
  beforeEach(async () => {
    await FileSystem.ensureEmptyFolderAsync(testOutputFolder);
  });

  describe('export-only.module.scss', () => {
    it('strips the :export block from CSS when preserveIcssExports is false', async () => {
      const { processor, cssOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'export-only.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'export-only.module.scss');
      expect(css).toMatchSnapshot();
      expect(css).not.toContain(':export');
    });

    it('preserves the :export block in CSS when preserveIcssExports is true', async () => {
      const { processor, cssOutputFolder } = createProcessor(true);
      await compileFixtureAsync(processor, 'export-only.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'export-only.module.scss');
      expect(css).toMatchSnapshot();
      expect(css).toContain(':export');
    });

    it('generates the same .d.ts regardless of preserveIcssExports', async () => {
      const { processor: processorFalse, dtsOutputFolder: dtsFalseFolder } = createProcessor(false);
      const { processor: processorTrue, dtsOutputFolder: dtsTrueFolder } = createProcessor(true);

      await compileFixtureAsync(processorFalse, 'export-only.module.scss');
      await compileFixtureAsync(processorTrue, 'export-only.module.scss');

      const dtsFalse: string = await readDtsOutputAsync(dtsFalseFolder, 'export-only.module.scss');
      const dtsTrue: string = await readDtsOutputAsync(dtsTrueFolder, 'export-only.module.scss');

      expect(dtsFalse).toMatchSnapshot();
      expect(dtsFalse).toEqual(dtsTrue);
    });
  });

  describe('classes-and-exports.module.scss', () => {
    it('strips the :export block from CSS when preserveIcssExports is false', async () => {
      const { processor, cssOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'classes-and-exports.module.scss');
      expect(css).toMatchSnapshot();
      expect(css).not.toContain(':export');
      expect(css).toContain('.root');
    });

    it('preserves the :export block in CSS when preserveIcssExports is true', async () => {
      const { processor, cssOutputFolder } = createProcessor(true);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'classes-and-exports.module.scss');
      expect(css).toMatchSnapshot();
      expect(css).toContain(':export');
      expect(css).toContain('.root');
    });

    it('generates correct .d.ts with both class names and :export values', async () => {
      const { processor, dtsOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const dts: string = await readDtsOutputAsync(dtsOutputFolder, 'classes-and-exports.module.scss');
      expect(dts).toMatchSnapshot();
      expect(dts).toContain('root');
      expect(dts).toContain('highlighted');
      expect(dts).toContain('themeColor');
      expect(dts).toContain('spacing');
    });
  });

  describe('sass-variables-and-exports.module.scss (Sass variables, nesting, BEM)', () => {
    it('resolves Sass variables and expands nested rules in CSS output', async () => {
      const { processor, cssOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'sass-variables-and-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'sass-variables-and-exports.module.scss');
      expect(css).toMatchSnapshot();
      // Sass variables should be resolved to literal values
      expect(css).toContain('#0078d4');
      expect(css).toContain('#106ebe');
      // Nested rules should be expanded
      expect(css).toContain('.container:hover');
      expect(css).toContain('.container__title');
      // :export block should be stripped (preserveIcssExports: false)
      expect(css).not.toContain(':export');
    });

    it('resolves Sass variables inside the :export block when preserveIcssExports is true', async () => {
      const { processor, cssOutputFolder } = createProcessor(true);
      await compileFixtureAsync(processor, 'sass-variables-and-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'sass-variables-and-exports.module.scss');
      expect(css).toMatchSnapshot();
      // The :export block should contain the resolved variable values, not the variable names
      expect(css).toContain(':export');
      expect(css).toContain('#0078d4');
      expect(css).not.toContain('$primary-color');
    });

    it('generates .d.ts with resolved :export keys as typed properties', async () => {
      const { processor, dtsOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'sass-variables-and-exports.module.scss');
      const dts: string = await readDtsOutputAsync(dtsOutputFolder, 'sass-variables-and-exports.module.scss');
      expect(dts).toMatchSnapshot();
      expect(dts).toContain('container');
      expect(dts).toContain('primaryColor');
      expect(dts).toContain('secondaryColor');
      expect(dts).toContain('baseSpacing');
    });
  });

  describe('mixin-with-exports.module.scss (Sass @mixin)', () => {
    it('expands @mixin calls in CSS output', async () => {
      const { processor, cssOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'mixin-with-exports.module.scss');
      expect(css).toMatchSnapshot();
      // Mixin output should be inlined — no @mixin or @include in the output
      expect(css).not.toContain('@mixin');
      expect(css).not.toContain('@include');
      expect(css).toContain('display: flex');
      expect(css).toContain('.card');
      expect(css).toContain('.card--vertical');
    });

    it('preserves :export alongside expanded @mixin output when preserveIcssExports is true', async () => {
      const { processor, cssOutputFolder } = createProcessor(true);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'mixin-with-exports.module.scss');
      expect(css).toMatchSnapshot();
      expect(css).toContain(':export');
      expect(css).toContain('display: flex');
      expect(css).not.toContain('@mixin');
    });

    it('generates .d.ts with :export values and class names from @mixin-using file', async () => {
      const { processor, dtsOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const dts: string = await readDtsOutputAsync(dtsOutputFolder, 'mixin-with-exports.module.scss');
      expect(dts).toMatchSnapshot();
      expect(dts).toContain('card');
      expect(dts).toContain('cardRadius');
      expect(dts).toContain('animationDuration');
    });
  });

  describe('extend-with-exports.module.scss (Sass @extend / placeholder selectors)', () => {
    it('merges @extend selectors and strips :export when preserveIcssExports is false', async () => {
      const { processor, cssOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'extend-with-exports.module.scss');
      expect(css).toMatchSnapshot();
      // Placeholder %button-base should not appear literally; its rules should be merged into the
      // selectors that @extend it
      expect(css).not.toContain('%button-base');
      expect(css).toContain('.primaryButton');
      expect(css).toContain('.dangerButton');
      expect(css).not.toContain(':export');
    });

    it('preserves :export alongside @extend-merged output when preserveIcssExports is true', async () => {
      const { processor, cssOutputFolder } = createProcessor(true);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const css: string = await readCssOutputAsync(cssOutputFolder, 'extend-with-exports.module.scss');
      expect(css).toMatchSnapshot();
      expect(css).toContain(':export');
      expect(css).toContain('.primaryButton');
      expect(css).not.toContain('%button-base');
    });

    it('generates .d.ts with class names and :export values for @extend file', async () => {
      const { processor, dtsOutputFolder } = createProcessor(false);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const dts: string = await readDtsOutputAsync(dtsOutputFolder, 'extend-with-exports.module.scss');
      expect(dts).toMatchSnapshot();
      expect(dts).toContain('primaryButton');
      expect(dts).toContain('dangerButton');
      expect(dts).toContain('colorPrimary');
      expect(dts).toContain('colorDanger');
    });
  });

  describe('error reporting', () => {
    it('emits an error for invalid SCSS syntax', async () => {
      // Write a temporary invalid fixture to disk, compile it, then clean up.
      const invalidFixturePath: string = `${fixturesFolder}/invalid.module.scss`;
      await FileSystem.writeFileAsync(invalidFixturePath, '.broken { color: ; }');

      const { processor, logger } = createProcessor(false);
      try {
        await processor.compileFilesAsync(new Set([invalidFixturePath]));
      } finally {
        await FileSystem.deleteFileAsync(invalidFixturePath);
      }

      expect(logger.errors.length).toBeGreaterThan(0);
    });
  });
});
