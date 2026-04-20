// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunIncrementalHookOptions,
  IWatchedFileState
} from '@rushstack/heft';
import type { ITerminal } from '@rushstack/terminal';

import { ZodSchemaGenerator, type IGeneratedSchema } from './ZodSchemaGenerator';

const PLUGIN_NAME: 'zod-schema-plugin' = 'zod-schema-plugin';

const DEFAULT_INPUT_GLOBS: readonly string[] = ['lib/schemas/*.zod.js'];
const DEFAULT_OUTPUT_FOLDER: 'lib/schemas' = 'lib/schemas';
const DEFAULT_EXPORT_NAME: 'default' = 'default';
const DEFAULT_INDENT: 2 = 2;

/**
 * Options for `@rushstack/heft-zod-schema-plugin`.
 *
 * @public
 */
export interface IHeftZodSchemaPluginOptions {
  /**
   * Globs (relative to the project folder) identifying compiled JavaScript modules
   * that export zod schemas.  Defaults to `["lib/schemas/*.zod.js"]`.
   */
  inputGlobs?: string[];

  /**
   * Folder (relative to the project folder) where the generated `*.schema.json`
   * files will be written.  Defaults to `"lib/schemas"`.
   */
  outputFolder?: string;

  /**
   * The name of the export to read from each module.  Use `"default"` (the default)
   * to read the default export, or `"*"` to emit one schema file per named
   * `ZodType` export.
   */
  exportName?: string;

  /**
   * Number of spaces to indent the generated JSON.  Defaults to `2`.
   */
  indent?: number;
}

/**
 * A Heft task plugin that converts zod validators into `*.schema.json` build
 * outputs.  See `README.md` for usage details.
 *
 * @public
 */
export default class HeftZodSchemaPlugin implements IHeftTaskPlugin<IHeftZodSchemaPluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IHeftZodSchemaPluginOptions
  ): void {
    const {
      logger: { terminal },
      hooks: { run, runIncremental }
    } = taskSession;
    const { buildFolderPath } = heftConfiguration;

    const inputGlobs: string[] =
      options.inputGlobs && options.inputGlobs.length > 0
        ? options.inputGlobs
        : [...DEFAULT_INPUT_GLOBS];
    const outputFolder: string = options.outputFolder ?? DEFAULT_OUTPUT_FOLDER;
    const exportName: string = options.exportName ?? DEFAULT_EXPORT_NAME;
    const indent: number = options.indent ?? DEFAULT_INDENT;

    const generator: ZodSchemaGenerator = new ZodSchemaGenerator({
      buildFolderPath,
      inputGlobs,
      outputFolder,
      exportName,
      indent,
      terminal
    });

    run.tapPromise(PLUGIN_NAME, async () => {
      await this._runGeneratorAsync(generator, terminal);
    });

    runIncremental.tapPromise(
      PLUGIN_NAME,
      async (runIncrementalOptions: IHeftTaskRunIncrementalHookOptions) => {
        const matched: Map<string, IWatchedFileState> = await runIncrementalOptions.watchGlobAsync(
          inputGlobs,
          {
            cwd: buildFolderPath,
            absolute: false
          }
        );
        let anyChanged: boolean = false;
        for (const [, { changed }] of matched) {
          if (changed) {
            anyChanged = true;
            break;
          }
        }
        if (!anyChanged) {
          return;
        }
        await this._runGeneratorAsync(generator, terminal);
      }
    );
  }

  private async _runGeneratorAsync(
    generator: ZodSchemaGenerator,
    terminal: ITerminal
  ): Promise<void> {
    terminal.writeLine('Generating JSON schemas from zod validators...');
    const results: IGeneratedSchema[] = await generator.generateAsync();
    if (results.length === 0) {
      terminal.writeWarningLine('No zod schema modules matched the configured input globs.');
      return;
    }
    let writtenCount: number = 0;
    for (const result of results) {
      if (result.wasWritten) {
        writtenCount++;
        terminal.writeVerboseLine(`Wrote ${path.relative(process.cwd(), result.outputFilePath)}`);
      }
    }
    terminal.writeLine(
      `Generated ${results.length} schema(s) (${writtenCount} written, ` +
        `${results.length - writtenCount} unchanged).`
    );
  }
}
