// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';
import { MockScopedLogger } from '@rushstack/heft/lib/pluginFramework/logging/MockScopedLogger';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { SassProcessor } from '../SassProcessor';

const projectFolder: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
const fixturesFolder: string = `${projectFolder}/src/test/fixtures`;

// Fake output folder paths — never actually written to disk because FileSystem.writeFileAsync is mocked.
const CSS_OUTPUT_FOLDER: string = '/fake/output/css';
const DTS_OUTPUT_FOLDER: string = '/fake/output/dts';

function createProcessor(
  terminalProvider: StringBufferTerminalProvider,
  preserveIcssExports: boolean
): {
  processor: SassProcessor;
  logger: MockScopedLogger;
} {
  const terminal: Terminal = new Terminal(terminalProvider);
  const logger: MockScopedLogger = new MockScopedLogger(terminal);

  const processor: SassProcessor = new SassProcessor({
    logger,
    buildFolder: projectFolder,
    concurrency: 1,
    srcFolder: fixturesFolder,
    dtsOutputFolders: [DTS_OUTPUT_FOLDER],
    cssOutputFolders: [{ folder: CSS_OUTPUT_FOLDER, shimModuleFormat: undefined }],
    exportAsDefault: true,
    preserveIcssExports
  });

  return { processor, logger };
}

async function compileFixtureAsync(processor: SassProcessor, fixtureFilename: string): Promise<void> {
  await processor.compileFilesAsync(new Set([`${fixturesFolder}/${fixtureFilename}`]));
}

describe(SassProcessor.name, () => {
  let terminalProvider: StringBufferTerminalProvider;
  /** Files captured by the mocked FileSystem.writeFileAsync, keyed by absolute path. */
  let writtenFiles: Map<string, string>;

  /** Returns the content written to a path whose last segment matches the given filename. */
  function getWrittenFile(filename: string): string {
    for (const [filePath, content] of writtenFiles) {
      if (filePath.endsWith(`/${filename}`)) {
        return content;
      }
    }

    throw new Error(
      `No file written matching ".../${filename}". Written paths:\n${[...writtenFiles.keys()].join('\n')}`
    );
  }

  function getCssOutput(fixtureFilename: string): string {
    // SassProcessor strips the last extension then appends .css
    // export-only.module.scss → export-only.module.css
    const withoutExt: string = fixtureFilename.slice(0, fixtureFilename.lastIndexOf('.'));
    return getWrittenFile(`${withoutExt}.css`);
  }

  function getDtsOutput(fixtureFilename: string): string {
    return getWrittenFile(`${fixtureFilename}.d.ts`);
  }

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider();

    writtenFiles = new Map();
    jest.spyOn(FileSystem, 'writeFileAsync').mockImplementation(async (filePath, content) => {
      writtenFiles.set(filePath as string, content as string);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();

    expect(writtenFiles).toMatchSnapshot('written-files');
    expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot('terminal-output');
  });

  describe('export-only.module.scss', () => {
    it('strips the :export block from CSS when preserveIcssExports is false', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'export-only.module.scss');
      const css: string = getCssOutput('export-only.module.scss');
      expect(css).not.toContain(':export');
    });

    it('preserves the :export block in CSS when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, true);
      await compileFixtureAsync(processor, 'export-only.module.scss');
      const css: string = getCssOutput('export-only.module.scss');
      expect(css).toContain(':export');
    });

    it('generates the same .d.ts regardless of preserveIcssExports', async () => {
      const { processor: processorFalse } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processorFalse, 'export-only.module.scss');
      const dtsFalse: string = getDtsOutput('export-only.module.scss');

      writtenFiles.clear();

      const { processor: processorTrue } = createProcessor(terminalProvider, true);
      await compileFixtureAsync(processorTrue, 'export-only.module.scss');
      const dtsTrue: string = getDtsOutput('export-only.module.scss');

      expect(dtsFalse).toEqual(dtsTrue);
    });
  });

  describe('classes-and-exports.module.scss', () => {
    it('strips the :export block from CSS when preserveIcssExports is false', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const css: string = getCssOutput('classes-and-exports.module.scss');
      expect(css).not.toContain(':export');
      expect(css).toContain('.root');
    });

    it('preserves the :export block in CSS when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, true);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const css: string = getCssOutput('classes-and-exports.module.scss');
      expect(css).toContain(':export');
      expect(css).toContain('.root');
    });

    it('generates correct .d.ts with both class names and :export values', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const dts: string = getDtsOutput('classes-and-exports.module.scss');
      expect(dts).toContain('root');
      expect(dts).toContain('highlighted');
      expect(dts).toContain('themeColor');
      expect(dts).toContain('spacing');
    });
  });

  describe('sass-variables-and-exports.module.scss (Sass variables, nesting, BEM)', () => {
    it('resolves Sass variables and expands nested rules in CSS output', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'sass-variables-and-exports.module.scss');
      const css: string = getCssOutput('sass-variables-and-exports.module.scss');
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
      const { processor } = createProcessor(terminalProvider, true);
      await compileFixtureAsync(processor, 'sass-variables-and-exports.module.scss');
      const css: string = getCssOutput('sass-variables-and-exports.module.scss');
      // The :export block should contain resolved values, not Sass variable names
      expect(css).toContain(':export');
      expect(css).toContain('#0078d4');
      expect(css).not.toContain('$primary-color');
    });

    it('generates .d.ts with resolved :export keys as typed properties', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'sass-variables-and-exports.module.scss');
      const dts: string = getDtsOutput('sass-variables-and-exports.module.scss');
      expect(dts).toContain('container');
      expect(dts).toContain('primaryColor');
      expect(dts).toContain('secondaryColor');
      expect(dts).toContain('baseSpacing');
    });
  });

  describe('mixin-with-exports.module.scss (Sass @mixin)', () => {
    it('expands @mixin calls in CSS output', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const css: string = getCssOutput('mixin-with-exports.module.scss');
      // Mixin output should be inlined — no @mixin or @include in the output
      expect(css).not.toContain('@mixin');
      expect(css).not.toContain('@include');
      expect(css).toContain('display: flex');
      expect(css).toContain('.card');
      expect(css).toContain('.card--vertical');
    });

    it('preserves :export alongside expanded @mixin output when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, true);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const css: string = getCssOutput('mixin-with-exports.module.scss');
      expect(css).toContain(':export');
      expect(css).toContain('display: flex');
      expect(css).not.toContain('@mixin');
    });

    it('generates .d.ts with :export values and class names from @mixin-using file', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const dts: string = getDtsOutput('mixin-with-exports.module.scss');
      expect(dts).toContain('card');
      expect(dts).toContain('cardRadius');
      expect(dts).toContain('animationDuration');
    });
  });

  describe('extend-with-exports.module.scss (Sass @extend / placeholder selectors)', () => {
    it('merges @extend selectors and strips :export when preserveIcssExports is false', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const css: string = getCssOutput('extend-with-exports.module.scss');
      // Placeholder %button-base should not appear literally; its rules should be merged
      expect(css).not.toContain('%button-base');
      expect(css).toContain('.primaryButton');
      expect(css).toContain('.dangerButton');
      expect(css).not.toContain(':export');
    });

    it('preserves :export alongside @extend-merged output when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, true);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const css: string = getCssOutput('extend-with-exports.module.scss');
      expect(css).toContain(':export');
      expect(css).toContain('.primaryButton');
      expect(css).not.toContain('%button-base');
    });

    it('generates .d.ts with class names and :export values for @extend file', async () => {
      const { processor } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const dts: string = getDtsOutput('extend-with-exports.module.scss');
      expect(dts).toContain('primaryButton');
      expect(dts).toContain('dangerButton');
      expect(dts).toContain('colorPrimary');
      expect(dts).toContain('colorDanger');
    });
  });

  describe('error reporting', () => {
    it('emits an error for invalid SCSS syntax', async () => {
      const { processor, logger } = createProcessor(terminalProvider, false);
      await compileFixtureAsync(processor, 'invalid.module.scss');
      expect(logger.errors.length).toBeGreaterThan(0);
    });
  });
});
