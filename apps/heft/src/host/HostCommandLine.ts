import os from 'node:os';

import { AlreadyReportedError, InternalError } from '@rushstack/node-core-library';
import {
  ConsoleTerminalProvider,
  Terminal,
  type ITerminal,
  type ITerminalProvider
} from '@rushstack/terminal';

import { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftActionOptions } from '../cli/actions/IHeftAction';
import type { IHeftCommandLineParserState } from '../cli/HeftCommandLineParser';
import { MetricsCollector } from '../metrics/MetricsCollector';
import {
  InternalHeftSession,
  type IInternalHeftSessionPlanSeed
} from '../pluginFramework/InternalHeftSession';
import { LoggingManager } from '../pluginFramework/logging/LoggingManager';
import type { HeftChildReporter } from '../pluginFramework/logging/HeftChildReporter';
import { Constants } from '../utilities/Constants';
import type { IHostPlan } from './HostPlan';
import { createPlanSeed } from './createPlanSeed';
import { makeRequireStacksMatchTheHeftCommandLine } from './makeRequireStacksMatchTheHeftCommandLine';
import { tryExecutePlannedCommandAsync } from './tryExecutePlannedCommandAsync';

function isDebugToolParameterPresent(processArguments: ReadonlyArray<string>): boolean {
  for (let argumentIndex: number = 2; argumentIndex < processArguments.length; argumentIndex++) {
    const processArgument: string = processArguments[argumentIndex];
    if (!processArgument.startsWith('-')) {
      return false;
    }
    if (processArgument === Constants.debugParameterLongName) {
      return true;
    }
  }
  return false;
}

function tryInitializeChildReporter(): HeftChildReporter | undefined {
  const {
    _RUSH_REPORTER_CHILD_FD: childReporterFd,
    _RUSH_REPORTER_CHILD_ACK_FD: childReporterAckFd
  }: Record<string, string | undefined> = process.env;
  if (childReporterFd === undefined && childReporterAckFd === undefined) {
    return undefined;
  }
  const { HeftChildReporter: HeftChildReporterClass } =
    require('../pluginFramework/logging/HeftChildReporter') as {
      HeftChildReporter: typeof HeftChildReporter;
    };
  return HeftChildReporterClass.tryInitialize();
}

export class HostCommandLine {
  public readonly globalTerminal: ITerminal;

  readonly #plan: IHostPlan;
  readonly #planSeed: IInternalHeftSessionPlanSeed | undefined;
  readonly #debug: boolean;
  readonly #terminalProvider: ITerminalProvider;
  readonly #childReporter: HeftChildReporter | undefined;
  readonly #loggingManager: LoggingManager;
  readonly #metricsCollector: MetricsCollector;
  readonly #heftConfiguration: HeftConfiguration;

  public constructor(plan: IHostPlan) {
    this.#plan = plan;
    this.#debug = isDebugToolParameterPresent(process.argv);
    this.#childReporter = tryInitializeChildReporter();
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
      this.#loggingManager.enablePrintStacks();
      InternalError.breakInDebugger = true;
    }

    const numberOfCores: number = os.availableParallelism?.() ?? os.cpus().length;
    this.#heftConfiguration = HeftConfiguration.initialize({
      cwd: process.cwd(),
      terminalProvider: this.#terminalProvider,
      numberOfCores
    });
    this.#planSeed = createPlanSeed(plan, this.#heftConfiguration.buildFolderPath);

    this.#metricsCollector = new MetricsCollector();
  }

  public async executeAsync(): Promise<boolean> {
    process.exitCode = 1;

    try {
      makeRequireStacksMatchTheHeftCommandLine();
      this.#normalizeCwd();

      const internalHeftSession: InternalHeftSession = await InternalHeftSession.initializeAsync({
        debug: this.#debug,
        heftConfiguration: this.#heftConfiguration,
        loggingManager: this.#loggingManager,
        metricsCollector: this.#metricsCollector,
        planSeed: this.#planSeed
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

      const { command } = this.#plan;
      const plannedResult: boolean | undefined = command
        ? await tryExecutePlannedCommandAsync(command, actionOptions, state)
        : undefined;
      if (plannedResult !== undefined) {
        return plannedResult;
      }

      const args: string[] = process.argv.slice(2);
      const { tryExecuteLeanCommandLineAsync } = await import('../cli/LeanHeftCommandLine');
      makeRequireStacksMatchTheHeftCommandLine();
      const leanResult: boolean | undefined = await tryExecuteLeanCommandLineAsync(
        args,
        actionOptions,
        state
      );
      if (leanResult !== undefined) {
        return leanResult;
      }

      const { HeftFullCommandLineParser } = await import('../cli/HeftFullCommandLineParser');
      makeRequireStacksMatchTheHeftCommandLine();
      const fullParser: InstanceType<typeof HeftFullCommandLineParser> = new HeftFullCommandLineParser(state);
      return await fullParser.defineActionsAndExecuteAsync(actionOptions, undefined);
    } catch (error) {
      await this.#reportErrorAndSetExitCodeAsync(error as Error);
      return false;
    }
  }

  #normalizeCwd(): void {
    const buildFolder: string = this.#heftConfiguration.buildFolderPath;
    const currentCwd: string = process.cwd();
    if (currentCwd !== buildFolder) {
      this.globalTerminal.writeVerboseLine(`CWD is "${currentCwd}". Normalizing to "${buildFolder}".`);
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
