// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type * as childProcess from 'node:child_process';

import { type ILogMessageCallbackOptions, pnpmSyncCopyAsync } from 'pnpm-sync-lib';

import { PackageJsonLookup, type IPackageJson, Text, FileSystem, Async } from '@rushstack/node-core-library';
import {
  Colorize,
  ConsoleTerminalProvider,
  DEFAULT_CONSOLE_WIDTH,
  type ITerminalProvider,
  PrintUtilities,
  Terminal,
  type ITerminal
} from '@rushstack/terminal';

import { Utilities, type ILifecycleCommandOptions } from '../utilities/Utilities';
import { ProjectCommandSet } from '../logic/ProjectCommandSet';
import { type ILaunchOptions, Rush } from '../api/Rush';
import { RushConfiguration } from '../api/RushConfiguration';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';
import { RushStartupBanner } from './RushStartupBanner';
import { EventHooksManager } from '../logic/EventHooksManager';
import { Event } from '../api/EventHooks';
import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';
import { RushConstants } from '../logic/RushConstants';
import { PnpmSyncUtilities } from '../utilities/PnpmSyncUtilities';
import { initializeDotEnv, loadDotEnvForEnvironment } from '../logic/dotenv';
import { escapeArgumentIfNeeded } from '../utilities/executionUtilities';

/** Native Rushx arguments. Options after the command belong to the script. @beta */
export interface IRushXCommandLineArguments {
  /**
   * Flag indicating whether to suppress any rushx startup information.
   */
  quiet: boolean;

  /**
   * Flag indicating whether the user has asked for help.
   */
  help: boolean;

  /**
   * Flag indicating whether the user has requested debug mode.
   */
  isDebug: boolean;

  /**
   * Flag indicating whether the user wants to not call hooks.
   */
  ignoreHooks: boolean;

  /**
   * The command to run (i.e., the target "script" in package.json.)
   */
  commandName: string;

  /**
   * Any additional arguments/parameters passed after the command name.
   */
  commandArgs: string[];
}

/** Explicit process state and an optional owned asynchronous spawn seam for native Rushx. @beta */
export interface IRushXCommandOptions {
  /** Parse before dotenv initialization, as the native frontend does. */
  readonly arguments: IRushXCommandLineArguments;
  readonly abortSignal?: AbortSignal;
  readonly cwd: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly rushConfiguration: RushConfiguration | undefined;
  readonly terminal: ITerminal;
  /** Console output preserves native ANSI and newline bytes independently of diagnostic terminal capabilities. */
  readonly consoleTerminal: ITerminal;
  readonly launchOptions: ILaunchOptions;
  /** When omitted, preserves the native CLI's synchronous inherited-stdio execution. */
  readonly spawn?: (
    command: string,
    args: ReadonlyArray<string>,
    options: childProcess.SpawnOptions
  ) => childProcess.ChildProcess;
}

/**
 * Native Rushx parsing and script execution with explicit request-local process state.
 *
 * @remarks
 * The caller owns dotenv initialization, cwd confinement and child lifetime. Active hooks require in-process execution.
 * This helper never changes process cwd, environment or exitCode.
 * @beta
 */
export class RushXCommand {
  public static parseArguments(
    argv: ReadonlyArray<string>,
    environment: Readonly<NodeJS.ProcessEnv>
  ): IRushXCommandLineArguments {
    return _parseCommandLineArguments(argv, environment);
  }

  public static getPackageFolder(cwd: string): string {
    return path.dirname(_getPackageJsonFilePath(new PackageJsonLookup(), cwd));
  }

  /** Loads repository then user dotenv files into a copy, without consulting cached user state. */
  public static prepareEnvironment(
    cwd: string,
    environment: Readonly<NodeJS.ProcessEnv>,
    rushJsonFilePath: string
  ): NodeJS.ProcessEnv {
    return loadDotEnvForEnvironment(cwd, environment, rushJsonFilePath);
  }

  /** Returns a pre-execution boundary, never a reason to replay an executed script. */
  public static getInProcessReason(
    args: IRushXCommandLineArguments,
    environment: Readonly<NodeJS.ProcessEnv>,
    configuration: RushConfiguration
  ): string | undefined {
    if (args.help) return 'Rushx help requires the native frontend.';
    if (
      !args.ignoreHooks &&
      environment[EnvironmentVariableNames._RUSH_RECURSIVE_RUSHX_CALL] !== '1' &&
      [Event.preRushx, Event.postRushx].some((event) => configuration.eventHooks.get(event).length > 0)
    ) {
      return 'Rushx event hooks still require process-global argv and inherited synchronous I/O.';
    }
    return undefined;
  }

  public static async executeAsync(options: IRushXCommandOptions): Promise<number> {
    const { terminal, consoleTerminal, environment, arguments: args, rushConfiguration, launchOptions } = options;
    try {
      const reason: string | undefined = rushConfiguration &&
        RushXCommand.getInProcessReason(args, environment, rushConfiguration);
      if (reason) throw new Error(reason);
      options.abortSignal?.throwIfAborted();
      const ignoredHooks: EventHooksManager | undefined =
        rushConfiguration && args.ignoreHooks &&
        environment[EnvironmentVariableNames._RUSH_RECURSIVE_RUSHX_CALL] !== '1'
          ? new EventHooksManager(rushConfiguration) : undefined;
      ignoredHooks?.handle(Event.preRushx, args.isDebug, true, consoleTerminal);
      await _launchRushXInternalAsync(terminal, args, rushConfiguration, launchOptions, options);
      ignoredHooks?.handle(Event.postRushx, args.isDebug, true, consoleTerminal);
      return 0;
    } catch (error) {
      consoleTerminal.writeErrorLine(Colorize.red('Error: ' + (error as Error).message));
      return _getRushXExitCode(error);
    }
  }
}

class ProcessError extends Error {
  public readonly exitCode: number;
  public constructor(message: string, exitCode: number) {
    super(message);

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc.
    // https://github.com/microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = ProcessError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any

    this.exitCode = exitCode;
  }
}

export class RushXCommandLine {
  public static async launchRushXAsync(launcherVersion: string, options: ILaunchOptions): Promise<void> {
    try {
      const rushxArguments: IRushXCommandLineArguments = _parseCommandLineArguments(
        process.argv.slice(2), process.env,
        // eslint-disable-next-line no-console
        (message) => console.log(message)
      );
      const rushJsonFilePath: string | undefined = RushConfiguration.tryFindRushJsonLocation({
        showVerbose: false
      });
      const { isDebug, help, ignoreHooks } = rushxArguments;

      const terminalProvider: ITerminalProvider = new ConsoleTerminalProvider({
        debugEnabled: isDebug,
        verboseEnabled: isDebug
      });
      const terminal: ITerminal = new Terminal(terminalProvider);

      initializeDotEnv(terminal, rushJsonFilePath);

      const rushConfiguration: RushConfiguration | undefined = rushJsonFilePath
        ? RushConfiguration.loadFromConfigurationFile(rushJsonFilePath)
        : undefined;
      const eventHooksManager: EventHooksManager | undefined = rushConfiguration
        ? new EventHooksManager(rushConfiguration)
        : undefined;

      const suppressHooks: boolean = process.env[EnvironmentVariableNames._RUSH_RECURSIVE_RUSHX_CALL] === '1';
      const attemptHooks: boolean = !suppressHooks && !help;
      if (attemptHooks) {
        try {
          eventHooksManager?.handle(Event.preRushx, isDebug, ignoreHooks);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(Colorize.red('PreRushx hook error: ' + (error as Error).message));
        }
      }
      // Node.js can sometimes accidentally terminate with a zero exit code  (e.g. for an uncaught
      // promise exception), so we start with the assumption that the exit code is 1
      // and set it to 0 only on success.
      process.exitCode = 1;
      await _launchRushXInternalAsync(terminal, rushxArguments, rushConfiguration, options);
      if (attemptHooks) {
        try {
          eventHooksManager?.handle(Event.postRushx, isDebug, ignoreHooks);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(Colorize.red('PostRushx hook error: ' + (error as Error).message));
        }
      }

      // Getting here means that we are all done with no major errors
      process.exitCode = 0;
    } catch (error) {
      process.exitCode = _getRushXExitCode(error);
      // eslint-disable-next-line no-console
      console.error(Colorize.red('Error: ' + (error as Error).message));
    }
  }
}

function _getRushXExitCode(error: unknown): number {
  return error instanceof ProcessError ? error.exitCode : 1;
}

async function _launchRushXInternalAsync(
  terminal: ITerminal,
  rushxArguments: IRushXCommandLineArguments,
  rushConfiguration: RushConfiguration | undefined,
  options: ILaunchOptions,
  execution?: IRushXCommandOptions
): Promise<void> {
  const { quiet, help, commandName, commandArgs } = rushxArguments;
  const writeLine: (message: string) => void = execution
    ? (message) => execution.consoleTerminal.writeLine(message)
    // eslint-disable-next-line no-console
    : (message) => console.log(message);

  if (!quiet) {
    RushStartupBanner.logStreamlinedBanner(Rush.version, options.isManaged, execution?.consoleTerminal);
  }
  // Are we in a Rush repo?
  NodeJsCompatibility.warnAboutCompatibilityIssues({
    isRushLib: true,
    alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError || false,
    rushConfiguration,
    terminal: execution?.consoleTerminal
  });

  // Find the governing package.json for this folder:
  const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

  const cwd: string = execution?.cwd ?? process.cwd();
  const packageJsonFilePath: string = _getPackageJsonFilePath(packageJsonLookup, cwd);

  if (rushConfiguration && !rushConfiguration.tryGetProjectForPath(cwd)) {
    // GitHub #2713: Users reported confusion resulting from a situation where "rush install"
    // did not install the project's dependencies, because the project was not registered.
    writeLine(
      Colorize.yellow(
        'Warning: You are invoking "rushx" inside a Rush repository, but this project is not registered in ' +
          `${RushConstants.rushJsonFilename}.`
      )
    );
  }

  const packageJson: IPackageJson = packageJsonLookup.loadPackageJson(packageJsonFilePath);

  const projectCommandSet: ProjectCommandSet = new ProjectCommandSet(packageJson);

  if (help) {
    _showUsage(packageJson, projectCommandSet, writeLine);
    return;
  }

  const scriptBody: string | undefined = projectCommandSet.tryGetScriptBody(commandName);

  if (scriptBody === undefined) {
    let errorMessage: string = `The command "${commandName}" is not defined in the package.json file for this project.`;

    if (projectCommandSet.commandNames.length > 0) {
      errorMessage +=
        '\nAvailable commands for this project are: ' +
        projectCommandSet.commandNames.map((x) => `"${x}"`).join(', ');
    }

    throw Error(errorMessage);
  }

  let commandWithArgs: string = scriptBody;
  let commandWithArgsForDisplay: string = scriptBody;
  if (commandArgs.length > 0) {
    const escapedRemainingArgs: string[] = commandArgs.map((x) => escapeArgumentIfNeeded(x));
    commandWithArgs += ' ' + escapedRemainingArgs.join(' ');

    // Display it nicely without the extra quotes
    commandWithArgsForDisplay += ' ' + commandArgs.join(' ');
  }

  if (!quiet) {
    writeLine(`> ${JSON.stringify(commandWithArgsForDisplay)}\n`);
  }

  const packageFolder: string = path.dirname(packageJsonFilePath);

  const lifecycleOptions: ILifecycleCommandOptions = {
    rushConfiguration,
    workingDirectory: packageFolder,
    // If there is a rush.json then use its .npmrc from the temp folder.
    // Otherwise look for npmrc in the project folder.
    initCwd: rushConfiguration ? rushConfiguration.commonTempFolder : packageFolder,
    handleOutput: false,
    ...(execution ? { initialEnvironment: execution.environment } : {}),
    environmentPathOptions: {
      includeProjectBin: true
    }
  };
  const exitCode: number = execution?.spawn
    ? await _executeOwnedLifecycleAsync(commandWithArgs, lifecycleOptions, execution.spawn)
    : Utilities.executeLifecycleCommand(commandWithArgs, lifecycleOptions);

  execution?.abortSignal?.throwIfAborted();
  if (rushConfiguration?.isPnpm && rushConfiguration?.experimentsConfiguration) {
    const { configuration: experiments } = rushConfiguration?.experimentsConfiguration;

    if (experiments?.usePnpmSyncForInjectedDependencies) {
      const pnpmSyncJsonPath: string = `${packageFolder}/${RushConstants.nodeModulesFolderName}/${RushConstants.pnpmSyncFilename}`;
      if (await FileSystem.existsAsync(pnpmSyncJsonPath)) {
        const { PackageExtractor } = await import(
          /* webpackChunkName: 'PackageExtractor' */
          '@rushstack/package-extractor'
        );
        await pnpmSyncCopyAsync({
          pnpmSyncJsonPath,
          ensureFolderAsync: FileSystem.ensureFolderAsync,
          forEachAsyncWithConcurrency: Async.forEachAsync,
          getPackageIncludedFiles: PackageExtractor.getPackageIncludedFilesAsync,
          logMessageCallback: (logMessageOptions: ILogMessageCallbackOptions) =>
            PnpmSyncUtilities.processLogMessage(logMessageOptions, terminal)
        });
      }
    }
  }

  if (exitCode > 0) {
    throw new ProcessError(`Failed calling ${commandWithArgs}.  Exit code: ${exitCode}`, exitCode);
  }
}

function _parseCommandLineArguments(
  args: ReadonlyArray<string>,
  environment: Readonly<NodeJS.ProcessEnv>,
  reportUnknownArguments?: (message: string) => void
): IRushXCommandLineArguments {
  const unknownArgs: string[] = [];

  let help: boolean = false;
  let quiet: boolean = false;
  let commandName: string = '';
  let isDebug: boolean = false;
  let ignoreHooks: boolean = false;
  const commandArgs: string[] = [];

  for (let index: number = 0; index < args.length; index++) {
    const argValue: string = args[index];

    if (!commandName) {
      if (argValue === '-q' || argValue === '--quiet') {
        quiet = true;
      } else if (argValue === '-h' || argValue === '--help') {
        help = true;
      } else if (argValue === '-d' || argValue === '--debug') {
        isDebug = true;
      } else if (argValue === '--ignore-hooks') {
        ignoreHooks = true;
      } else if (argValue.startsWith('-')) {
        unknownArgs.push(args[index]);
      } else {
        commandName = args[index];
      }
    } else {
      commandArgs.push(args[index]);
    }
  }

  const quietModeValue: string | undefined = environment[EnvironmentVariableNames.RUSH_QUIET_MODE];
  if (quietModeValue === '1' || quietModeValue === 'true') {
    quiet = true;
  }

  if (!commandName) {
    help = true;
  }

  if (unknownArgs.length > 0) {
    // Future TODO: Instead of just displaying usage info, we could display a
    // specific error about the unknown flag the user tried to pass to rushx.
    reportUnknownArguments?.(
      Colorize.red(`Unknown arguments: ${unknownArgs.map((x) => JSON.stringify(x)).join(', ')}`)
    );
    help = true;
  }

  return {
    help,
    quiet,
    isDebug,
    ignoreHooks,
    commandName,
    commandArgs
  };
}

function _showUsage(
  packageJson: IPackageJson,
  projectCommandSet: ProjectCommandSet,
  writeLine: (message: string) => void
): void {
  writeLine('usage: rushx [-h]');
  writeLine('       rushx [-q/--quiet] [-d/--debug] [--ignore-hooks] <command> ...\n');

  writeLine('Optional arguments:');
  writeLine('  -h, --help            Show this help message and exit.');
  writeLine('  -q, --quiet           Hide rushx startup information.');
  writeLine('  -d, --debug           Run in debug mode.\n');

  if (projectCommandSet.commandNames.length > 0) {
    writeLine(`Project commands for ${Colorize.cyan(packageJson.name)}:`);

    // Calculate the length of the longest script name, for formatting
    let maxLength: number = 0;
    for (const commandName of projectCommandSet.commandNames) {
      maxLength = Math.max(maxLength, commandName.length);
    }

    for (const commandName of projectCommandSet.commandNames) {
      const escapedScriptBody: string = JSON.stringify(projectCommandSet.getScriptBody(commandName));

      // The length of the string e.g. "  command: "
      const firstPartLength: number = 2 + maxLength + 2;
      // The length for truncating the escaped escapedScriptBody so it doesn't wrap
      // to the next line
      const consoleWidth: number = PrintUtilities.getConsoleWidth() || DEFAULT_CONSOLE_WIDTH;
      const truncateLength: number = Math.max(0, consoleWidth - firstPartLength) - 1;

      writeLine(
        // Example: "  command: "
        '  ' +
          Colorize.cyan(Text.padEnd(commandName + ':', maxLength + 2)) +
          // Example: "do some thin..."
          Text.truncateWithEllipsis(escapedScriptBody, truncateLength)
      );
    }

    if (projectCommandSet.malformedScriptNames.length > 0) {
      writeLine(
        '\n' +
          Colorize.yellow(
            'Warning: Some "scripts" entries in the package.json file' +
              ' have malformed names: ' +
              projectCommandSet.malformedScriptNames.map((x) => `"${x}"`).join(', ')
          )
      );
    }
  } else {
    writeLine(Colorize.yellow('Warning: No commands are defined yet for this project.'));
    writeLine('You can define a command by adding a "scripts" table to the project\'s package.json file.');
  }
}

function _getPackageJsonFilePath(lookup: PackageJsonLookup, cwd: string): string {
  const packageJsonFilePath: string | undefined = lookup.tryGetPackageJsonFilePathFor(cwd);
  if (!packageJsonFilePath) {
    throw Error(
      'This command should be used inside a project folder. ' +
        'Unable to find a package.json file in the current working directory or any of its parents.'
    );
  }
  return packageJsonFilePath;
}

function _executeOwnedLifecycleAsync(
  command: string,
  options: ILifecycleCommandOptions,
  spawn: NonNullable<IRushXCommandOptions['spawn']>
): Promise<number> {
  const child: childProcess.ChildProcess = Utilities.executeLifecycleCommandAsync(
    command, { ...options, stdio: 'pipe' }, spawn
  );
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === null) reject(new Error('An unknown error occurred.'));
      else resolve(code);
    });
  });
}
