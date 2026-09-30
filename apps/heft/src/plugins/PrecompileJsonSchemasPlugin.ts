// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonSchema } from '@rushstack/node-core-library';

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';
import type { IRunScriptOptions } from './RunScriptPlugin';

interface IPrecompileJsonSchemasPluginOptions {
  sourceFolder: string;
  destinationFolders?: string[];
  esmDestinationFolders?: string[];
}

const PLUGIN_NAME: 'precompile-json-schemas-plugin' = 'precompile-json-schemas-plugin';

async function precompileSchemasAsync(
  buildFolderPath: string,
  options: IPrecompileJsonSchemasPluginOptions,
  runOptions: IHeftTaskRunHookOptions
): Promise<number> {
  const sourceFolder: string = path.resolve(buildFolderPath, options.sourceFolder);
  const schemaPaths: string[] = await runOptions.globAsync('**/*.schema.json', {
    cwd: sourceFolder,
    absolute: true
  });

  for (const schemaPath of schemaPaths) {
    try {
      const relativePath: string = path
        .relative(sourceFolder, schemaPath)
        .replace(/\.schema\.json$/, '.validator.js');
      if (options.destinationFolders?.length) {
        const validatorCode: string = JsonSchema.compileStandaloneCodeFromFile(schemaPath);
        for (const destinationFolder of options.destinationFolders) {
          const destinationPath: string = path.resolve(buildFolderPath, destinationFolder, relativePath);
          await FileSystem.writeFileAsync(destinationPath, validatorCode, { ensureFolderExists: true });
        }
      }
      if (options.esmDestinationFolders?.length) {
        const esmCode: string = JsonSchema.compileStandaloneCodeFromFile(schemaPath, undefined, {
          moduleFormat: 'esm'
        });
        for (const destinationFolder of options.esmDestinationFolders) {
          const destinationPath: string = path.resolve(buildFolderPath, destinationFolder, relativePath);
          await FileSystem.writeFileAsync(destinationPath, esmCode, { ensureFolderExists: true });
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to precompile "${schemaPath}". External $ref dependencies must be supplied explicitly ` +
          'and are not supported by this plugin.',
        { cause: error }
      );
    }
  }
  return schemaPaths.length;
}

// The Heft package builds itself using the previously published version of Heft. Until that
// version includes this plugin, its run-script-plugin invokes this entry point after TypeScript emits it.
export async function runAsync(options: IRunScriptOptions): Promise<void> {
  const { sourceFolder, destinationFolders, esmDestinationFolders } = options.scriptOptions;
  if (
    typeof sourceFolder !== 'string' ||
    (destinationFolders !== undefined &&
      (!Array.isArray(destinationFolders) ||
        !destinationFolders.every((folder: unknown) => typeof folder === 'string'))) ||
    (esmDestinationFolders !== undefined &&
      (!Array.isArray(esmDestinationFolders) ||
        !esmDestinationFolders.every((folder: unknown) => typeof folder === 'string'))) ||
    !(destinationFolders?.length || esmDestinationFolders?.length)
  ) {
    throw new Error('Invalid schema precompilation script options');
  }
  const count: number = await precompileSchemasAsync(
    options.heftConfiguration.buildFolderPath,
    { sourceFolder, destinationFolders, esmDestinationFolders },
    options.runOptions
  );
  options.heftTaskSession.logger.terminal.writeLine(`Precompiled ${count} JSON schemas.`);
}

export default class PrecompileJsonSchemasPlugin
  implements IHeftTaskPlugin<IPrecompileJsonSchemasPluginOptions>
{
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IPrecompileJsonSchemasPluginOptions
  ): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const count: number = await precompileSchemasAsync(heftConfiguration.buildFolderPath, options, runOptions);
      taskSession.logger.terminal.writeLine(`Precompiled ${count} JSON schemas.`);
    });
  }
}
