// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  CommandLineParser,
  type CommandLineFlagParameter,
  CommandLineHelper
} from '@rushstack/ts-command-line';
import {
  createRushDiagnostic,
  type IRushDiagnostic,
  type IScopedReporter,
  type LifecycleEmitter,
  type ReporterMessageSeverity
} from '@rushstack/rush-reporter';
import { InternalError, AlreadyReportedError, Text } from '@rushstack/node-core-library';
import {
  ConsoleTerminalProvider,
  Terminal,
  PrintUtilities,
  Colorize,
  type ITerminal,
  type ITerminalProvider,
  TerminalProviderSeverity
} from '@rushstack/terminal';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from '../logic/RushConstants';
import {
  type Command,
  CommandLineConfiguration,
  type IGlobalCommandConfig,
  type IPhasedCommandConfig
} from '../api/CommandLineConfiguration';
import { AddAction } from './actions/AddAction';
import { AlertAction } from './actions/AlertAction';
import { BridgePackageAction } from './actions/BridgePackageAction';
import { ChangeAction } from './actions/ChangeAction';
import { CheckAction } from './actions/CheckAction';
import { DeployAction } from './actions/DeployAction';
import { InitAction } from './actions/InitAction';
import { InitAutoinstallerAction } from './actions/InitAutoinstallerAction';
import { InitDeployAction } from './actions/InitDeployAction';
import { InstallAction } from './actions/InstallAction';
import { InstallAutoinstallerAction } from './actions/InstallAutoinstallerAction';
import { LinkAction } from './actions/LinkAction';
import { LinkPackageAction } from './actions/LinkPackageAction';
import { ListAction } from './actions/ListAction';
import { PublishAction } from './actions/PublishAction';
import { PurgeAction } from './actions/PurgeAction';
import { RemoveAction } from './actions/RemoveAction';
import { ScanAction } from './actions/ScanAction';
import { UnlinkAction } from './actions/UnlinkAction';
import { UpdateAction } from './actions/UpdateAction';
import { UpdateAutoinstallerAction } from './actions/UpdateAutoinstallerAction';
import { UpdateCloudCredentialsAction } from './actions/UpdateCloudCredentialsAction';
import { UpgradeInteractiveAction } from './actions/UpgradeInteractiveAction';
import { VersionAction } from './actions/VersionAction';
import { GlobalScriptAction } from './scriptActions/GlobalScriptAction';
import { PhasedScriptAction } from './scriptActions/PhasedScriptAction';
import type { IBaseScriptActionOptions } from './scriptActions/BaseScriptAction';
import { Telemetry } from '../logic/Telemetry';
import { RushGlobalFolder } from '../api/RushGlobalFolder';
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';
import { SetupAction } from './actions/SetupAction';
import { type ICustomCommandLineConfigurationInfo, PluginManager } from '../pluginFramework/PluginManager';
import { type IRushSessionReporterOptions, RushSession } from '../pluginFramework/RushSession';
import type { IBuiltInPluginConfiguration } from '../pluginFramework/PluginLoader/BuiltInPluginLoader';
import { InitSubspaceAction } from './actions/InitSubspaceAction';
import { RushAlerts } from '../utilities/RushAlerts';
import { initializeDotEnv } from '../logic/dotenv';
import { measureAsyncFn } from '../utilities/performance';
import { EnvironmentVariableNames } from '../api/EnvironmentConfiguration';
import {
  _correlateRushSessionError,
  _flushRushSessionReporterAsync,
  _getRushSessionDerivedExitStatus,
  _getRushSessionLifecycleEmitter,
  _getRushSessionReporterSourceVersion,
  _isRushSessionOperationStreamEnabled,
  _isRushSessionErrorRepresented
} from '../pluginFramework/RushSession';

/**
 * Options for `RushCommandLineParser`.
 */
export interface IRushCommandLineParserOptions {
  cwd: string; // Defaults to `cwd`
  alreadyReportedNodeTooNewError: boolean;
  builtInPluginConfigurations: IBuiltInPluginConfiguration[];
  reporter?: IRushSessionReporterOptions;
  reporterCloseAsync?: () => Promise<void>;
}

class ReporterTerminalProvider implements ITerminalProvider {
  public verboseEnabled: boolean = true;
  public debugEnabled: boolean = true;
  public readonly supportsColor: boolean = false;
  public readonly eolCharacter: string = '\n';

  private readonly _bufferedMessages: Array<{
    severity: ReporterMessageSeverity;
    text: string;
  }> = [];
  private _reporter: IScopedReporter | undefined;

  public setReporter(reporter: IScopedReporter | undefined): void {
    this._reporter = reporter;
    if (reporter) {
      for (const message of this._bufferedMessages.splice(0)) {
        reporter.emitMessage({ ...message, privacy: 'local-sensitive' });
      }
    }
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    if (
      (severity === TerminalProviderSeverity.verbose && !this.verboseEnabled) ||
      (severity === TerminalProviderSeverity.debug && !this.debugEnabled)
    ) {
      return;
    }

    const message: { severity: ReporterMessageSeverity; text: string } = {
      severity: this._toReporterSeverity(severity),
      text: data
    };
    if (this._reporter) {
      this._reporter.emitMessage({ ...message, privacy: 'local-sensitive' });
    } else {
      this._bufferedMessages.push(message);
    }
  }

  private _toReporterSeverity(severity: TerminalProviderSeverity): ReporterMessageSeverity {
    switch (severity) {
      case TerminalProviderSeverity.error:
        return 'error';
      case TerminalProviderSeverity.warning:
        return 'warning';
      case TerminalProviderSeverity.debug:
        return 'debug';
      case TerminalProviderSeverity.verbose:
        return 'debug';
      default:
        return 'info';
    }
  }
}

export class RushCommandLineParser extends CommandLineParser {
  public telemetry: Telemetry | undefined;
  public rushGlobalFolder: RushGlobalFolder;
  public readonly rushConfiguration!: RushConfiguration;
  public readonly rushSession: RushSession;
  public readonly pluginManager: PluginManager;

  private readonly _debugParameter: CommandLineFlagParameter;
  private readonly _quietParameter: CommandLineFlagParameter;
  private readonly _restrictConsoleOutput: boolean = RushCommandLineParser.shouldRestrictConsoleOutput();
  private readonly _rushOptions: IRushCommandLineParserOptions;
  private readonly _terminalProvider: ConsoleTerminalProvider | ReporterTerminalProvider;
  private readonly _terminal: Terminal;
  private readonly _autocreateBuildCommand: boolean;
  private _initializationFailed: boolean = false;
  private _sessionLifecycleEmitter: LifecycleEmitter | undefined;
  private _commandLifecycleEmitter: LifecycleEmitter | undefined;
  private _sessionStartTimeMs: number | undefined;
  private _commandStartTimeMs: number | undefined;
  private _reporterCompletionEmitted: boolean = false;
  private _reporterClosePromise: Promise<void> | undefined;

  /**
   * The current working directory that was used to find the Rush configuration.
   */
  public get cwd(): string {
    return this._rushOptions.cwd;
  }

  public constructor(options?: Partial<IRushCommandLineParserOptions>) {
    super({
      toolFilename: 'rush',
      toolDescription:
        'Rush makes life easier for JavaScript developers who develop, build, and publish' +
        ' many packages from a central Git repo.  It is designed to handle very large repositories' +
        ' supporting many projects and people.  Rush provides policies, protections, and customizations' +
        ' that help coordinate teams and safely onboard new contributors.  Rush also generates change logs' +
        ' and automates package publishing.  It can manage decoupled subsets of projects with different' +
        ' release and versioning strategies.  A full API is included to facilitate integration with other' +
        ' automation tools.  If you are looking for a proven turnkey solution for monorepo management,' +
        ' Rush is for you.',
      enableTabCompletionAction: true
    });

    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this._quietParameter = this.defineFlagParameter({
      parameterLongName: '--quiet',
      parameterShortName: '-q',
      description: 'Hide rush startup information'
    });

    this._rushOptions = this._normalizeOptions(options || {});
    const { cwd, alreadyReportedNodeTooNewError, builtInPluginConfigurations, reporter } = this._rushOptions;
    const reporterTerminalProvider: ReporterTerminalProvider | undefined = reporter?.operationStreamEnabled
      ? new ReporterTerminalProvider()
      : undefined;
    const terminalProvider: ConsoleTerminalProvider | ReporterTerminalProvider =
      reporterTerminalProvider ?? new ConsoleTerminalProvider();
    this._terminalProvider = terminalProvider;
    const terminal: Terminal = new Terminal(terminalProvider);
    this._terminal = terminal;

    let rushJsonFilePath: string | undefined;
    try {
      rushJsonFilePath = RushConfiguration.tryFindRushJsonLocation({
        startingFolder: cwd,
        showVerbose: !this._restrictConsoleOutput && !reporter?.operationStreamEnabled
      });

      initializeDotEnv(terminal, rushJsonFilePath);

      if (rushJsonFilePath) {
        this.rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFilePath);
      }
    } catch (error) {
      this._reportInitializationErrorAndSetExitCode(error as Error);
    }

    NodeJsCompatibility.warnAboutCompatibilityIssues({
      isRushLib: true,
      alreadyReportedNodeTooNewError,
      rushConfiguration: this.rushConfiguration
    });

    this.rushGlobalFolder = new RushGlobalFolder();

    this.rushSession = new RushSession({
      getIsDebugMode: () => this.isDebug,
      terminalProvider,
      reporter
    });
    reporterTerminalProvider?.setReporter(this.rushSession.getReporter());
    this.pluginManager = new PluginManager({
      rushSession: this.rushSession,
      rushConfiguration: this.rushConfiguration,
      terminal,
      builtInPluginConfigurations,
      restrictConsoleOutput: this._restrictConsoleOutput,
      rushGlobalFolder: this.rushGlobalFolder
    });
    if (this._initializationFailed) {
      this._autocreateBuildCommand = true;
      return;
    }

    const pluginCommandLineConfigurations: ICustomCommandLineConfigurationInfo[] =
      this.pluginManager.tryGetCustomCommandLineConfigurationInfos();

    const hasBuildCommandInPlugin: boolean = pluginCommandLineConfigurations.some((x) =>
      x.commandLineConfiguration.commands.has(RushConstants.buildCommandName)
    );

    // If the plugin has a build command, we don't need to autocreate the default build command.
    this._autocreateBuildCommand = !hasBuildCommandInPlugin;

    this._populateActions();
    if (this._initializationFailed) {
      return;
    }

    for (const { commandLineConfiguration, pluginLoader } of pluginCommandLineConfigurations) {
      try {
        this._addCommandLineConfigActions(commandLineConfiguration);
      } catch (e) {
        this._reportInitializationErrorAndSetExitCode(
          new Error(
            `Error from plugin ${pluginLoader.pluginName} by ${pluginLoader.packageName}: ${(
              e as Error
            ).toString()}`
          )
        );
        return;
      }
    }
  }

  public get isDebug(): boolean {
    return this._debugParameter.value;
  }

  public get isQuiet(): boolean {
    return this._quietParameter.value;
  }

  public get terminal(): ITerminal {
    return this._terminal;
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
      if (arg === '--') {
        break;
      }
      if (arg === '-q' || arg === '--quiet' || arg === '--json') {
        return true;
      }
    }

    const quietModeValue: string | undefined = process.env[EnvironmentVariableNames.RUSH_QUIET_MODE];
    if (quietModeValue === '1' || quietModeValue === 'true') {
      return true;
    }

    return false;
  }

  public flushTelemetry(): void {
    this.telemetry?.flush();
  }

  public override async executeAsync(args?: string[]): Promise<boolean> {
    if (this._initializationFailed) {
      await this._closeReporterAsync();
      return false;
    }

    // debugParameter will be correctly parsed during super.executeAsync(), so manually parse here.
    if (this._terminalProvider instanceof ConsoleTerminalProvider) {
      const passThroughSeparatorIndex: number = process.argv.indexOf('--', 2);
      const rushArgv: string[] =
        passThroughSeparatorIndex < 0
          ? process.argv.slice(2)
          : process.argv.slice(2, passThroughSeparatorIndex);
      this._terminalProvider.verboseEnabled = this._terminalProvider.debugEnabled =
        rushArgv.includes('--debug') || rushArgv.includes('-d');
    }

    this._sessionLifecycleEmitter = _getRushSessionLifecycleEmitter(this.rushSession);
    if (this._sessionLifecycleEmitter) {
      this._sessionStartTimeMs = performance.now();
      this._sessionLifecycleEmitter.emitSessionStarted({
        rushVersion: _getRushSessionReporterSourceVersion(this.rushSession)!
      });
    }

    try {
      await measureAsyncFn('rush:initializeUnassociatedPlugins', () =>
        this.pluginManager.tryInitializeUnassociatedPluginsAsync()
      );

      const succeeded: boolean = await super.executeAsync(args);
      if (!this._reporterCompletionEmitted) {
        this._emitReporterCompletion(succeeded ? 0 : _getNumericProcessExitCode(1));
      }
      return succeeded;
    } catch (error) {
      if (!process.exitCode) {
        process.exitCode = 1;
      }
      this._reportErrorAndSetExitCode(error as Error);
      return false;
    } finally {
      await this._closeReporterAsync();
    }
  }

  protected override async onExecuteAsync(): Promise<void> {
    // Defensively set the exit code to 1 so if Rush crashes for whatever reason, we'll have a nonzero exit code.
    // For example, Node.js currently has the inexcusable design of terminating with zero exit code when
    // there is an uncaught promise exception.  This will supposedly be fixed in Node.js 9.
    // Ideally we should do this for all the Rush actions, but "rush build" is the most critical one
    // -- if it falsely appears to succeed, we could merge bad PRs, publish empty packages, etc.
    process.exitCode = 1;

    if (this._debugParameter.value) {
      InternalError.breakInDebugger = true;
    }

    const commandName: string | undefined = this.selectedAction?.actionName;
    if (commandName) {
      this._commandLifecycleEmitter = _getRushSessionLifecycleEmitter(this.rushSession, {
        commandName
      });
      if (this._commandLifecycleEmitter) {
        this._commandStartTimeMs = performance.now();
        this._commandLifecycleEmitter.emitCommandStarted({ commandName });
      }
    }

    try {
      await this._wrapOnExecuteAsync();

      // TODO: rushConfiguration is typed as "!: RushConfiguration" here, but can sometimes be undefined
      if (this.rushConfiguration) {
        try {
          const { configuration: experiments } = this.rushConfiguration.experimentsConfiguration;

          if (experiments.rushAlerts) {
            // TODO: Fix this
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const actionName: string = (this as any)
              ._getArgumentParser()
              .parseArgs(process.argv.slice(2)).action;

            // only display alerts when certain specific actions are triggered
            if (RushAlerts.alertTriggerActions.includes(actionName)) {
              this._terminal.writeDebugLine('Checking Rush alerts...');
              const rushAlerts: RushAlerts = await RushAlerts.loadFromConfigurationAsync(
                this.rushConfiguration,
                this._terminal
              );
              // Print out alerts if have after each successful command actions
              await rushAlerts.printAlertsAsync();
            }
          }
        } catch (error) {
          if (error instanceof AlreadyReportedError) {
            throw error;
          }
          // Generally the RushAlerts implementation should handle its own error reporting; if not,
          // clarify the source, since the Rush Alerts behavior is nondeterministic and may not repro easily:
          this._terminal.writeErrorLine(`\nAn unexpected error was encountered by the Rush alerts feature:`);
          this._terminal.writeErrorLine(error.message);
          throw new AlreadyReportedError();
        }
      }

      // If we make it here, everything went fine, so reset the exit code back to 0
      process.exitCode = 0;
      this._emitReporterCompletion(0);
    } catch (error) {
      this._reportErrorAndSetExitCode(error as Error);
    }

    // This only gets hit if the wrapped execution completes successfully
    await this.telemetry?.ensureFlushedAsync();
  }

  private _normalizeOptions(options: Partial<IRushCommandLineParserOptions>): IRushCommandLineParserOptions {
    return {
      cwd: options.cwd || process.cwd(),
      alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError || false,
      builtInPluginConfigurations: options.builtInPluginConfigurations || [],
      reporter: options.reporter,
      reporterCloseAsync: options.reporterCloseAsync
    };
  }

  private async _wrapOnExecuteAsync(): Promise<void> {
    if (this.rushConfiguration) {
      this.telemetry = new Telemetry(this.rushConfiguration, this.rushSession);
    }

    try {
      await measureAsyncFn('rush:commandLineParser:onExecuteAsync', () => super.onExecuteAsync());
    } finally {
      if (this.telemetry) {
        this.flushTelemetry();
      }
    }
  }

  private _populateActions(): void {
    try {
      // Alphabetical order
      this.addAction(new AddAction(this));
      this.addAction(new ChangeAction(this));
      this.addAction(new CheckAction(this));
      this.addAction(new DeployAction(this));
      this.addAction(new InitAction(this));
      this.addAction(new InitAutoinstallerAction(this));
      this.addAction(new InitDeployAction(this));
      this.addAction(new InitSubspaceAction(this));
      this.addAction(new InstallAction(this));
      this.addAction(new LinkAction(this));
      this.addAction(new ListAction(this));
      this.addAction(new PublishAction(this));
      this.addAction(new PurgeAction(this));
      this.addAction(new RemoveAction(this));
      this.addAction(new ScanAction(this));
      this.addAction(new SetupAction(this));
      this.addAction(new UnlinkAction(this));
      this.addAction(new UpdateAction(this));
      this.addAction(new InstallAutoinstallerAction(this));
      this.addAction(new UpdateAutoinstallerAction(this));
      this.addAction(new UpdateCloudCredentialsAction(this));
      this.addAction(new UpgradeInteractiveAction(this));
      this.addAction(new VersionAction(this));
      this.addAction(new AlertAction(this));
      this.addAction(new BridgePackageAction(this));
      this.addAction(new LinkPackageAction(this));

      this._populateScriptActions();
    } catch (error) {
      this._reportInitializationErrorAndSetExitCode(error as Error);
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

    // If a build action is already added by a plugin, we don't want to add a default "build" script
    const doNotIncludeDefaultBuildCommands: boolean = !this._autocreateBuildCommand;

    const commandLineConfiguration: CommandLineConfiguration = CommandLineConfiguration.loadFromFileOrDefault(
      commandLineConfigFilePath,
      doNotIncludeDefaultBuildCommands
    );
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
      throw new Error(
        `${RushConstants.commandLineFilename} defines a command "${command.name}"` +
          ` using a name that already exists`
      );
    }

    switch (command.commandKind) {
      case RushConstants.globalCommandKind: {
        this._addGlobalScriptAction(commandLineConfiguration, command);
        break;
      }

      case RushConstants.phasedCommandKind: {
        this._addPhasedCommandLineConfigAction(commandLineConfiguration, command);
        break;
      }

      default:
        throw new Error(
          `${RushConstants.commandLineFilename} defines a command "${(command as Command).name}"` +
            ` using an unsupported command kind "${(command as Command).commandKind}"`
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
    const { name, shellCommand, autoinstallerName, providedByPlugin } = command;

    if (name === RushConstants.buildCommandName || name === RushConstants.rebuildCommandName) {
      throw new Error(
        `${RushConstants.commandLineFilename} defines a command "${name}" using ` +
          `the command kind "${RushConstants.globalCommandKind}". This command can only be designated as a command ` +
          `kind "${RushConstants.bulkCommandKind}" or "${RushConstants.phasedCommandKind}".`
      );
    }

    const sharedCommandOptions: IBaseScriptActionOptions<IGlobalCommandConfig> =
      this._getSharedCommandActionOptions(commandLineConfiguration, command);

    this.addAction(
      new GlobalScriptAction({
        ...sharedCommandOptions,

        shellCommand,
        autoinstallerName,
        providedByPlugin
      })
    );
  }

  private _addPhasedCommandLineConfigAction(
    commandLineConfiguration: CommandLineConfiguration,
    command: IPhasedCommandConfig
  ): void {
    const baseCommandOptions: IBaseScriptActionOptions<IPhasedCommandConfig> =
      this._getSharedCommandActionOptions(commandLineConfiguration, command);

    const {
      enableParallelism,
      incremental = false,
      disableBuildCache = false,
      allowOversubscription = true,
      phases: initialPhases,
      originalPhases,
      watchPhases,
      watchDebounceMs = RushConstants.defaultWatchDebounceMs,
      alwaysWatch,
      alwaysInstall,
      includeAllProjectsInWatchGraph = false
    } = command;
    this.addAction(
      new PhasedScriptAction({
        ...baseCommandOptions,

        enableParallelism,
        incremental,
        disableBuildCache,

        // The Async.forEachAsync() API defaults allowOversubscription=false, whereas Rush historically
        // defaults allowOversubscription=true to favor faster builds rather than strictly staying below
        // the CPU limit.
        allowOversubscription,

        initialPhases,
        originalPhases,
        watchPhases,
        watchDebounceMs,
        includeAllProjectsInWatchGraph,
        phases: commandLineConfiguration.phases,

        alwaysWatch,
        alwaysInstall
      })
    );
  }

  private _reportErrorAndSetExitCode(error: Error): void {
    const rushSession: RushSession | undefined = this.rushSession;
    if (rushSession && !_isRushSessionErrorRepresented(rushSession, error)) {
      const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_COMMAND_FAILED', {
        parameters: {
          commandName: {
            value: this.selectedAction?.actionName ?? 'unknown',
            privacy: 'public'
          }
        }
      });
      this._commandLifecycleEmitter?.emitDiagnostic(diagnostic);
      _correlateRushSessionError(rushSession, error, diagnostic.diagnosticId);
    }

    if (!(error instanceof AlreadyReportedError)) {
      const prefix: string = 'ERROR: ';

      // The colors package will eat multi-newlines, which could break formatting
      // in user-specified messages and instructions, so we prefer to color each
      // line individually.
      const message: string = Text.splitByNewLines(PrintUtilities.wrapWords(prefix + error.message))
        .map((line) => Colorize.red(line))
        .join('\n');
      if (
        (rushSession && _isRushSessionOperationStreamEnabled(rushSession)) ||
        this._rushOptions.reporter?.operationStreamEnabled
      ) {
        this._terminal.writeErrorLine(message);
      } else {
        // eslint-disable-next-line no-console
        console.error(`\n${message}`);
      }
    }

    if (this._debugParameter.value) {
      // If catchSyncErrors() called this, then show a call stack similar to what Node.js
      // would show for an uncaught error
      if (
        (rushSession && _isRushSessionOperationStreamEnabled(rushSession)) ||
        this._rushOptions.reporter?.operationStreamEnabled
      ) {
        this._terminal.writeErrorLine(error.stack ?? error.message);
      } else {
        // eslint-disable-next-line no-console
        console.error(`\n${error.stack}`);
      }
    }

    const configuredExitCode: string | number | undefined = process.exitCode;
    const numericExitCode: number = Number(configuredExitCode);
    const exitCode: number =
      configuredExitCode !== undefined && Number.isInteger(numericExitCode) && numericExitCode !== 0
        ? numericExitCode
        : 1;
    process.exitCode = exitCode;
    this._emitReporterCompletion(exitCode);
    this.flushTelemetry();

    const handleExit = (): never => {
      // Ideally we want to eliminate all calls to process.exit() from our code, and replace them
      // with normal control flow that properly cleans up its data structures.
      // For this particular call, we have a problem that the RushCommandLineParser constructor
      // performs nontrivial work that can throw an exception.  Either the Rush class would need
      // to handle reporting for those exceptions, or else _populateActions() should be moved
      // to a RushCommandLineParser lifecycle stage that can handle it.
      process.exit(exitCode);
    };

    const telemetryFlushAsync: Promise<void> | undefined =
      this.telemetry && this.rushSession.hooks.flushTelemetry.isUsed()
        ? this.telemetry.ensureFlushedAsync()
        : undefined;

    const pendingFlushes: Promise<unknown>[] = [
      this._rushOptions.reporterCloseAsync
        ? this._closeReporterAsync()
        : _flushRushSessionReporterAsync(rushSession)
    ];
    if (telemetryFlushAsync) {
      pendingFlushes.push(telemetryFlushAsync);
    }
    void Promise.allSettled(pendingFlushes).then(handleExit);
  }

  private _reportInitializationErrorAndSetExitCode(error: Error): void {
    this._initializationFailed = true;
    this._reportErrorAndSetExitCode(error);
  }

  private _closeReporterAsync(): Promise<void> {
    if (!this._reporterClosePromise) {
      this._reporterClosePromise = (async (): Promise<void> => {
        try {
          await this._rushOptions.reporterCloseAsync?.();
        } catch (error) {
          process.exitCode = 1;
          process.stderr.write(`[reporter] Unable to finalize reporters: ${(error as Error).message}\n`);
        }
      })();
    }
    return this._reporterClosePromise;
  }

  private _emitReporterCompletion(exitCode: number): void {
    if (this._reporterCompletionEmitted) {
      return;
    }
    this._reporterCompletionEmitted = true;

    const commandName: string | undefined = this.selectedAction?.actionName;
    if (commandName && this._commandLifecycleEmitter) {
      const durationMs: number | undefined =
        this._commandStartTimeMs === undefined ? undefined : performance.now() - this._commandStartTimeMs;
      this._commandLifecycleEmitter.emitCommandResult({
        commandName,
        succeeded: exitCode === 0,
        exitCode
      });
      this._commandLifecycleEmitter.emitCommandCompleted({
        commandName,
        exitCode,
        ...(durationMs === undefined ? {} : { durationMs })
      });
    }

    if (this._sessionLifecycleEmitter) {
      const durationMs: number | undefined =
        this._sessionStartTimeMs === undefined ? undefined : performance.now() - this._sessionStartTimeMs;
      this._sessionLifecycleEmitter.emitSessionCompleted({
        exitCode,
        ...(durationMs === undefined ? {} : { durationMs })
      });
    }

    // Shadow derivation is deliberately observational. process.exitCode remains authoritative.
    const rushSession: RushSession | undefined = this.rushSession;
    if (rushSession) {
      _getRushSessionDerivedExitStatus(rushSession);
    }
  }
}

function _getNumericProcessExitCode(fallback: number): number {
  const { exitCode } = process;
  if (typeof exitCode === 'number') {
    return exitCode;
  }
  if (typeof exitCode === 'string') {
    const parsed: number = Number(exitCode);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
