// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as glob from 'glob';
import * as path from 'path';
import { LegacyAdapters } from '@rushstack/node-core-library';

import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { HeftSession } from '../pluginFramework/HeftSession';
import { ICleanActionContext } from '../cli/actions/CleanAction';

const PLUGIN_NAME: string = 'ResolveConfigPaths';
const GLOB_PATTERN_REGEX: RegExp = /\/\*[^\*]/;

export class ResolveActionConfigurationPathsPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.clean.tap(PLUGIN_NAME, (clean: ICleanActionContext) => {
      clean.hooks.afterLoadActionConfiguration.tapPromise(PLUGIN_NAME, async () => {
        // eslint-disable-next-line require-atomic-updates
        clean.properties.pathsToDelete = await this._resolvePaths(
          clean.properties.pathsToDelete,
          heftConfiguration
        );
      });
    });
  }

  private async _resolvePaths(
    globPatterns: string[],
    heftConfiguration: HeftConfiguration
  ): Promise<string[]> {
    const result: string[] = [];

    for (const globPattern of globPatterns) {
      if (GLOB_PATTERN_REGEX.test(globPattern)) {
        const expandedGlob: string[] = await LegacyAdapters.convertCallbackToPromise(glob, globPattern, {
          cwd: heftConfiguration.buildFolder
        });

        for (const pathFromGlob of expandedGlob) {
          result.push(path.resolve(heftConfiguration.buildFolder, pathFromGlob));
        }
      } else {
        result.push(path.resolve(heftConfiguration.buildFolder, globPattern));
      }
    }

    return result;
  }
}
