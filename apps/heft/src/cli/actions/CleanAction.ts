// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction, type CommandLineFlagParameter } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';

import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { MetricsCollector } from '../../metrics/MetricsCollector';
import { Constants } from '../../utilities/Constants';
import { definePhaseScopingParameters, getCleanSelectedPhases, type IScopingParameters } from './PhaseScoping';
import { CLEAN_ACTION_DOCUMENTATION, VERBOSE_PARAMETER_DESCRIPTION } from '../CliConstants';

export class CleanAction extends CommandLineAction implements IHeftAction {
  public readonly watch: boolean = false;
  readonly #internalHeftSession: InternalHeftSession;
  readonly #terminal: ITerminal;
  readonly #metricsCollector: MetricsCollector;
  readonly #verboseFlag: CommandLineFlagParameter;
  readonly #scopingParameters: IScopingParameters;
  #selectedPhases: ReadonlySet<HeftPhase> | undefined;

  public constructor(options: IHeftActionOptions) {
    super({
      actionName: 'clean',
      documentation: CLEAN_ACTION_DOCUMENTATION,
      summary: CLEAN_ACTION_DOCUMENTATION
    });

    this.#terminal = options.terminal;
    this.#metricsCollector = options.metricsCollector;
    this.#internalHeftSession = options.internalHeftSession;

    this.#scopingParameters = definePhaseScopingParameters(this);

    this.#verboseFlag = this.defineFlagParameter({
      parameterLongName: Constants.verboseParameterLongName,
      parameterShortName: Constants.verboseParameterShortName,
      description: VERBOSE_PARAMETER_DESCRIPTION
    });
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this.#selectedPhases) {
      this.#selectedPhases = getCleanSelectedPhases(
        this.#scopingParameters,
        this.#internalHeftSession,
        this.#terminal
      );
    }
    return this.#selectedPhases;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const { executeCleanActionAsync } = await import('./CleanActionExecution');
    await executeCleanActionAsync({
      action: this,
      internalHeftSession: this.#internalHeftSession,
      terminal: this.#terminal,
      metricsCollector: this.#metricsCollector,
      isVerbose: this.#verboseFlag.value
    });
  }
}
