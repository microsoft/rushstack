// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ArgumentParser } from 'argparse';
import { CommandLineParser, CommandLineFlagParameter } from '@rushstack/ts-command-line';
import {
  ITerminal,
  Terminal,
  InternalError,
  ConsoleTerminalProvider,
  AlreadyReportedError,
  FileSystem
} from '@rushstack/node-core-library';

import { MetricsCollector } from '../metrics/MetricsCollector';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import { LoggingManager } from '../pluginFramework/logging/LoggingManager';
import { Constants } from '../utilities/Constants';
import { PhaseAction } from './actions/PhaseAction';
import { RunAction } from './actions/RunAction';
import type { IHeftActionOptions } from './actions/IHeftAction';

/**
 * This interfaces specifies values for parameters that must be parsed before the CLI
 * is fully initialized.
 */
interface IPreInitializationArgumentValues {
  plugins?: string[];
  debug?: boolean;
}

export class HeftCommandLineParser extends CommandLineParser {
  public readonly globalTerminal: ITerminal;

  private _terminalProvider: ConsoleTerminalProvider;
  private _loggingManager: LoggingManager;
  private _metricsCollector: MetricsCollector;
  private _heftConfiguration: HeftConfiguration;

  private _preInitializationArgumentValues: IPreInitializationArgumentValues;

  private _debugFlag!: CommandLineFlagParameter;

  public get isDebug(): boolean {
    return !!this._preInitializationArgumentValues.debug;
  }

  public constructor() {
    super({
      toolFilename: 'heft',
      toolDescription: 'Heft is a pluggable build system designed for web projects.'
    });

    // Pre-initialize with known argument values to determine state of "--debug"
    this._preInitializationArgumentValues = this._getPreInitializationArgumentValues();

    this._terminalProvider = new ConsoleTerminalProvider({
      debugEnabled: this.isDebug,
      verboseEnabled: this.isDebug
    });
    this.globalTerminal = new Terminal(this._terminalProvider);
    this._metricsCollector = new MetricsCollector();
    this._loggingManager = new LoggingManager({
      terminalProvider: this._terminalProvider
    });

    if (this.isDebug) {
      this._loggingManager.enablePrintStacks();
      InternalError.breakInDebugger = true;
    }

    this._heftConfiguration = HeftConfiguration.initialize({
      cwd: process.cwd(),
      terminalProvider: this._terminalProvider
    });
  }

  protected onDefineParameters(): void {
    this._debugFlag = this.defineFlagParameter({
      parameterLongName: Constants.debugParameterLongName,
      description: 'Show the full call stack if an error occurs while executing the tool'
    });
  }

  public async execute(args?: string[]): Promise<boolean> {
    // Defensively set the exit code to 1 so if the tool crashes for whatever reason,
    // we'll have a nonzero exit code.
    process.exitCode = 1;

    try {
      this._normalizeCwd();

      await this._checkForUpgradeAsync();

      const internalHeftSession: InternalHeftSession = await InternalHeftSession.initializeAsync({
        heftConfiguration: this._heftConfiguration,
        loggingManager: this._loggingManager,
        metricsCollector: this._metricsCollector,
        debugMode: this.isDebug
      });

      const actionOptions: IHeftActionOptions = {
        internalHeftSession: internalHeftSession,
        terminal: this.globalTerminal,
        loggingManager: this._loggingManager,
        metricsCollector: this._metricsCollector,
        heftConfiguration: this._heftConfiguration
      };

      this.addAction(new RunAction(actionOptions));
      for (const phase of internalHeftSession.phases) {
        this.addAction(new PhaseAction({ ...actionOptions, phase }));
      }

      return await super.execute(args);
    } catch (e) {
      await this._reportErrorAndSetExitCode(e as Error);
      return false;
    }
  }

  private async _checkForUpgradeAsync(): Promise<void> {
    // The .heft/clean.json file is a fairly reliable heuristic for detecting projects created prior to
    // the big config file redesign with Heft 0.14.0
    if (await FileSystem.existsAsync('.heft/clean.json')) {
      this.globalTerminal.writeErrorLine(
        '\nThis project has a ".heft/clean.json" file, which is now obsolete as of Heft 0.14.0.'
      );
      this.globalTerminal.writeLine(
        '\nFor instructions for migrating config files, please read UPGRADING.md in the @rushstack/heft package folder.\n'
      );
      throw new AlreadyReportedError();
    }
  }

  protected async onExecute(): Promise<void> {
    try {
      await super.onExecute();
    } catch (e) {
      await this._reportErrorAndSetExitCode(e as Error);
    }

    // If we make it here, things are fine and reset the exit code back to 0
    process.exitCode = 0;
  }

  private _normalizeCwd(): void {
    const buildFolder: string = this._heftConfiguration.buildFolder;
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
    // This is a rough parsing of the --debug parameter
    const parser: ArgumentParser = new ArgumentParser({ addHelp: false });
    parser.addArgument(this._debugFlag.longName, { dest: 'debug', action: 'storeTrue' });

    const [result]: IPreInitializationArgumentValues[] = parser.parseKnownArgs(args);
    return result;
  }

  private async _reportErrorAndSetExitCode(error: Error): Promise<void> {
    if (!(error instanceof AlreadyReportedError)) {
      this.globalTerminal.writeErrorLine(error.toString());
    }

    if (this.isDebug) {
      this.globalTerminal.writeLine();
      this.globalTerminal.writeErrorLine(error.stack!);
    }

    if (!process.exitCode || process.exitCode > 0) {
      process.exit(process.exitCode);
    } else {
      process.exit(1);
    }
  }
}
