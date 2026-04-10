// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import nodeJsPath from 'node:path';

import { FileSystem, Path } from '@rushstack/node-core-library';
import { MockScopedLogger } from '@rushstack/heft/lib/pluginFramework/logging/MockScopedLogger';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { type ICssOutputFolder, type ISassProcessorOptions, SassProcessor } from '../SassProcessor';

const projectFolder: string = path.resolve(__dirname, '../..');
const fixturesFolder: string = path.resolve(__dirname, '../../src/test/fixtures');

// Fake output folder paths - never actually written to disk because FileSystem.writeFileAsync is mocked.
const FAKE_OUTPUT_BASE_FOLDER: string = '/fake/output';
const NORMALIZED_PLATFORM_FAKE_OUTPUT_BASE_FOLDER: string = Path.convertToSlashes(
  nodeJsPath.resolve(FAKE_OUTPUT_BASE_FOLDER)
);
const CSS_OUTPUT_FOLDER: string = `${FAKE_OUTPUT_BASE_FOLDER}/css`;
const DTS_OUTPUT_FOLDER: string = `${FAKE_OUTPUT_BASE_FOLDER}/dts`;

type ICreateProcessorOptions = Partial<
  Pick<
    ISassProcessorOptions,
    | 'cssOutputFolders'
    | 'doNotTrimOriginalFileExtension'
    | 'dtsOutputFolders'
    | 'exportAsDefault'
    | 'fileExtensions'
    | 'nonModuleFileExtensions'
    | 'postProcessCssAsync'
    | 'preserveIcssExports'
    | 'srcFolder'
  >
>;

function createProcessor(
  terminalProvider: StringBufferTerminalProvider,
  options: ICreateProcessorOptions = {}
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
    ...options
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

  /** Returns all paths written that end with the given suffix. */
  function getAllWrittenPathsMatching(suffix: string): string[] {
    return [...writtenFiles.keys()].filter((p) => p.endsWith(suffix));
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

  function getJsShimOutput(fixtureFilename: string): string {
    return getWrittenFile(`${fixtureFilename}.js`);
  }

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider();

    writtenFiles = new Map();
    jest.spyOn(FileSystem, 'writeFileAsync').mockImplementation(async (filePath, content) => {
      filePath = Path.convertToSlashes(filePath).replace(
        NORMALIZED_PLATFORM_FAKE_OUTPUT_BASE_FOLDER,
        FAKE_OUTPUT_BASE_FOLDER
      );
      writtenFiles.set(filePath, String(content));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();

    expect(writtenFiles).toMatchSnapshot('written-files');
    expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot('terminal-output');
  });

  describe('export-only.module.scss', () => {
    it('strips the :export block from CSS when preserveIcssExports is false', async () => {
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'export-only.module.scss');
      const css: string = getCssOutput('export-only.module.scss');
      expect(css).not.toContain(':export');
    });

    it('preserves the :export block in CSS when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, { preserveIcssExports: true });
      await compileFixtureAsync(processor, 'export-only.module.scss');
      const css: string = getCssOutput('export-only.module.scss');
      expect(css).toContain(':export');
    });

    it('generates the same .d.ts regardless of preserveIcssExports', async () => {
      const { processor: processorFalse } = createProcessor(terminalProvider);
      await compileFixtureAsync(processorFalse, 'export-only.module.scss');
      const dtsFalse: string = getDtsOutput('export-only.module.scss');

      writtenFiles.clear();

      const { processor: processorTrue } = createProcessor(terminalProvider, {
        preserveIcssExports: true
      });
      await compileFixtureAsync(processorTrue, 'export-only.module.scss');
      const dtsTrue: string = getDtsOutput('export-only.module.scss');

      expect(dtsFalse).toEqual(dtsTrue);
    });
  });

  describe('classes-and-exports.module.scss', () => {
    it('strips the :export block from CSS when preserveIcssExports is false', async () => {
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const css: string = getCssOutput('classes-and-exports.module.scss');
      expect(css).not.toContain(':export');
      expect(css).toContain('.root');
    });

    it('preserves the :export block in CSS when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, { preserveIcssExports: true });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const css: string = getCssOutput('classes-and-exports.module.scss');
      expect(css).toContain(':export');
      expect(css).toContain('.root');
    });

    it('generates correct .d.ts with both class names and :export values', async () => {
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const dts: string = getDtsOutput('classes-and-exports.module.scss');
      expect(dts).toContain('root');
      expect(dts).toContain('highlighted');
      expect(dts).toContain('themeColor');
      expect(dts).toContain('spacing');
    });

    it('generates named exports in .d.ts when exportAsDefault is false', async () => {
      // cssOutputFolders requires exportAsDefault: true, so omit it here
      const { processor } = createProcessor(terminalProvider, {
        exportAsDefault: false,
        cssOutputFolders: []
      });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const dts: string = getDtsOutput('classes-and-exports.module.scss');
      // Named exports: "export const root: string;" instead of a default interface
      expect(dts).toContain('export const root');
      expect(dts).toContain('export const highlighted');
      expect(dts).toContain('export const themeColor');
      expect(dts).not.toContain('export default');
    });
  });

  describe('sass-variables-and-exports.module.scss (Sass variables, nesting, BEM)', () => {
    it('resolves Sass variables and expands nested rules in CSS output', async () => {
      const { processor } = createProcessor(terminalProvider);
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
      const { processor } = createProcessor(terminalProvider, { preserveIcssExports: true });
      await compileFixtureAsync(processor, 'sass-variables-and-exports.module.scss');
      const css: string = getCssOutput('sass-variables-and-exports.module.scss');
      // The :export block should contain resolved values, not Sass variable names
      expect(css).toContain(':export');
      expect(css).toContain('#0078d4');
      expect(css).not.toContain('$primary-color');
    });

    it('generates .d.ts with resolved :export keys as typed properties', async () => {
      const { processor } = createProcessor(terminalProvider);
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
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const css: string = getCssOutput('mixin-with-exports.module.scss');
      // Mixin output should be inlined - no @mixin or @include in the output
      expect(css).not.toContain('@mixin');
      expect(css).not.toContain('@include');
      expect(css).toContain('display: flex');
      expect(css).toContain('.card');
      expect(css).toContain('.card--vertical');
    });

    it('preserves :export alongside expanded @mixin output when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, { preserveIcssExports: true });
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const css: string = getCssOutput('mixin-with-exports.module.scss');
      expect(css).toContain(':export');
      expect(css).toContain('display: flex');
      expect(css).not.toContain('@mixin');
    });

    it('generates .d.ts with :export values and class names from @mixin-using file', async () => {
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'mixin-with-exports.module.scss');
      const dts: string = getDtsOutput('mixin-with-exports.module.scss');
      expect(dts).toContain('card');
      expect(dts).toContain('cardRadius');
      expect(dts).toContain('animationDuration');
    });
  });

  describe('extend-with-exports.module.scss (Sass @extend / placeholder selectors)', () => {
    it('merges @extend selectors and strips :export when preserveIcssExports is false', async () => {
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const css: string = getCssOutput('extend-with-exports.module.scss');
      // Placeholder %button-base should not appear literally; its rules should be merged
      expect(css).not.toContain('%button-base');
      expect(css).toContain('.primaryButton');
      expect(css).toContain('.dangerButton');
      expect(css).not.toContain(':export');
    });

    it('preserves :export alongside @extend-merged output when preserveIcssExports is true', async () => {
      const { processor } = createProcessor(terminalProvider, { preserveIcssExports: true });
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const css: string = getCssOutput('extend-with-exports.module.scss');
      expect(css).toContain(':export');
      expect(css).toContain('.primaryButton');
      expect(css).not.toContain('%button-base');
    });

    it('generates .d.ts with class names and :export values for @extend file', async () => {
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'extend-with-exports.module.scss');
      const dts: string = getDtsOutput('extend-with-exports.module.scss');
      expect(dts).toContain('primaryButton');
      expect(dts).toContain('dangerButton');
      expect(dts).toContain('colorPrimary');
      expect(dts).toContain('colorDanger');
    });
  });

  describe('JS shim files', () => {
    it('emits a CommonJS shim for a module file', async () => {
      const { processor } = createProcessor(terminalProvider, {
        cssOutputFolders: [{ folder: CSS_OUTPUT_FOLDER, shimModuleFormat: 'commonjs' }]
      });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const shim: string = getJsShimOutput('classes-and-exports.module.scss');
      // CJS module shim re-exports from the CSS file and mirrors it as .default
      expect(shim).toContain(`require("./classes-and-exports.module.css")`);
      expect(shim).toContain('module.exports.default = module.exports');
    });

    it('emits an ESM shim for a module file', async () => {
      const { processor } = createProcessor(terminalProvider, {
        cssOutputFolders: [{ folder: CSS_OUTPUT_FOLDER, shimModuleFormat: 'esnext' }]
      });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const shim: string = getJsShimOutput('classes-and-exports.module.scss');
      // ESM module shim re-exports the default from the CSS file
      expect(shim).toBe(`export { default } from "./classes-and-exports.module.css";`);
    });

    it('emits a CommonJS shim for a non-module (global) file', async () => {
      const { processor } = createProcessor(terminalProvider, {
        cssOutputFolders: [{ folder: CSS_OUTPUT_FOLDER, shimModuleFormat: 'commonjs' }],
        // Register the .global.scss extension so the processor classifies it correctly
        nonModuleFileExtensions: ['.global.scss']
      });
      await compileFixtureAsync(processor, 'global-styles.global.scss');
      const shim: string = getJsShimOutput('global-styles.global.scss');
      // CJS non-module shim: side-effect require only
      expect(shim).toBe(`require("./global-styles.global.css");`);
    });

    it('emits an ESM shim for a non-module (global) file', async () => {
      const { processor } = createProcessor(terminalProvider, {
        cssOutputFolders: [{ folder: CSS_OUTPUT_FOLDER, shimModuleFormat: 'esnext' }],
        nonModuleFileExtensions: ['.global.scss']
      });
      await compileFixtureAsync(processor, 'global-styles.global.scss');
      const shim: string = getJsShimOutput('global-styles.global.scss');
      // ESM non-module shim: side-effect import only
      expect(shim).toBe(`import "./global-styles.global.css";export {};`);
    });

    it('does not emit a shim when shimModuleFormat is undefined', async () => {
      const { processor } = createProcessor(terminalProvider, {
        cssOutputFolders: [{ folder: CSS_OUTPUT_FOLDER, shimModuleFormat: undefined }]
      });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      // Only the CSS and DTS files should be written - no .js shim
      const shimPaths: string[] = getAllWrittenPathsMatching('.module.scss.js');
      expect(shimPaths).toHaveLength(0);
    });

    it('writes shims to each configured cssOutputFolder independently', async () => {
      const CSS_FOLDER_ESM: string = '/fake/output/css-esm';
      const CSS_FOLDER_CJS: string = '/fake/output/css-cjs';
      const cssOutputFolders: ICssOutputFolder[] = [
        { folder: CSS_FOLDER_ESM, shimModuleFormat: 'esnext' },
        { folder: CSS_FOLDER_CJS, shimModuleFormat: 'commonjs' }
      ];
      const { processor } = createProcessor(terminalProvider, { cssOutputFolders });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');

      const esmShim: string = writtenFiles.get(`${CSS_FOLDER_ESM}/classes-and-exports.module.scss.js`)!;
      const cjsShim: string = writtenFiles.get(`${CSS_FOLDER_CJS}/classes-and-exports.module.scss.js`)!;

      expect(esmShim).toBe(`export { default } from "./classes-and-exports.module.css";`);
      expect(cjsShim).toContain('module.exports.default = module.exports');
    });
  });

  describe('non-module (global) files', () => {
    it('emits plain compiled CSS for a .global.scss file', async () => {
      const { processor } = createProcessor(terminalProvider, {
        nonModuleFileExtensions: ['.global.scss']
      });
      await compileFixtureAsync(processor, 'global-styles.global.scss');
      const css: string = getCssOutput('global-styles.global.scss');
      // Variables should be resolved; selectors should be present
      expect(css).toContain('body');
      expect(css).toContain('h1');
      expect(css).toContain('font-family');
      expect(css).not.toContain('$body-font');
    });

    it('emits export {}; in the .d.ts for a non-module file', async () => {
      const { processor } = createProcessor(terminalProvider, {
        nonModuleFileExtensions: ['.global.scss']
      });
      await compileFixtureAsync(processor, 'global-styles.global.scss');
      const dts: string = getDtsOutput('global-styles.global.scss');
      expect(dts).toBe('export {};');
    });
  });

  describe('multiple output folders', () => {
    it('writes .d.ts to every configured dtsOutputFolder', async () => {
      const DTS_FOLDER_A: string = '/fake/output/dts-a';
      const DTS_FOLDER_B: string = '/fake/output/dts-b';
      const { processor } = createProcessor(terminalProvider, {
        dtsOutputFolders: [DTS_FOLDER_A, DTS_FOLDER_B]
      });
      await compileFixtureAsync(processor, 'export-only.module.scss');

      const dtsA: string = writtenFiles.get(`${DTS_FOLDER_A}/export-only.module.scss.d.ts`)!;
      const dtsB: string = writtenFiles.get(`${DTS_FOLDER_B}/export-only.module.scss.d.ts`)!;

      expect(dtsA).toBeDefined();
      expect(dtsA).toEqual(dtsB);
    });

    it('writes CSS to every configured cssOutputFolder', async () => {
      const CSS_FOLDER_A: string = '/fake/output/css-a';
      const CSS_FOLDER_B: string = '/fake/output/css-b';
      const { processor } = createProcessor(terminalProvider, {
        cssOutputFolders: [
          { folder: CSS_FOLDER_A, shimModuleFormat: undefined },
          { folder: CSS_FOLDER_B, shimModuleFormat: undefined }
        ]
      });
      await compileFixtureAsync(processor, 'export-only.module.scss');

      const cssA: string = writtenFiles.get(`${CSS_FOLDER_A}/export-only.module.css`)!;
      const cssB: string = writtenFiles.get(`${CSS_FOLDER_B}/export-only.module.css`)!;

      expect(cssA).toBeDefined();
      expect(cssA).toEqual(cssB);
    });
  });

  describe('postProcessCssAsync', () => {
    it('passes compiled CSS through the post-processor callback', async () => {
      const postProcessed: string[] = [];
      const { processor } = createProcessor(terminalProvider, {
        postProcessCssAsync: async (css: string) => {
          postProcessed.push(css);
          return css.replace(/color:/g, 'color: /* post-processed */');
        }
      });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');

      // The callback should have been called with the raw CSS
      expect(postProcessed.length).toBe(1);
      expect(postProcessed[0]).toContain('color:');

      // The emitted CSS should reflect the transformation
      const css: string = getCssOutput('classes-and-exports.module.scss');
      expect(css).toContain('color: /* post-processed */');
    });

    it('post-processor runs after postcss-modules strips :export', async () => {
      const seenCss: string[] = [];
      const { processor } = createProcessor(terminalProvider, {
        postProcessCssAsync: async (css: string) => {
          seenCss.push(css);
          return css;
        }
      });
      await compileFixtureAsync(processor, 'export-only.module.scss');

      // With preserveIcssExports: false (default), the CSS seen by the callback
      // should already have the :export block stripped
      expect(seenCss[0]).not.toContain(':export');
    });

    it('post-processor receives the original CSS including :export when preserveIcssExports is true', async () => {
      const seenCss: string[] = [];
      const { processor } = createProcessor(terminalProvider, {
        preserveIcssExports: true,
        postProcessCssAsync: async (css: string) => {
          seenCss.push(css);
          return css;
        }
      });
      await compileFixtureAsync(processor, 'export-only.module.scss');

      expect(seenCss[0]).toContain(':export');
    });
  });

  describe('doNotTrimOriginalFileExtension', () => {
    it('strips the source extension by default (doNotTrimOriginalFileExtension: false)', async () => {
      const { processor } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      // Default: "classes-and-exports.module.scss" → "classes-and-exports.module.css"
      const css: string = writtenFiles.get(`${CSS_OUTPUT_FOLDER}/classes-and-exports.module.css`)!;
      expect(css).toBeDefined();
      expect(writtenFiles.has(`${CSS_OUTPUT_FOLDER}/classes-and-exports.module.scss.css`)).toBe(false);
    });

    it('preserves the source extension when doNotTrimOriginalFileExtension is true', async () => {
      const { processor } = createProcessor(terminalProvider, { doNotTrimOriginalFileExtension: true });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      // "classes-and-exports.module.scss" → "classes-and-exports.module.scss.css"
      const css: string = writtenFiles.get(`${CSS_OUTPUT_FOLDER}/classes-and-exports.module.scss.css`)!;
      expect(css).toBeDefined();
      expect(writtenFiles.has(`${CSS_OUTPUT_FOLDER}/classes-and-exports.module.css`)).toBe(false);
    });

    it('uses the .scss.css filename in JS shims when doNotTrimOriginalFileExtension is true', async () => {
      const { processor } = createProcessor(terminalProvider, {
        doNotTrimOriginalFileExtension: true,
        cssOutputFolders: [{ folder: CSS_OUTPUT_FOLDER, shimModuleFormat: 'commonjs' }]
      });
      await compileFixtureAsync(processor, 'classes-and-exports.module.scss');
      const shim: string = writtenFiles.get(`${CSS_OUTPUT_FOLDER}/classes-and-exports.module.scss.js`)!;
      expect(shim).toContain(`require("./classes-and-exports.module.scss.css")`);
    });

    it('the CSS content is the same regardless of doNotTrimOriginalFileExtension', async () => {
      const { processor: processorDefault } = createProcessor(terminalProvider);
      await compileFixtureAsync(processorDefault, 'classes-and-exports.module.scss');
      const cssDefault: string = writtenFiles.get(`${CSS_OUTPUT_FOLDER}/classes-and-exports.module.css`)!;

      writtenFiles.clear();

      const { processor: processorPreserve } = createProcessor(terminalProvider, {
        doNotTrimOriginalFileExtension: true
      });
      await compileFixtureAsync(processorPreserve, 'classes-and-exports.module.scss');
      const cssPreserve: string = writtenFiles.get(
        `${CSS_OUTPUT_FOLDER}/classes-and-exports.module.scss.css`
      )!;

      expect(cssDefault).toEqual(cssPreserve);
    });
  });

  describe('error reporting', () => {
    it('emits an error for invalid SCSS syntax', async () => {
      const { processor, logger } = createProcessor(terminalProvider);
      await compileFixtureAsync(processor, 'invalid.module.scss');
      expect(logger.errors.length).toBeGreaterThan(0);
    });
  });
});
