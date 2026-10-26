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
    let watchBuilderPromise: Promise<TypeScript7Builder> | undefined;
    let activeRunPromise: Promise<void> | undefined;
    let finishing: boolean = false;
    const toolFinish: IHeftTaskSession['hooks']['toolFinish'] | undefined = taskSession.hooks.toolFinish;
    toolFinish?.tapPromise(PLUGIN_NAME, async () => {
      finishing = true;
      // IPC "exit" can finish the lifecycle without aborting an active iteration.
      // Its task runner owns error reporting; disposal must wait for it either way.
      await activeRunPromise?.catch(() => {});
      const builderPromise: Promise<TypeScript7Builder> | undefined = watchBuilderPromise;
      watchBuilderPromise = undefined;
      await (await builderPromise)?.closeAsync();
    });
    const createBuilderAsync = async (
      runOptions: IHeftTaskRunHookOptions,
      incrementalOptions?: IHeftTaskRunIncrementalHookOptions
    ): Promise<TypeScript7Builder> => {
      const typescriptPackagePath: string =
        await heftConfiguration.rigPackageResolver.resolvePackageAsync(
          'typescript',
          taskSession.logger.terminal
        );
      return new TypeScript7Builder({
        typescriptPackagePath,
        buildFolderPath: heftConfiguration.buildFolderPath,
        tsconfigPath: path.resolve(heftConfiguration.buildFolderPath, options.project || 'tsconfig.json'),
        logger: taskSession.logger,
        watchFs: incrementalOptions?.watchFs,
        requestRun: incrementalOptions?.requestRun,
        abortSignal: runOptions.abortSignal
      });
    };
    const invokeAsync = async (
      runOptions: IHeftTaskRunHookOptions,
      incrementalOptions?: IHeftTaskRunIncrementalHookOptions
    ): Promise<void> => {
      if (runOptions.abortSignal.aborted) {
        return;
      }
      if (incrementalOptions) {
        if (!toolFinish) {
          throw new Error(
            'Persistent TypeScript 7 watch mode requires a Heft release with IHeftTaskHooks.toolFinish. ' +
              'Published @rushstack/heft 1.3.3 does not provide this hook; upgrade to a Heft build containing it.'
          );
        }
        watchBuilderPromise ??= createBuilderAsync(runOptions, incrementalOptions).catch((error: unknown) => {
          watchBuilderPromise = undefined;
          throw error;
        });
        const builder: TypeScript7Builder = await watchBuilderPromise;
        await builder.invokeAsync(runOptions.abortSignal, incrementalOptions.watchFs);
      } else {
        await (await createBuilderAsync(runOptions)).invokeAsync();
      }
    };
    const runAsync = (
      runOptions: IHeftTaskRunHookOptions,
      incrementalOptions?: IHeftTaskRunIncrementalHookOptions
    ): Promise<void> => {
      if (finishing) {
        return Promise.resolve();
      }
      return (activeRunPromise = invokeAsync(runOptions, incrementalOptions));
    };

    taskSession.hooks.run.tapPromise(PLUGIN_NAME, (runOptions) => runAsync(runOptions));
    taskSession.hooks.runIncremental.tapPromise(PLUGIN_NAME, (runOptions) =>
      runAsync(runOptions, runOptions)
    );
  }
}
