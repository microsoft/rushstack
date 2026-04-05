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

  private readonly _actionRunner: HeftActionRunner;
  private readonly _phase: HeftPhase;
  private _selectedPhases: Set<HeftPhase> | undefined;

  public constructor(options: IPhaseActionOptions) {
    const { phase, watch } = options;
    super({
      actionName: `${phase.phaseName}${watch ? '-watch' : ''}`,
      documentation:
        `Runs to the ${phase.phaseName} phase, including all transitive dependencies` +
        (watch ? ', in watch mode.' : '.') +
        (phase.phaseDescription ? `  ${phase.phaseDescription}` : ''),
      summary:
        `Runs to the ${phase.phaseName} phase, including all transitive dependencies` +
        (watch ? ', in watch mode.' : '.')
    });

    this.watch = watch ?? false;
    this._phase = phase;
    this._actionRunner = new HeftActionRunner({ action: this, ...options });
    this._actionRunner.defineParameters();
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this._selectedPhases) {
      this._selectedPhases = Selection.recursiveExpand(
        [this._phase],
        (phase: HeftPhase) => phase.dependencyPhases
      );
    }
    return this._selectedPhases;
  }

  protected override async onExecuteAsync(): Promise<void> {
    await this._actionRunner.executeAsync();
  }
}
