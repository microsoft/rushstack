// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

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

import { Utilities } from '../utilities/Utilities';
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
import { initializeDotEnv } from '../logic/dotenv';

interface IRushXCommandLineArguments {
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
      const rushxArguments: IRushXCommandLineArguments = RushXCommandLine._parseCommandLineArguments();
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
      await RushXCommandLine._launchRushXInternalAsync(terminal, rushxArguments, rushConfiguration, options);
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
      if (error instanceof ProcessError) {
        process.exitCode = error.exitCode;
      } else {
        process.exitCode = 1;
      }
      // eslint-disable-next-line no-console
      console.error(Colorize.red('Error: ' + (error as Error).message));
    }
  }

  private static async _launchRushXInternalAsync(
    terminal: ITerminal,
    rushxArguments: IRushXCommandLineArguments,
    rushConfiguration: RushConfiguration | undefined,
    options: ILaunchOptions
  ): Promise<void> {
    const { quiet, help, commandName, commandArgs } = rushxArguments;

    if (!quiet) {
      RushStartupBanner.logStreamlinedBanner(Rush.version, options.isManaged);
    }
    // Are we in a Rush repo?
    NodeJsCompatibility.warnAboutCompatibilityIssues({
      isRushLib: true,
      alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError || false,
      rushConfiguration
    });

    // Find the governing package.json for this folder:
    const packageJsonLookup: PackageJsonLookup = new PackageJsonLookup();

    const packageJsonFilePath: string | undefined = packageJsonLookup.tryGetPackageJsonFilePathFor(
      process.cwd()
    );
    if (!packageJsonFilePath) {
      throw Error(
        'This command should be used inside a project folder. ' +
          'Unable to find a package.json file in the current working directory or any of its parents.'
      );
    }

    if (rushConfiguration && !rushConfiguration.tryGetProjectForPath(process.cwd())) {
      // GitHub #2713: Users reported confusion resulting from a situation where "rush install"
      // did not install the project's dependencies, because the project was not registered.
      // eslint-disable-next-line no-console
      console.log(
        Colorize.yellow(
          'Warning: You are invoking "rushx" inside a Rush repository, but this project is not registered in ' +
            `${RushConstants.rushJsonFilename}.`
        )
      );
    }

    const packageJson: IPackageJson = packageJsonLookup.loadPackageJson(packageJsonFilePath);

    const projectCommandSet: ProjectCommandSet = new ProjectCommandSet(packageJson);

    if (help) {
      RushXCommandLine._showUsage(packageJson, projectCommandSet);
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
    if (rushxArguments.commandArgs.length > 0) {
      commandWithArgs += ' ' + commandArgs.join(' ');
    }

    if (!quiet) {
      // eslint-disable-next-line no-console
      console.log(`> ${JSON.stringify(commandWithArgs)}\n`);
    }

    const packageFolder: string = path.dirname(packageJsonFilePath);

    const exitCode: number = Utilities.executeLifecycleCommand(commandWithArgs, {
      rushConfiguration,
      workingDirectory: packageFolder,
      // If there is a rush.json then use its .npmrc from the temp folder.
      // Otherwise look for npmrc in the project folder.
      initCwd: rushConfiguration ? rushConfiguration.commonTempFolder : packageFolder,
      handleOutput: false,
      environmentPathOptions: {
        includeProjectBin: true
      }
    });

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

  private static _parseCommandLineArguments(): IRushXCommandLineArguments {
    // 0 = node.exe
    // 1 = rushx
    const args: string[] = process.argv.slice(2);
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

    if (!commandName) {
      help = true;
    }

    if (unknownArgs.length > 0) {
      // Future TODO: Instead of just displaying usage info, we could display a
      // specific error about the unknown flag the user tried to pass to rushx.
      // eslint-disable-next-line no-console
      console.log(Colorize.red(`Unknown arguments: ${unknownArgs.map((x) => JSON.stringify(x)).join(', ')}`));
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

  private static _showUsage(packageJson: IPackageJson, projectCommandSet: ProjectCommandSet): void {
    // eslint-disable-next-line no-console
    console.log('usage: rushx [-h]');
    // eslint-disable-next-line no-console
    console.log('       rushx [-q/--quiet] [-d/--debug] [--ignore-hooks] <command> ...\n');

    // eslint-disable-next-line no-console
    console.log('Optional arguments:');
    // eslint-disable-next-line no-console
    console.log('  -h, --help            Show this help message and exit.');
    // eslint-disable-next-line no-console
    console.log('  -q, --quiet           Hide rushx startup information.');
    // eslint-disable-next-line no-console
    console.log('  -d, --debug           Run in debug mode.\n');

    if (projectCommandSet.commandNames.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Project commands for ${Colorize.cyan(packageJson.name)}:`);

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

        // eslint-disable-next-line no-console
        console.log(
          // Example: "  command: "
          '  ' +
            Colorize.cyan(Text.padEnd(commandName + ':', maxLength + 2)) +
            // Example: "do some thin..."
            Text.truncateWithEllipsis(escapedScriptBody, truncateLength)
        );
      }

      if (projectCommandSet.malformedScriptNames.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          '\n' +
            Colorize.yellow(
              'Warning: Some "scripts" entries in the package.json file' +
                ' have malformed names: ' +
                projectCommandSet.malformedScriptNames.map((x) => `"${x}"`).join(', ')
            )
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(Colorize.yellow('Warning: No commands are defined yet for this project.'));
      // eslint-disable-next-line no-console
      console.log(
        'You can define a command by adding a "scripts" table to the project\'s package.json file.'
      );
    }
  }
}
