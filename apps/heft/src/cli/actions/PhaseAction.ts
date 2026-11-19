// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from '@rushstack/ts-command-line';

import { HeftActionRunner } from '../HeftActionRunner';
import { Selection } from '../../utilities/Selection';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';

export interface IPhaseActionOptions extends IHeftActionOptions {
  phase: HeftPhase;
}

export class PhaseAction extends CommandLineAction implements IHeftAction {
  public readonly watch: boolean;

  readonly #actionRunner: HeftActionRunner;
  readonly #phase: HeftPhase;
  #selectedPhases: Set<HeftPhase> | undefined;

  public constructor(options: IPhaseActionOptions) {
    const { phase, watch = false } = options;
    const { phaseName, phaseDescription } = phase;
    super({
      actionName: `${phaseName}${watch ? '-watch' : ''}`,
      documentation:
        `Runs to the ${phaseName} phase, including all transitive dependencies` +
        (watch ? ', in watch mode.' : '.') +
        (phaseDescription ? `  ${phaseDescription}` : ''),
      summary:
        `Runs to the ${phaseName} phase, including all transitive dependencies` +
        (watch ? ', in watch mode.' : '.')
    });

    this.watch = watch;
    this.#phase = phase;
    this.#actionRunner = new HeftActionRunner({ action: this, ...options });
    this.#actionRunner.defineParameters();
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this.#selectedPhases) {
      this.#selectedPhases = Selection.recursiveExpand(
        [this.#phase],
        (phase: HeftPhase) => phase.dependencyPhases
      );
    }
    return this.#selectedPhases;
  }

  protected override async onExecuteAsync(): Promise<void> {
    await this.#actionRunner.executeAsync();
  }
}
