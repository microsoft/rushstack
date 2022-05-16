// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import * as os from 'os';
import * as path from 'path';

import { CommandLineParser, CommandLineFlagParameter, CommandLineHelper } from '@rushstack/ts-command-line';
import {
  InternalError,
  AlreadyReportedError,
  ConsoleTerminalProvider,
  Terminal
} from '@rushstack/node-core-library';
import { PrintUtilities } from '@rushstack/terminal';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from '../logic/RushConstants';
import {
  Command,
  CommandLineConfiguration,
  IGlobalCommandConfig,
  IPhasedCommandConfig
} from '../api/CommandLineConfiguration';
import { strings } from '../loc';
import { RushErrors } from '../utilities/RushErrors';

import { AddAction } from './actions/AddAction';
import { ChangeAction } from './actions/ChangeAction';
import { CheckAction } from './actions/CheckAction';
import { DeployAction } from './actions/DeployAction';
import { InitAction } from './actions/InitAction';
import { InitAutoinstallerAction } from './actions/InitAutoinstallerAction';
import { InitDeployAction } from './actions/InitDeployAction';
import { InstallAction } from './actions/InstallAction';
import { LinkAction } from './actions/LinkAction';
import { ListAction } from './actions/ListAction';
import { PublishAction } from './actions/PublishAction';
import { PurgeAction } from './actions/PurgeAction';
import { ScanAction } from './actions/ScanAction';
import { UnlinkAction } from './actions/UnlinkAction';
import { UpdateAction } from './actions/UpdateAction';
import { UpdateAutoinstallerAction } from './actions/UpdateAutoinstallerAction';
import { VersionAction } from './actions/VersionAction';
import { UpdateCloudCredentialsAction } from './actions/UpdateCloudCredentialsAction';

import { GlobalScriptAction } from './scriptActions/GlobalScriptAction';
import { IBaseScriptActionOptions } from './scriptActions/BaseScriptAction';

import { Telemetry } from '../logic/Telemetry';
import { RushGlobalFolder } from '../api/RushGlobalFolder';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';
import { SetupAction } from './actions/SetupAction';
import { ICustomCommandLineConfigurationInfo, PluginManager } from '../pluginFramework/PluginManager';
import { RushSession } from '../pluginFramework/RushSession';
import { PhasedScriptAction } from './scriptActions/PhasedScriptAction';
import { IBuiltInPluginConfiguration } from '../pluginFramework/PluginLoader/BuiltInPluginLoader';

/**
 * Options for `RushCommandLineParser`.
 */
export interface IRushCommandLineParserOptions {
  cwd: string; // Defaults to `cwd`
  alreadyReportedNodeTooNewError: boolean;
  builtInPluginConfigurations: IBuiltInPluginConfiguration[];
}

export class RushCommandLineParser extends CommandLineParser {
  public telemetry: Telemetry | undefined;
  public rushGlobalFolder!: RushGlobalFolder;
  public readonly rushConfiguration!: RushConfiguration;
  public readonly rushSession: RushSession;
  public readonly pluginManager: PluginManager;

  private _debugParameter!: CommandLineFlagParameter;
  private _quietParameter!: CommandLineFlagParameter;
  private _restrictConsoleOutput: boolean = RushCommandLineParser.shouldRestrictConsoleOutput();
  private readonly _rushOptions: IRushCommandLineParserOptions;
  private readonly _terminalProvider: ConsoleTerminalProvider;
  private readonly _terminal: Terminal;

  public constructor(options?: Partial<IRushCommandLineParserOptions>) {
    super({
      toolFilename: 'rush',
      toolDescription: strings.rushToolDescription,
      enableTabCompletionAction: true
    });

    this._terminalProvider = new ConsoleTerminalProvider();
    this._terminal = new Terminal(this._terminalProvider);
    this._rushOptions = this._normalizeOptions(options || {});

    try {
      const rushJsonFilename: string | undefined = RushConfiguration.tryFindRushJsonLocation({
        startingFolder: this._rushOptions.cwd,
        showVerbose: !this._restrictConsoleOutput
      });
      if (rushJsonFilename) {
        this.rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      }
    } catch (error) {
      this._reportErrorAndSetExitCode(error as Error);
    }

    NodeJsCompatibility.warnAboutCompatibilityIssues({
      isRushLib: true,
      alreadyReportedNodeTooNewError: this._rushOptions.alreadyReportedNodeTooNewError,
      rushConfiguration: this.rushConfiguration
    });

    this.rushSession = new RushSession({
      getIsDebugMode: () => this.isDebug,
      terminalProvider: this._terminalProvider
    });
    this.pluginManager = new PluginManager({
      rushSession: this.rushSession,
      rushConfiguration: this.rushConfiguration,
      terminal: this._terminal,
      builtInPluginConfigurations: this._rushOptions.builtInPluginConfigurations,
      restrictConsoleOutput: this._restrictConsoleOutput
    });

    this._populateActions();

    const pluginCommandLineConfigurations: ICustomCommandLineConfigurationInfo[] =
      this.pluginManager.tryGetCustomCommandLineConfigurationInfos();
    for (const { commandLineConfiguration, pluginLoader } of pluginCommandLineConfigurations) {
      try {
        this._addCommandLineConfigActions(commandLineConfiguration);
      } catch (e) {
        this._terminal.writeErrorLine(
          RushErrors.getPluginAddCommandLineActionsErrorMessage(
            pluginLoader.pluginName,
            pluginLoader.packageName,
            e as Error
          )
        );
      }
    }
  }

  public get isDebug(): boolean {
    return this._debugParameter.value;
  }

  public get isQuiet(): boolean {
    return this._quietParameter.value;
  }

  /**
   * Utility to determine if the app should restrict writing to the console.
   */
  public static shouldRestrictConsoleOutput(): boolean {
    if (CommandLineHelper.isTabCompletionActionRequest(process.argv)) {
      return true;
    }

    for (let i: number = 2; i < process.argv.length; i++) {
      const arg: string = process.argv[i];
      if (arg === '-q' || arg === '--quiet' || arg === '--json') {
        return true;
      }
    }

    return false;
  }

  public flushTelemetry(): void {
    this.telemetry?.flush();
  }

  public async execute(args?: string[]): Promise<boolean> {
    this._terminalProvider.verboseEnabled = this.isDebug;

    await this.pluginManager.tryInitializeUnassociatedPluginsAsync();

    return await super.execute(args);
  }

  protected onDefineParameters(): void {
    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: strings.rushToolDebugFlagDescription
    });

    this._quietParameter = this.defineFlagParameter({
      parameterLongName: '--quiet',
      parameterShortName: '-q',
      description: strings.rushToolQuietFlagDescription
    });
  }

  protected async onExecute(): Promise<void> {
    // Defensively set the exit code to 1 so if Rush crashes for whatever reason, we'll have a nonzero exit code.
    // For example, Node.js currently has the inexcusable design of terminating with zero exit code when
    // there is an uncaught promise exception.  This will supposedly be fixed in Node.js 9.
    // Ideally we should do this for all the Rush actions, but "rush build" is the most critical one
    // -- if it falsely appears to succeed, we could merge bad PRs, publish empty packages, etc.
    process.exitCode = 1;

    if (this._debugParameter.value) {
      InternalError.breakInDebugger = true;
    }

    try {
      await this._wrapOnExecuteAsync();
      // If we make it here, everything went fine, so reset the exit code back to 0
      process.exitCode = 0;
    } catch (error) {
      this._reportErrorAndSetExitCode(error as Error);
    }

    await this.telemetry?.ensureFlushedAsync();
  }

  private _normalizeOptions(options: Partial<IRushCommandLineParserOptions>): IRushCommandLineParserOptions {
    return {
      cwd: options.cwd || process.cwd(),
      alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError || false,
      builtInPluginConfigurations: options.builtInPluginConfigurations || []
    };
  }

  private async _wrapOnExecuteAsync(): Promise<void> {
    if (this.rushConfiguration) {
      this.telemetry = new Telemetry(this.rushConfiguration, this.rushSession);
    }

    await super.onExecute();
    if (this.telemetry) {
      this.flushTelemetry();
    }
  }

  private _populateActions(): void {
    try {
      this.rushGlobalFolder = new RushGlobalFolder();

      // Alphabetical order
      this.addAction(new AddAction(this));
      this.addAction(new ChangeAction(this));
      this.addAction(new CheckAction(this));
      this.addAction(new DeployAction(this));
      this.addAction(new InitAction(this));
      this.addAction(new InitAutoinstallerAction(this));
      this.addAction(new InitDeployAction(this));
      this.addAction(new InstallAction(this));
      this.addAction(new LinkAction(this));
      this.addAction(new ListAction(this));
      this.addAction(new PublishAction(this));
      this.addAction(new PurgeAction(this));
      this.addAction(new ScanAction(this));
      this.addAction(new SetupAction(this));
      this.addAction(new UnlinkAction(this));
      this.addAction(new UpdateAction(this));
      this.addAction(new UpdateAutoinstallerAction(this));
      this.addAction(new UpdateCloudCredentialsAction(this));
      this.addAction(new VersionAction(this));

      this._populateScriptActions();
    } catch (error) {
      this._reportErrorAndSetExitCode(error as Error);
    }
  }

  private _populateScriptActions(): void {
    // If there is not a rush.json file, we still want "build" and "rebuild" to appear in the
    // command-line help
    let commandLineConfigFilePath: string | undefined;
    if (this.rushConfiguration) {
      commandLineConfigFilePath = path.join(
        this.rushConfiguration.commonRushConfigFolder,
        RushConstants.commandLineFilename
      );
    }

    const commandLineConfiguration: CommandLineConfiguration =
      CommandLineConfiguration.loadFromFileOrDefault(commandLineConfigFilePath);
    this._addCommandLineConfigActions(commandLineConfiguration);
  }

  private _addCommandLineConfigActions(commandLineConfiguration: CommandLineConfiguration): void {
    // Register each custom command
    for (const command of commandLineConfiguration.commands.values()) {
      this._addCommandLineConfigAction(commandLineConfiguration, command);
    }
  }

  private _addCommandLineConfigAction(
    commandLineConfiguration: CommandLineConfiguration,
    command: Command
  ): void {
    if (this.tryGetAction(command.name)) {
      throw new Error(RushErrors.getCommandCollisionErrorMessage(command.name));
    }

    switch (command.commandKind) {
      case RushConstants.globalCommandKind: {
        this._addGlobalScriptAction(commandLineConfiguration, command);
        break;
      }

      case RushConstants.phasedCommandKind: {
        if (
          !command.isSynthetic && // synthetic commands come from bulk commands
          !this.rushConfiguration.experimentsConfiguration.configuration.phasedCommands
        ) {
          throw new Error(RushErrors.getPhasedCommandsExperimentMustBeEnabledErrorMessage(command.name));
        }

        this._addPhasedCommandLineConfigAction(commandLineConfiguration, command);
        break;
      }

      default:
        throw new Error(
          RushErrors.getUnsupportedCommandKindErrorMessage(
            (command as Command).name,
            (command as Command).commandKind
          )
        );
    }
  }

  private _getSharedCommandActionOptions<TCommand extends Command>(
    commandLineConfiguration: CommandLineConfiguration,
    command: TCommand
  ): IBaseScriptActionOptions<TCommand> {
    return {
      actionName: command.name,
      summary: command.summary,
      documentation: command.description || command.summary,
      safeForSimultaneousRushProcesses: command.safeForSimultaneousRushProcesses,

      command,
      parser: this,
      commandLineConfiguration: commandLineConfiguration
    };
  }

  private _addGlobalScriptAction(
    commandLineConfiguration: CommandLineConfiguration,
    command: IGlobalCommandConfig
  ): void {
    if (
      command.name === RushConstants.buildCommandName ||
      command.name === RushConstants.rebuildCommandName
    ) {
      throw new Error(RushErrors.getDisallowedGlobalCommandErrorMessage(command.name));
    }

    const sharedCommandOptions: IBaseScriptActionOptions<IGlobalCommandConfig> =
      this._getSharedCommandActionOptions(commandLineConfiguration, command);

    this.addAction(
      new GlobalScriptAction({
        ...sharedCommandOptions,

        shellCommand: command.shellCommand,
        autoinstallerName: command.autoinstallerName
      })
    );
  }

  private _addPhasedCommandLineConfigAction(
    commandLineConfiguration: CommandLineConfiguration,
    command: IPhasedCommandConfig
  ): void {
    const baseCommandOptions: IBaseScriptActionOptions<IPhasedCommandConfig> =
      this._getSharedCommandActionOptions(commandLineConfiguration, command);

    this.addAction(
      new PhasedScriptAction({
        ...baseCommandOptions,

        enableParallelism: command.enableParallelism,
        incremental: command.incremental || false,
        disableBuildCache: command.disableBuildCache || false,

        initialPhases: command.phases,
        watchPhases: command.watchPhases,
        phases: commandLineConfiguration.phases,

        alwaysWatch: command.alwaysWatch,
        alwaysInstall: command.alwaysInstall
      })
    );
  }

  private _reportErrorAndSetExitCode(error: Error): void {
    if (!(error instanceof AlreadyReportedError)) {
      const prefix: string = 'ERROR: ';
      console.error(os.EOL + colors.red(PrintUtilities.wrapWords(prefix + error.message)));
    }

    if (this._debugParameter.value) {
      // If catchSyncErrors() called this, then show a call stack similar to what Node.js
      // would show for an uncaught error
      console.error(os.EOL + error.stack);
    }

    this.flushTelemetry();

    // Ideally we want to eliminate all calls to process.exit() from our code, and replace them
    // with normal control flow that properly cleans up its data structures.
    // For this particular call, we have a problem that the RushCommandLineParser constructor
    // performs nontrivial work that can throw an exception.  Either the Rush class would need
    // to handle reporting for those exceptions, or else _populateActions() should be moved
    // to a RushCommandLineParser lifecycle stage that can handle it.
    if (process.exitCode !== undefined) {
      process.exit(process.exitCode);
    } else {
      process.exit(1);
    }
  }
}
