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
      const {
        operation: {
          metadata: { task },
          state
        }
      } = options;
      if (state) {
        logger.terminal.writeLine(
          `--- ${task.taskName} finished in ${state.stopwatch.duration.toFixed(2)}s ---`
        );
      }
    });

    session.hooks.taskStart.tapPromise(PLUGIN_NAME, async (options: IHeftTaskStartHookOptions) => {
      const {
        operation: {
          metadata: { task }
        }
      } = options;
      logger.terminal.writeLine(`--- ${task.taskName} started ---`);
    });

    session.hooks.phaseStart.tapPromise(PLUGIN_NAME, async (options: IHeftPhaseStartHookOptions) => {
      const {
        operation: {
          metadata: { phase }
        }
      } = options;
      logger.terminal.writeLine(`--- ${phase.phaseName} started ---`);
    });

    session.hooks.phaseFinish.tapPromise(PLUGIN_NAME, async (options: IHeftPhaseFinishHookOptions) => {
      const {
        operation: {
          metadata: { phase },
          duration
        }
      } = options;
      logger.terminal.writeLine(`--- ${phase.phaseName} finished in ${duration.toFixed(2)}s ---`);
    });
  }
}
