// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IHeftLifecyclePlugin,
  IHeftLifecycleSession,
  IHeftTaskRecordMetricsHookOptions
} from '@rushstack/heft';

export const PLUGIN_NAME: 'example-lifecycle-plugin' = 'example-lifecycle-plugin';

export default class ExampleLifecyclePlugin implements IHeftLifecyclePlugin {
  public apply(session: IHeftLifecycleSession): void {
    const { logger } = session;
    session.hooks.recordTaskMetrics.tapPromise(
      PLUGIN_NAME,
      async (metrics: IHeftTaskRecordMetricsHookOptions) => {
        const { taskName, taskTotalExecutionMs, phaseName } = metrics.metricData;
        logger.terminal.writeLine(
          `Finished ${phaseName}:${taskName} in ${taskTotalExecutionMs.toFixed(2)}ms`
        );
      }
    );
  }
}
