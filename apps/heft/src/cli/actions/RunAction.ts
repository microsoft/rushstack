// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ScopedCommandLineAction, type CommandLineParameterProvider } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';

import { HeftActionRunner } from '../HeftActionRunner';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import { definePhaseScopingParameters, expandPhases, type IScopingParameters } from './PhaseScoping';
import { getRunActionDocumentation } from '../CliConstants';

// These are re-exported for compatibility with consumers of this module's path.
export { definePhaseScopingParameters, expandPhases, type IScopingParameters } from './PhaseScoping';

export class RunAction extends ScopedCommandLineAction implements IHeftAction {
  public readonly watch: boolean;

  readonly #internalHeftSession: InternalHeftSession;
  readonly #terminal: ITerminal;
  readonly #actionRunner: HeftActionRunner;
  readonly #scopingParameters: IScopingParameters;
  #selectedPhases: Set<HeftPhase> | undefined;

  public constructor(options: IHeftActionOptions) {
    const documentation: string = getRunActionDocumentation(!!options.watch);
    super({
      actionName: `run${options.watch ? '-watch' : ''}`,
      documentation,
      summary: documentation
    });

    this.watch = options.watch ?? false;
    this.#terminal = options.terminal;
    this.#internalHeftSession = options.internalHeftSession;

    this.#scopingParameters = definePhaseScopingParameters(this);

    this.#actionRunner = new HeftActionRunner({ action: this, ...options });
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this.#selectedPhases) {
      const { onlyParameter, toParameter, toExceptParameter } = this.#scopingParameters;
      this.#selectedPhases = expandPhases(
        onlyParameter,
        toParameter,
        toExceptParameter,
        this.#internalHeftSession,
        this.#terminal
      );
    }
    return this.#selectedPhases;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    this.#actionRunner.defineParameters(scopedParameterProvider);
  }

  protected override async onExecuteAsync(): Promise<void> {
    await this.#actionRunner.executeAsync();
  }
}
