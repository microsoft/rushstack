// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineParser,
  type AliasCommandLineAction,
  type CommandLineAction
} from '@rushstack/ts-command-line';

import { CleanAction } from './actions/CleanAction';
import { PhaseAction } from './actions/PhaseAction';
import { RunAction } from './actions/RunAction';
import type { IHeftActionOptions } from './actions/IHeftAction';
import { AliasAction } from './actions/AliasAction';
import { Constants } from '../utilities/Constants';
import {
  DEBUG_PARAMETER_DESCRIPTION,
  HEFT_TOOL_DESCRIPTION,
  HEFT_TOOL_FILENAME,
  UNMANAGED_PARAMETER_DESCRIPTION
} from './CliConstants';
import type { IHeftCommandLineParserState } from './HeftCommandLineParser';

/**
 * The complete ts-command-line (argparse) based command-line parser. This is the reference implementation of
 * Heft's command line: it defines every action with every parameter before parsing anything. The lean
 * implementation in `HeftCommandLineParser` falls back to this parser for anything that it cannot handle
 * with byte-identical results (such as errors and unusual syntax).
 */
export class HeftFullCommandLineParser extends CommandLineParser {
  readonly #state: IHeftCommandLineParserState;

  public constructor(state: IHeftCommandLineParserState) {
    super({
      toolFilename: HEFT_TOOL_FILENAME,
      toolDescription: HEFT_TOOL_DESCRIPTION
    });

    this.#state = state;

    // Initialize the debug flag as a parameter on the tool itself
    this.defineFlagParameter({
      parameterLongName: Constants.debugParameterLongName,
      description: DEBUG_PARAMETER_DESCRIPTION
    });

    // Initialize the unmanaged flag as a parameter on the tool itself. While this parameter
    // is only used during version selection, we need to support parsing it here so that we
    // don't throw due to an unrecognized parameter.
    this.defineFlagParameter({
      parameterLongName: Constants.unmanagedParameterLongName,
      description: UNMANAGED_PARAMETER_DESCRIPTION
    });
  }

  /**
   * Defines all actions and executes the command line. Errors thrown while defining the actions propagate
   * to the caller, which reports them.
   */
  public async defineActionsAndExecuteAsync(actionOptions: IHeftActionOptions, args?: string[]): Promise<boolean> {
    const { internalHeftSession } = actionOptions;
    const { terminal } = actionOptions;

    // Add the clean action, the run action, and the individual phase actions
    this.addAction(new CleanAction(actionOptions));
    this.addAction(new RunAction(actionOptions));
    for (const phase of internalHeftSession.phases) {
      this.addAction(new PhaseAction({ ...actionOptions, phase }));
    }

    // Add the watch variant of the run action and the individual phase actions
    this.addAction(new RunAction({ ...actionOptions, watch: true }));
    for (const phase of internalHeftSession.phases) {
      this.addAction(new PhaseAction({ ...actionOptions, phase, watch: true }));
    }

    // Add the action aliases last, since we need the targets to be defined before we can add the aliases
    const aliasActions: AliasCommandLineAction[] = [];
    for (const [
      aliasName,
      { actionName, defaultParameters }
    ] of internalHeftSession.actionReferencesByAlias) {
      const existingAction: CommandLineAction | undefined = this.tryGetAction(aliasName);
      if (existingAction) {
        throw new Error(
          `The alias "${aliasName}" specified in heft.json cannot be used because an action ` +
            'with that name already exists.'
        );
      }
      const targetAction: CommandLineAction | undefined = this.tryGetAction(actionName);
      if (!targetAction) {
        throw new Error(
          `The action "${actionName}" referred to by alias "${aliasName}" in heft.json could not be found.`
        );
      }
      aliasActions.push(
        new AliasAction({
          terminal,
          toolFilename: HEFT_TOOL_FILENAME,
          aliasName,
          targetAction,
          defaultParameters
        })
      );
    }
    // Add the alias actions. Do this in a second pass to disallow aliases that refer to other aliases.
    for (const aliasAction of aliasActions) {
      this.addAction(aliasAction);
    }

    return await super.executeAsync(args);
  }

  protected override async onExecuteAsync(): Promise<void> {
    try {
      const selectedAction: CommandLineAction | undefined = this.selectedAction;

      let commandName: string = '';
      let unaliasedCommandName: string = '';

      if (selectedAction) {
        commandName = selectedAction.actionName;
        if (selectedAction instanceof AliasAction) {
          unaliasedCommandName = selectedAction.targetAction.actionName;
        } else {
          unaliasedCommandName = selectedAction.actionName;
        }
      }

      this.#state.internalHeftSession.parsedCommandLine = {
        commandName,
        unaliasedCommandName
      };
      this.#state.childReporter?.setCommandName(commandName);
      await super.onExecuteAsync();
    } catch (e) {
      await this.#state.reportErrorAndSetExitCodeAsync(e as Error);
    }

    // If we make it here, things are fine and reset the exit code back to 0
    process.exitCode = 0;
  }
}
