// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import {
  AliasCommandLineAction,
  type IAliasCommandLineActionOptions,
  type CommandLineAction
} from '@rushstack/ts-command-line';

export interface IAliasActionOptions extends IAliasCommandLineActionOptions {
  terminal: ITerminal;
}

export class AliasAction extends AliasCommandLineAction {
  readonly #toolFilename: string;
  readonly #terminal: ITerminal;

  public constructor(options: IAliasActionOptions) {
    super(options);
    this.#toolFilename = options.toolFilename;
    this.#terminal = options.terminal;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const toolFilename: string = this.#toolFilename;
    const actionName: string = this.actionName;
    const targetAction: CommandLineAction = this.targetAction;
    const defaultParameters: ReadonlyArray<string> = this.defaultParameters;
    const defaultParametersString: string = defaultParameters.join(' ');

    this.#terminal.writeLine(
      `The "${toolFilename} ${actionName}" alias was expanded to "${toolFilename} ${targetAction.actionName}` +
        `${defaultParametersString ? ` ${defaultParametersString}` : ''}".`
    );

    await super.onExecuteAsync();
  }
}
