// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from '@rushstack/ts-command-line';

import { HeftActionRunner } from '../HeftActionRunner.ts';
import { Selection } from '../../utilities/Selection.ts';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction.ts';
import type { HeftPhase } from '../../pluginFramework/HeftPhase.ts';

export interface IPhaseActionOptions extends IHeftActionOptions {
  phase: HeftPhase;
}

export class PhaseAction extends CommandLineAction implements IHeftAction {
  public readonly watch: boolean;

  private readonly _actionRunner: HeftActionRunner;
  private readonly _phase: HeftPhase;
  private _selectedPhases: Set<HeftPhase> | undefined;

  public constructor(options: IPhaseActionOptions) {
    super({
      actionName: `${options.phase.phaseName}${options.watch ? '-watch' : ''}`,
      documentation:
        `Runs to the ${options.phase.phaseName} phase, including all transitive dependencies` +
        (options.watch ? ', in watch mode.' : '.') +
        (options.phase.phaseDescription ? `  ${options.phase.phaseDescription}` : ''),
      summary:
        `Runs to the ${options.phase.phaseName} phase, including all transitive dependencies` +
        (options.watch ? ', in watch mode.' : '.')
    });

    this.watch = options.watch ?? false;
    this._phase = options.phase;
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
