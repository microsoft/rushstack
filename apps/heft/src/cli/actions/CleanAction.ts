// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as glob from 'glob';
import * as path from 'path';
import { AsyncSeriesBailHook } from 'tapable';
import { LegacyAdapters } from '@rushstack/node-core-library';

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionContext } from './HeftActionBase';
import { Async } from '../../utilities/Async';

/**
 * @public
 */
export class CleanHooks extends ActionHooksBase<ICleanActionProperties> {
  public readonly deletePath: AsyncSeriesBailHook<string> = new AsyncSeriesBailHook<string>(['pathToDelete']);
}

/**
 * @public
 */
export interface ICleanActionProperties {
  pathsToDelete: Set<string>;
}

/**
 * @public
 */
export interface ICleanActionContext extends IActionContext<CleanHooks, ICleanActionProperties> {}

const GLOB_PATTERN_REGEX: RegExp = /\/\*[^\*]/;

export class CleanAction extends HeftActionBase<CleanHooks, ICleanActionProperties> {
  public constructor(options: IHeftActionBaseOptions) {
    super(
      {
        actionName: 'clean',
        summary: 'Clean the project',
        documentation: ''
      },
      options,
      CleanHooks
    );
  }

  protected async actionExecute(actionContext: ICleanActionContext): Promise<void> {
    const resolvedPathsToDelete: string[] = [];
    for (const pathToDelete of actionContext.properties.pathsToDelete) {
      const resolvedPaths: string[] = await this._resolvePath(
        pathToDelete,
        this.heftConfiguration.buildFolder
      );
      resolvedPathsToDelete.push(...resolvedPaths);
    }

    await Async.forEachLimitAsync(resolvedPathsToDelete, 100, (pathToDelete) =>
      actionContext.hooks.deletePath.promise(pathToDelete)
    );

    this.terminal.writeLine(`Deleted ${actionContext.properties.pathsToDelete.size} paths`);
  }

  protected getDefaultActionProperties(): ICleanActionProperties {
    return {
      pathsToDelete: new Set<string>()
    };
  }

  private async _resolvePath(globPattern: string, buildFolder: string): Promise<string[]> {
    if (GLOB_PATTERN_REGEX.test(globPattern)) {
      const expandedGlob: string[] = await LegacyAdapters.convertCallbackToPromise(glob, globPattern, {
        cwd: buildFolder
      });

      const result: string[] = [];
      for (const pathFromGlob of expandedGlob) {
        result.push(path.resolve(buildFolder, pathFromGlob));
      }

      return result;
    } else {
      return [path.resolve(buildFolder, globPattern)];
    }
  }
}
