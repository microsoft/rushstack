// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { IEnvironment } from '../../utilities/Utilities';

const PLUGIN_NAME: 'TrimRushEnvironmentVariablesPlugin' = 'TrimRushEnvironmentVariablesPlugin';

/**
 * Prefix used by environment variables that Rush itself defines and consumes.
 */
const RUSH_ENVIRONMENT_VARIABLE_NAME_PREFIX: 'RUSH_' = 'RUSH_';

/**
 * Phased command plugin that removes environment variables whose names begin with `RUSH_` before
 * they are forwarded to operation processes. Enabled via the `trimRushEnvironmentVariablesForOperations`
 * experiment in experiments.json.
 */
export class TrimRushEnvironmentVariablesPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
      graph.hooks.createEnvironmentForOperation.tap(PLUGIN_NAME, (env: IEnvironment) => {
        for (const key of Object.getOwnPropertyNames(env)) {
          if (key.toUpperCase().startsWith(RUSH_ENVIRONMENT_VARIABLE_NAME_PREFIX)) {
            delete env[key];
          }
        }

        return env;
      });
    });
  }
}
