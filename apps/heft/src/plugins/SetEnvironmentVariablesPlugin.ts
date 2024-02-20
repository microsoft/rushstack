// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftLifecycleSession } from '../pluginFramework/HeftLifecycleSession';
import type { IHeftLifecyclePlugin } from '../pluginFramework/IHeftPlugin';

export const PLUGIN_NAME: string = 'set-environment-variables-plugin';

export interface ISetEnvironmentVariablesPluginOptions {
  environmentVariablesToSet: Record<string, string>;
}

export default class SetEnvironmentVariablesPlugin
  implements IHeftLifecyclePlugin<ISetEnvironmentVariablesPluginOptions>
{
  public apply(
    lifecycleSession: IHeftLifecycleSession,
    heftConfiguration: HeftConfiguration,
    { environmentVariablesToSet }: ISetEnvironmentVariablesPluginOptions
  ): void {
    lifecycleSession.hooks.toolStart.tap(
      {
        name: PLUGIN_NAME,
        stage: Number.MIN_SAFE_INTEGER
      },
      () => {
        for (const [key, value] of Object.entries(environmentVariablesToSet)) {
          lifecycleSession.logger.terminal.writeLine(`Setting environment variable ${key}=${value}`);
          process.env[key] = value;
        }
      }
    );
  }
}
