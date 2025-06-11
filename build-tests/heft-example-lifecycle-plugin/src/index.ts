// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IHeftLifecyclePlugin,
  IHeftLifecycleSession,
  IHeftOperationFinishHookOptions,
  IHeftOperationGroupStartHookOptions,
  IHeftOperationGroupFinishHookOptions,
  IHeftOperationStartHookOptions
} from '@rushstack/heft';

export const PLUGIN_NAME: 'example-lifecycle-plugin' = 'example-lifecycle-plugin';

export default class ExampleLifecyclePlugin implements IHeftLifecyclePlugin {
  public apply(session: IHeftLifecycleSession): void {
    const { logger } = session;
    session.hooks.operationFinish.tapPromise(
      PLUGIN_NAME,
      async (options: IHeftOperationFinishHookOptions) => {
        const { operation } = options;
        if (operation.state) {
          logger.terminal.writeLine(
            `--- ${operation.runner?.name} finished in ${operation.state.stopwatch.duration.toFixed(2)}s ---`
          );
        }
      }
    );

    session.hooks.operationStart.tapPromise(PLUGIN_NAME, async (options: IHeftOperationStartHookOptions) => {
      const { operation } = options;
      if (operation.state) {
        logger.terminal.writeLine(`--- ${operation.runner?.name} started ---`);
      }
    });

    session.hooks.operationGroupStart.tapPromise(
      PLUGIN_NAME,
      async (options: IHeftOperationGroupStartHookOptions) => {
        const { operationGroup } = options;
        logger.terminal.writeLine(`--- ${operationGroup.name} started ---`);
      }
    );

    session.hooks.operationGroupFinish.tapPromise(
      PLUGIN_NAME,
      async (options: IHeftOperationGroupFinishHookOptions) => {
        const { operationGroup } = options;
        logger.terminal.writeLine(
          `--- ${operationGroup.name} finished in ${operationGroup.duration.toFixed(2)}s ---`
        );
      }
    );
  }
}
