// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskSession } from '../pluginFramework/HeftTaskSession';
import type { IHeftTaskPlugin } from '../pluginFramework/IHeftPlugin';
import type { SetEnvironmentVariablesHeftTaskEventOptions as ISetEnvironmentVariablesPluginOptions } from '../schemas/set-environment-variables-plugin.schema.json.d.ts';

export const PLUGIN_NAME: string = 'set-environment-variables-plugin';

/**
 * @public
 */
export type { ISetEnvironmentVariablesPluginOptions };

export default class SetEnvironmentVariablesPlugin
  implements IHeftTaskPlugin<ISetEnvironmentVariablesPluginOptions>
{
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    { environmentVariablesToSet }: ISetEnvironmentVariablesPluginOptions
  ): void {
    taskSession.hooks.run.tap(
      {
        name: PLUGIN_NAME,
        stage: Number.MIN_SAFE_INTEGER
      },
      () => {
        for (const [key, value] of Object.entries(environmentVariablesToSet)) {
          taskSession.logger.terminal.writeLine(`Setting environment variable ${key}=${value}`);
          process.env[key] = value;
        }
      }
    );
  }
}
