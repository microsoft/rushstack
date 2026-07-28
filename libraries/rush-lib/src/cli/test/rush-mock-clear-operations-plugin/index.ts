// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushSession, RushConfiguration, IPhasedCommand, Operation } from '../../../index';

/**
 * Mimics the shape of `@rushstack/rush-buildxl-graph-plugin`, which performs its work during
 * `createOperationsAsync` and then returns an empty operation set because there is nothing left
 * for Rush to execute.
 *
 * Such an invocation must be reported as a success, not a failure.
 */
export default class RushMockClearOperationsPlugin {
  public apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void {
    rushSession.hooks.runAnyPhasedCommand.tapPromise(
      RushMockClearOperationsPlugin.name,
      async (command: IPhasedCommand) => {
        command.hooks.createOperationsAsync.tapPromise(
          {
            name: RushMockClearOperationsPlugin.name,
            // Run after every other plugin has finished creating operations.
            stage: Number.MAX_SAFE_INTEGER
          },
          async () => {
            return new Set<Operation>();
          }
        );
      }
    );
  }
}
