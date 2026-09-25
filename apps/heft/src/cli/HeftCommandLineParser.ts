// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'node:os';

import { InternalError, AlreadyReportedError } from '@rushstack/node-core-library';
import {
  Terminal,
  ConsoleTerminalProvider,
  type ITerminal,
  type ITerminalProvider
} from '@rushstack/terminal';

import { MetricsCollector } from '../metrics/MetricsCollector';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { InternalHeftSession } from '../pluginFramework/InternalHeftSession';
import { LoggingManager } from '../pluginFramework/logging/LoggingManager';
import type { IHeftActionOptions } from './actions/IHeftAction';
import { getToolParameterNamesFromArgs } from '../utilities/CliUtilities';
import { Constants } from '../utilities/Constants';
import type { HeftChildReporter } from '../pluginFramework/logging/HeftChildReporter';
import { tryExecuteLeanCommandLineAsync } from './LeanHeftCommandLine';

/**
 * State shared by the lean and the full command-line implementations.
 */
export interface IHeftCommandLineParserState {
  readonly internalHeftSession: InternalHeftSession;
  readonly childReporter: HeftChildReporter | undefined;
  reportErrorAndSetExitCodeAsync(error: Error): Promise<void>;
}

/**
 * Heft's command line.
 *
 * @remarks
 * Most invocations are handled by a lean implementation that only defines the parameters of the invoked action and
 * does not load ts-command-line's argparse-based parser. Anything that the lean implementation cannot handle with
 * byte-identical results (help, errors, unusual syntax, etc.) is handled by the full ts-command-line based
 * implementation in `HeftFullCommandLineParser`.
 */
export class HeftCommandLineParser {
  public readonly globalTerminal: ITerminal;

  readonly #debug: boolean;
  readonly #terminalProvider: ITerminalProvider;
  readonly #childReporter: HeftChildReporter | undefined;
  readonly #loggingManager: LoggingManager;
  readonly #metricsCollector: MetricsCollector;
  readonly #heftConfiguration: HeftConfiguration;

  public constructor() {
    // Pre-initialize with known argument values to determine state of "--debug"
    const toolParameters: Set<string> = getToolParameterNamesFromArgs(process.argv);
    this.#debug = toolParameters.has(Constants.debugParameterLongName);

    // Enable debug and verbose logging if the "--debug" flag is set. HeftChildReporter.tryInitialize() has no
    // effect and returns undefined unless one of the Rush child reporter environment variables is set, so the
    // module is only loaded in that case.
    const {
      _RUSH_REPORTER_CHILD_FD: childReporterFd,
      _RUSH_REPORTER_CHILD_ACK_FD: childReporterAckFd
    }: Record<string, string | undefined> = process.env;
    this.#childReporter =
      childReporterFd === undefined && childReporterAckFd === undefined
        ? undefined
        : (
            require('../pluginFramework/logging/HeftChildReporter') as {
              HeftChildReporter: typeof HeftChildReporter;
            }
          ).HeftChildReporter.tryInitialize();
    this.#terminalProvider =
      this.#childReporter ??
      new ConsoleTerminalProvider({
        debugEnabled: this.#debug,
        verboseEnabled: this.#debug
      });
    if (this.#debug && this.#childReporter) {
      this.#childReporter.debugEnabled = true;
      this.#childReporter.verboseEnabled = true;
    }
    this.globalTerminal = new Terminal(this.#terminalProvider);
    this.#loggingManager = new LoggingManager({
      terminalProvider: this.#terminalProvider,
      childReporter: this.#childReporter
    });
    if (this.#debug) {
      // Enable printing stacktraces if the "--debug" flag is set
      this.#loggingManager.enablePrintStacks();
      InternalError.breakInDebugger = true;
    }

    const numberOfCores: number = os.availableParallelism?.() ?? os.cpus().length;
    this.#heftConfiguration = HeftConfiguration.initialize({
      cwd: process.cwd(),
      terminalProvider: this.#terminalProvider,
      numberOfCores
    });

    this.#metricsCollector = new MetricsCollector();
  }

  public async executeAsync(args?: string[]): Promise<boolean> {
    // Defensively set the exit code to 1 so if the tool crashes for whatever reason,
    // we'll have a nonzero exit code.
    process.exitCode = 1;

    try {
      this.#normalizeCwd();

      const internalHeftSession: InternalHeftSession = await InternalHeftSession.initializeAsync({
        debug: this.#debug,
        heftConfiguration: this.#heftConfiguration,
        loggingManager: this.#loggingManager,
        metricsCollector: this.#metricsCollector
      });

      const actionOptions: IHeftActionOptions = {
        internalHeftSession: internalHeftSession,
        terminal: this.globalTerminal,
        loggingManager: this.#loggingManager,
        metricsCollector: this.#metricsCollector,
        heftConfiguration: this.#heftConfiguration
      };

      const state: IHeftCommandLineParserState = {
        internalHeftSession,
        childReporter: this.#childReporter,
        reportErrorAndSetExitCodeAsync: (error: Error) => this.#reportErrorAndSetExitCodeAsync(error)
      };

      // 0=node.exe, 1=script name
      const leanResult: boolean | undefined = await tryExecuteLeanCommandLineAsync(
        args ?? process.argv.slice(2),
        actionOptions,
        state
      );
      if (leanResult !== undefined) {
        return leanResult;
      }

      const { HeftFullCommandLineParser } = await import('./HeftFullCommandLineParser');
      const fullParser: InstanceType<typeof HeftFullCommandLineParser> = new HeftFullCommandLineParser(state);
      return await fullParser.defineActionsAndExecuteAsync(actionOptions, args);
    } catch (e) {
      await this.#reportErrorAndSetExitCodeAsync(e as Error);
      return false;
    }
  }

  #normalizeCwd(): void {
    const buildFolder: string = this.#heftConfiguration.buildFolderPath;
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

  async #reportErrorAndSetExitCodeAsync(error: Error): Promise<void> {
    if (!(error instanceof AlreadyReportedError)) {
      if (this.#childReporter) {
        this.#childReporter.emitDiagnostic(Constants.heftPackageName, error, 'error');
      } else {
        this.globalTerminal.writeErrorLine(error.toString());
      }
    }

    if (this.#debug) {
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
