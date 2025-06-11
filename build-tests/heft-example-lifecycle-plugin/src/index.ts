// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IHeftLifecyclePlugin,
  IHeftLifecycleSession,
  IHeftTaskFinishHookOptions,
  IHeftTaskStartHookOptions,
  IHeftPhaseFinishHookOptions,
  IHeftPhaseStartHookOptions
} from '@rushstack/heft';

export const PLUGIN_NAME: 'example-lifecycle-plugin' = 'example-lifecycle-plugin';

export default class ExampleLifecyclePlugin implements IHeftLifecyclePlugin {
  public apply(session: IHeftLifecycleSession): void {
    const { logger } = session;
    session.hooks.taskFinish.tapPromise(PLUGIN_NAME, async (options: IHeftTaskFinishHookOptions) => {
      const { operation, task } = options;
      if (operation.state) {
        logger.terminal.writeLine(
          `--- ${task.taskName} finished in ${operation.state.stopwatch.duration.toFixed(2)}s ---`
        );
      }
    });

    session.hooks.taskStart.tapPromise(PLUGIN_NAME, async (options: IHeftTaskStartHookOptions) => {
      const { task } = options;
      logger.terminal.writeLine(`--- ${task.taskName} started ---`);
    });

    session.hooks.phaseStart.tapPromise(PLUGIN_NAME, async (options: IHeftPhaseStartHookOptions) => {
      const { phase } = options;
      logger.terminal.writeLine(`--- ${phase.phaseName} started ---`);
    });

    session.hooks.phaseFinish.tapPromise(PLUGIN_NAME, async (options: IHeftPhaseFinishHookOptions) => {
      const { phase, operation } = options;
      logger.terminal.writeLine(`--- ${phase.phaseName} finished in ${operation.duration.toFixed(2)}s ---`);
    });
  }
}
