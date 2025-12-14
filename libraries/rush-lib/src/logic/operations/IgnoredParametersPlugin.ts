// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { IEnvironment } from '../../utilities/Utilities';
import type { IOperationExecutionResult } from './IOperationExecutionResult';

const PLUGIN_NAME: string = 'IgnoredParametersPlugin';

/**
 * Environment variable name for forwarding ignored parameters to child processes
 * @public
 */
export const RUSHSTACK_CLI_IGNORED_PARAMETER_NAMES_ENV_VAR: string = 'RUSHSTACK_CLI_IGNORED_PARAMETER_NAMES';

/**
 * Phased command plugin that forwards the value of the `parameterNamesToIgnore` operation setting
 * to child processes as the RUSHSTACK_CLI_IGNORED_PARAMETER_NAMES environment variable.
 */
export class IgnoredParametersPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.createEnvironmentForOperation.tap(
      PLUGIN_NAME,
      (env: IEnvironment, record: IOperationExecutionResult) => {
        const { settings } = record.operation;

        // If there are parameter names to ignore, set the environment variable
        if (settings?.parameterNamesToIgnore && settings.parameterNamesToIgnore.length > 0) {
          env[RUSHSTACK_CLI_IGNORED_PARAMETER_NAMES_ENV_VAR] = settings.parameterNamesToIgnore.join(',');
        }

        return env;
      }
    );
  }
}
