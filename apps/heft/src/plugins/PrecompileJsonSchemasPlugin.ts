// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonSchema } from '@rushstack/node-core-library';

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { IHeftTaskSession, IHeftTaskRunHookOptions } from '../pluginFramework/HeftTaskSession';

interface IPrecompileJsonSchemasPluginOptions {
  sourceFolder: string;
  destinationFolders: string[];
}

const PLUGIN_NAME: 'precompile-json-schemas-plugin' = 'precompile-json-schemas-plugin';

export default class PrecompileJsonSchemasPlugin
  implements IHeftTaskPlugin<IPrecompileJsonSchemasPluginOptions>
{
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IPrecompileJsonSchemasPluginOptions
  ): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
      const sourceFolder: string = path.resolve(heftConfiguration.buildFolderPath, options.sourceFolder);
      const schemaPaths: string[] = await runOptions.globAsync('**/*.schema.json', {
        cwd: sourceFolder,
        absolute: true
      });

      for (const schemaPath of schemaPaths) {
        const validatorCode: string = JsonSchema.compileStandaloneCodeFromFile(schemaPath);
        const relativePath: string = path
          .relative(sourceFolder, schemaPath)
          .replace(/\.schema\.json$/, '.validator.cjs');
        for (const destinationFolder of options.destinationFolders) {
          const destinationPath: string = path.resolve(
            heftConfiguration.buildFolderPath,
            destinationFolder,
            relativePath
          );
          await FileSystem.writeFileAsync(destinationPath, validatorCode, { ensureFolderExists: true });
        }
      }
      taskSession.logger.terminal.writeLine(`Precompiled ${schemaPaths.length} JSON schemas.`);
    });
  }
}
