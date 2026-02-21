// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';

import {
  CommandLineParser,
  type AliasCommandLineAction,
  type CommandLineFlagParameter,
  type CommandLineAction
} from '@rushstack/ts-command-line';
import { InternalError, AlreadyReportedError } from '@rushstack/node-core-library';
import { Terminal, ConsoleTerminalProvider, type ITerminal } from '@rushstack/terminal';

import { MetricsCollector } from '../metrics/MetricsCollector.ts';
import { HeftConfiguration } from '../configuration/HeftConfiguration.ts';
import { InternalHeftSession } from '../pluginFramework/InternalHeftSession.ts';
import { LoggingManager } from '../pluginFramework/logging/LoggingManager.ts';
import { CleanAction } from './actions/CleanAction.ts';
import { PhaseAction } from './actions/PhaseAction.ts';
import { RunAction } from './actions/RunAction.ts';
import type { IHeftActionOptions } from './actions/IHeftAction.ts';
import { AliasAction } from './actions/AliasAction.ts';
import { getToolParameterNamesFromArgs } from '../utilities/CliUtilities.ts';
import { Constants } from '../utilities/Constants.ts';

/**
 * This interfaces specifies values for parameters that must be parsed before the CLI
 * is fully initialized.
 */
interface IPreInitializationArgumentValues {
  debug?: boolean;
  unmanaged?: boolean;
}

const HEFT_TOOL_FILENAME: 'heft' = 'heft';

export class HeftCommandLineParser extends CommandLineParser {
  public readonly globalTerminal: ITerminal;

  private readonly _debugFlag: CommandLineFlagParameter;
  private readonly _unmanagedFlag: CommandLineFlagParameter;
  private readonly _debug: boolean;
  private readonly _terminalProvider: ConsoleTerminalProvider;
  private readonly _loggingManager: LoggingManager;
  private readonly _metricsCollector: MetricsCollector;
  private readonly _heftConfiguration: HeftConfiguration;
  private _internalHeftSession: InternalHeftSession | undefined;

  public constructor() {
    super({
      toolFilename: HEFT_TOOL_FILENAME,
      toolDescription: 'Heft is a pluggable build system designed for web projects.'
    });

    // Initialize the debug flag as a parameter on the tool itself
    this._debugFlag = this.defineFlagParameter({
      parameterLongName: Constants.debugParameterLongName,
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    // Initialize the unmanaged flag as a parameter on the tool itself. While this parameter
    // is only used during version selection, we need to support parsing it here so that we
    // don't throw due to an unrecognized parameter.
    this._unmanagedFlag = this.defineFlagParameter({
      parameterLongName: Constants.unmanagedParameterLongName,
      description:
        'Disables the Heft version selector: When Heft is invoked via the shell path, normally it' +
        " will examine the project's package.json dependencies and try to use the locally installed version" +
        ' of Heft. Specify "--unmanaged" to force the invoked version of Heft to be used. This is useful for' +
        ' example if you want to test a different version of Heft.'
    });

    // Pre-initialize with known argument values to determine state of "--debug"
    const preInitializationArgumentValues: IPreInitializationArgumentValues =
      this._getPreInitializationArgumentValues();
    this._debug = !!preInitializationArgumentValues.debug;

    // Enable debug and verbose logging if the "--debug" flag is set
    this._terminalProvider = new ConsoleTerminalProvider({
      debugEnabled: this._debug,
      verboseEnabled: this._debug
    });
    this.globalTerminal = new Terminal(this._terminalProvider);
    this._loggingManager = new LoggingManager({ terminalProvider: this._terminalProvider });
    if (this._debug) {
      // Enable printing stacktraces if the "--debug" flag is set
      this._loggingManager.enablePrintStacks();
      InternalError.breakInDebugger = true;
    }

    const numberOfCores: number = os.availableParallelism?.() ?? os.cpus().length;
    this._heftConfiguration = HeftConfiguration.initialize({
      cwd: process.cwd(),
      terminalProvider: this._terminalProvider,
      numberOfCores
    });

    this._metricsCollector = new MetricsCollector();
  }

  public async executeAsync(args?: string[]): Promise<boolean> {
    // Defensively set the exit code to 1 so if the tool crashes for whatever reason,
    // we'll have a nonzero exit code.
    process.exitCode = 1;

    try {
      this._normalizeCwd();

      const internalHeftSession: InternalHeftSession = await InternalHeftSession.initializeAsync({
        debug: this._debug,
        heftConfiguration: this._heftConfiguration,
        loggingManager: this._loggingManager,
        metricsCollector: this._metricsCollector
      });
      this._internalHeftSession = internalHeftSession;

      const actionOptions: IHeftActionOptions = {
        internalHeftSession: internalHeftSession,
        terminal: this.globalTerminal,
        loggingManager: this._loggingManager,
        metricsCollector: this._metricsCollector,
        heftConfiguration: this._heftConfiguration
      };

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
            terminal: this.globalTerminal,
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
    } catch (e) {
      await this._reportErrorAndSetExitCodeAsync(e as Error);
      return false;
    }
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

      this._internalHeftSession!.parsedCommandLine = {
        commandName,
        unaliasedCommandName
      };
      await super.onExecuteAsync();
    } catch (e) {
      await this._reportErrorAndSetExitCodeAsync(e as Error);
    }

    // If we make it here, things are fine and reset the exit code back to 0
    process.exitCode = 0;
  }

  private _normalizeCwd(): void {
    const buildFolder: string = this._heftConfiguration.buildFolderPath;
    const currentCwd: string = process.cwd();
    if (currentCwd !== buildFolder) {
      // Update the CWD to the project's build root. Some tools, like Jest, use process.cwd()
      this.globalTerminal.writeVerboseLine(`CWD is "${currentCwd}". Normalizing to "${buildFolder}".`);
      // If `process.cwd()` and `buildFolder` differ only by casing on Windows, the chdir operation will not fix the casing, which is the entire purpose of the exercise.
      // As such, chdir to a different directory first. That directory needs to exist, so use the parent of the current directory.
      // This will not work if the current folder is the drive root, but that is a rather exotic case.
      process.chdir(__dirname);
      process.chdir(buildFolder);
    }
  }

  private _getPreInitializationArgumentValues(
    args: string[] = process.argv
  ): IPreInitializationArgumentValues {
    if (!this._debugFlag) {
      // The `this._debugFlag` parameter (the parameter itself, not its value)
      // has not yet been defined. Parameters need to be defined before we
      // try to evaluate any parameters. This is to ensure that the
      // `--debug` flag is defined correctly before we do this not-so-rigorous
      // parameter parsing.
      throw new InternalError('parameters have not yet been defined.');
    }

    const toolParameters: Set<string> = getToolParameterNamesFromArgs(args);
    return {
      debug: toolParameters.has(this._debugFlag.longName),
      unmanaged: toolParameters.has(this._unmanagedFlag.longName)
    };
  }

  private async _reportErrorAndSetExitCodeAsync(error: Error): Promise<void> {
    if (!(error instanceof AlreadyReportedError)) {
      this.globalTerminal.writeErrorLine(error.toString());
    }

    if (this._debug) {
      this.globalTerminal.writeLine();
      this.globalTerminal.writeErrorLine(error.stack!);
    }

    const exitCode: string | number | undefined = process.exitCode;
    if (!exitCode || typeof exitCode !== 'number' || exitCode > 0) {
      process.exit(exitCode);
    } else {
      process.exit(1);
    }
  }
}
