// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type {
  HeftConfiguration,
  IHeftTaskPlugin,
  IHeftTaskSession,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions
} from '@rushstack/heft';

import { TypeScript7Builder } from './TypeScript7Builder';

/**
 * Options for the TypeScript 7 typechecking and declaration task.
 * @public
 */
export interface ITypeScript7PluginOptions {
  /**
   * The tsconfig path, relative to the project folder.
   * @defaultValue `"tsconfig.json"`
   */
  project?: string;
}

/**
 * The name of the TypeScript 7 task plugin.
 * @public
 */
export const PLUGIN_NAME: 'typescript7-plugin' = 'typescript7-plugin';

export default class TypeScript7Plugin implements IHeftTaskPlugin<ITypeScript7PluginOptions> {
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: ITypeScript7PluginOptions = {}
  ): void {
    const runAsync = async (
      runOptions: IHeftTaskRunHookOptions,
      incrementalOptions?: IHeftTaskRunIncrementalHookOptions
    ): Promise<void> => {
      if (runOptions.abortSignal.aborted) {
        return;
      }
      const typescriptPackagePath: string =
        await heftConfiguration.rigPackageResolver.resolvePackageAsync(
          'typescript',
          taskSession.logger.terminal
        );
      await new TypeScript7Builder({
        typescriptPackagePath,
        buildFolderPath: heftConfiguration.buildFolderPath,
        tsconfigPath: path.resolve(heftConfiguration.buildFolderPath, options.project || 'tsconfig.json'),
        logger: taskSession.logger,
        watchFs: incrementalOptions?.watchFs,
        abortSignal: runOptions.abortSignal
      }).invokeAsync();
    };

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, (runOptions) => runAsync(runOptions));
    taskSession.hooks.runIncremental.tapPromise(PLUGIN_NAME, (runOptions) =>
      runAsync(runOptions, runOptions)
    );
  }
}
