// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { Operation } from './Operation';
import type { IConfigurableOperation } from './IOperationExecutionResult';

const PLUGIN_NAME: 'DebugHashesPlugin' = 'DebugHashesPlugin';

export class DebugHashesPlugin implements IPhasedCommandPlugin {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this._terminal = terminal;
  }

  public apply(hooks: PhasedCommandHooks): void {
    hooks.executionManagerAsync.tap(PLUGIN_NAME, (executionManager) => {
      executionManager.hooks.configureRun.tap(
        PLUGIN_NAME,
        (operations: ReadonlyMap<Operation, IConfigurableOperation>) => {
          const terminal: ITerminal = this._terminal;
          terminal.writeLine(Colorize.blue(`===== Begin Hash Computation =====`));
          for (const [operation, record] of operations) {
            terminal.writeLine(Colorize.cyan(`--- ${operation.name} ---`));
            record.getStateHashComponents().forEach((component) => {
              terminal.writeLine(component);
            });
            terminal.writeLine(Colorize.green(`Result: ${record.getStateHash()}`));
            // Add a blank line between operations to visually separate them
            terminal.writeLine();
          }
          terminal.writeLine(Colorize.blue(`===== End Hash Computation =====`));
        }
      );
    });
  }
}
