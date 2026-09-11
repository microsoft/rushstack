// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
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
  _isRushSessionErrorRepresented,
  _setRushSessionExitStatusOptions
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
  /** Parse native commands without executing CLI actions or initializing process-global state. */
  engine?: {
    rushConfiguration: RushConfiguration;
    terminalProvider: ITerminalProvider;
  };
}

class ReporterTerminalProvider implements ITerminalProvider {
  public verboseEnabled: boolean = true;
  public debugEnabled: boolean = true;
  public readonly supportsColor: boolean = false;
  public readonly eolCharacter: string = '\n';

  readonly #bufferedMessages: Array<{
    severity: ReporterMessageSeverity;
    text: string;
    minimumLogLevel?: 'verbose' | 'debug';
  }> = [];
  #reporter: IScopedReporter | undefined;

  public setReporter(reporter: IScopedReporter | undefined): void {
    this.#reporter = reporter;
    if (reporter) {
      for (const message of this.#bufferedMessages.splice(0)) {
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

    const message: {
      severity: ReporterMessageSeverity;
      text: string;
      minimumLogLevel?: 'verbose' | 'debug';
    } = {
      severity: this.#toReporterSeverity(severity),
      text: data,
      ...this.#getMinimumLogLevel(severity)
    };
    if (this.#reporter) {
      this.#reporter.emitMessage({ ...message, privacy: 'local-sensitive' });
    } else {
      this.#bufferedMessages.push(message);
    }
  }

  #toReporterSeverity(severity: TerminalProviderSeverity): ReporterMessageSeverity {
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

  #getMinimumLogLevel(severity: TerminalProviderSeverity): { minimumLogLevel?: 'verbose' | 'debug' } {
    switch (severity) {
      case TerminalProviderSeverity.verbose:
        return { minimumLogLevel: 'verbose' };
      case TerminalProviderSeverity.debug:
        return { minimumLogLevel: 'debug' };
      default:
        return {};
    }
  }
}

export class RushCommandLineParser extends CommandLineParser {
  public telemetry: Telemetry | undefined;
  public rushGlobalFolder: RushGlobalFolder;
  public readonly rushConfiguration!: RushConfiguration;
  public readonly rushSession: RushSession;
  public readonly pluginManager: PluginManager;

  readonly #debugParameter: CommandLineFlagParameter;
  readonly #quietParameter: CommandLineFlagParameter;
  readonly #restrictConsoleOutput: boolean = RushCommandLineParser.shouldRestrictConsoleOutput();
  readonly #rushOptions: IRushCommandLineParserOptions;
  readonly #terminalProvider: ITerminalProvider;
  readonly #terminal: Terminal;
  readonly #autocreateBuildCommand: boolean;
  #initializationFailed: boolean = false;
  #sessionLifecycleEmitter: LifecycleEmitter | undefined;
  #commandLifecycleEmitter: LifecycleEmitter | undefined;
  #sessionStartTimeMs: number | undefined;
  #commandStartTimeMs: number | undefined;
  #reporterCompletionEmitted: boolean = false;
  #reporterClosePromise: Promise<void> | undefined;

  /**
   * The current working directory that was used to find the Rush configuration.
   */
  public get cwd(): string {
    return this.#rushOptions.cwd;
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

    this.#debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });

    this.#quietParameter = this.defineFlagParameter({
      parameterLongName: '--quiet',
      parameterShortName: '-q',
      description: 'Hide rush startup information'
    });

    this.#rushOptions = this.#normalizeOptions(options || {});
    const { cwd, alreadyReportedNodeTooNewError, builtInPluginConfigurations, reporter } = this.#rushOptions;
    const reporterTerminalProvider: ReporterTerminalProvider | undefined = reporter?.operationStreamEnabled
      ? new ReporterTerminalProvider()
      : undefined;
    const terminalProvider: ITerminalProvider =
      this.#rushOptions.engine?.terminalProvider ?? reporterTerminalProvider ?? new ConsoleTerminalProvider();
    this.#terminalProvider = terminalProvider;
    const terminal: Terminal = new Terminal(terminalProvider);
    this.#terminal = terminal;

    this.rushSession = new RushSession({
      getIsDebugMode: () => this.isDebug,
      terminalProvider,
      reporter
    });
    this.#sessionLifecycleEmitter = _getRushSessionLifecycleEmitter(this.rushSession);
    reporterTerminalProvider?.setReporter(this.rushSession.getReporter());

    let rushJsonFilePath: string | undefined;
    try {
      if (this.#rushOptions.engine) {
        this.rushConfiguration = this.#rushOptions.engine.rushConfiguration;
      } else {
        rushJsonFilePath = RushConfiguration.tryFindRushJsonLocation({
          startingFolder: cwd,
          showVerbose: !this.#restrictConsoleOutput && !reporter?.operationStreamEnabled
        });

        initializeDotEnv(terminal, rushJsonFilePath);

        if (rushJsonFilePath) {
          this.rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFilePath);
        }
      }
    } catch (error) {
      this.#reportInitializationErrorAndSetExitCode(error as Error);
    }

    if (!this.#rushOptions.engine) {
      NodeJsCompatibility.warnAboutCompatibilityIssues({
        isRushLib: true,
        alreadyReportedNodeTooNewError,
        rushConfiguration: this.rushConfiguration
      });
    }

    this.rushGlobalFolder = new RushGlobalFolder();

    this.pluginManager = new PluginManager({
      rushSession: this.rushSession,
      rushConfiguration: this.rushConfiguration,
      terminal,
      builtInPluginConfigurations,
      restrictConsoleOutput: this.#restrictConsoleOutput,
      rushGlobalFolder: this.rushGlobalFolder
    });
    if (this.#initializationFailed) {
      this.#autocreateBuildCommand = true;
      return;
    }

    const pluginCommandLineConfigurations: ICustomCommandLineConfigurationInfo[] =
      this.pluginManager.tryGetCustomCommandLineConfigurationInfos();

    const hasBuildCommandInPlugin: boolean = pluginCommandLineConfigurations.some((x) =>
      x.commandLineConfiguration.commands.has(RushConstants.buildCommandName)
    );

    // If the plugin has a build command, we don't need to autocreate the default build command.
    this.#autocreateBuildCommand = !hasBuildCommandInPlugin;

    this.#populateActions();
    if (this.#initializationFailed) {
      return;
    }

    for (const { commandLineConfiguration, pluginLoader } of pluginCommandLineConfigurations) {
      try {
        this.#addCommandLineConfigActions(commandLineConfiguration);
      } catch (e) {
        this.#reportInitializationErrorAndSetExitCode(
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
    return this.#debugParameter.value;
  }

  public get isQuiet(): boolean {
    return this.#quietParameter.value;
  }

  public get terminal(): ITerminal {
    return this.#terminal;
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
    if (this.#initializationFailed) {
      await this.#closeReporterAsync();
      return false;
    }

    // debugParameter will be correctly parsed during super.executeAsync(), so manually parse here.
    if (this.#terminalProvider instanceof ConsoleTerminalProvider) {
      const passThroughSeparatorIndex: number = process.argv.indexOf('--', 2);
      const rushArgv: string[] =
        passThroughSeparatorIndex < 0
          ? process.argv.slice(2)
          : process.argv.slice(2, passThroughSeparatorIndex);
      this.#terminalProvider.verboseEnabled = this.#terminalProvider.debugEnabled =
        rushArgv.includes('--debug') || rushArgv.includes('-d');
    }

    this.#startReporterSession();

    try {
      await measureAsyncFn('rush:initializeUnassociatedPlugins', () =>
        this.pluginManager.tryInitializeUnassociatedPluginsAsync()
      );

      const succeeded: boolean = await super.executeAsync(args);
      if (!this.#reporterCompletionEmitted) {
        this.#emitReporterCompletion(succeeded ? 0 : _getNumericProcessExitCode(1));
      }
      return succeeded;
    } catch (error) {
      if (!process.exitCode) {
        process.exitCode = 1;
      }
      this.#reportErrorAndSetExitCode(error as Error);
      return false;
    } finally {
      await this.#closeReporterAsync();
    }
  }

  public override async executeWithoutErrorHandlingAsync(args?: string[]): Promise<void> {
    try {
      await super.executeWithoutErrorHandlingAsync(args);
    } catch (error) {
      // Capture the original parse error before the base executeAsync renders it and returns false.
      this.#emitReporterFailureDiagnostic(error as Error, !this.#commandLifecycleEmitter);
      throw error;
    }
  }

  protected override async onExecuteAsync(): Promise<void> {
    if (this.#rushOptions.engine) {
      return;
    }
    // Defensively set the exit code to 1 so if Rush crashes for whatever reason, we'll have a nonzero exit code.
    // For example, Node.js currently has the inexcusable design of terminating with zero exit code when
    // there is an uncaught promise exception.  This will supposedly be fixed in Node.js 9.
    // Ideally we should do this for all the Rush actions, but "rush build" is the most critical one
    // -- if it falsely appears to succeed, we could merge bad PRs, publish empty packages, etc.
    process.exitCode = 1;

    if (this.#debugParameter.value) {
      InternalError.breakInDebugger = true;
    }

    const commandName: string | undefined = this.selectedAction?.actionName;
    if (commandName) {
      this.#commandLifecycleEmitter = _getRushSessionLifecycleEmitter(this.rushSession, {
        commandName
      });
      if (this.#commandLifecycleEmitter) {
        this.#commandStartTimeMs = performance.now();
        this.#commandLifecycleEmitter.emitCommandStarted({ commandName });
      }
    }

    try {
      await this.#wrapOnExecuteAsync();

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
              this.#terminal.writeDebugLine('Checking Rush alerts...');
              const rushAlerts: RushAlerts = await RushAlerts.loadFromConfigurationAsync(
                this.rushConfiguration,
                this.#terminal
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
          this.#terminal.writeErrorLine(`\nAn unexpected error was encountered by the Rush alerts feature:`);
          this.#terminal.writeErrorLine(error.message);
          throw new AlreadyReportedError();
        }
      }

      // If we make it here, everything went fine, so reset the exit code back to 0
      process.exitCode = 0;
    } catch (error) {
      this.#reportErrorAndSetExitCode(error as Error);
    }

    // This only gets hit if the wrapped execution completes successfully
    try {
      await this.telemetry?.ensureFlushedAsync();
    } catch (error) {
      this.#emitReporterFailureDiagnostic(error as Error);
      throw error;
    }
  }

  #normalizeOptions(options: Partial<IRushCommandLineParserOptions>): IRushCommandLineParserOptions {
    return {
      // Git reports physical paths, including when cwd contains a Windows short name or directory alias.
      cwd: fs.realpathSync.native(options.cwd || process.cwd()),
      alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError || false,
      builtInPluginConfigurations: options.builtInPluginConfigurations || [],
      reporter: options.reporter,
      reporterCloseAsync: options.reporterCloseAsync,
      engine: options.engine
    };
  }

  async #wrapOnExecuteAsync(): Promise<void> {
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

  #populateActions(): void {
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

      this.#populateScriptActions();
    } catch (error) {
      this.#reportInitializationErrorAndSetExitCode(error as Error);
    }
  }

  #populateScriptActions(): void {
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
    const doNotIncludeDefaultBuildCommands: boolean = !this.#autocreateBuildCommand;

    const commandLineConfiguration: CommandLineConfiguration = CommandLineConfiguration.loadFromFileOrDefault(
      commandLineConfigFilePath,
      doNotIncludeDefaultBuildCommands
    );
    this.#addCommandLineConfigActions(commandLineConfiguration);
  }

  #addCommandLineConfigActions(commandLineConfiguration: CommandLineConfiguration): void {
    // Register each custom command
    for (const command of commandLineConfiguration.commands.values()) {
      this.#addCommandLineConfigAction(commandLineConfiguration, command);
    }
  }

  #addCommandLineConfigAction(
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
        this.#addGlobalScriptAction(commandLineConfiguration, command);
        break;
      }

      case RushConstants.phasedCommandKind: {
        this.#addPhasedCommandLineConfigAction(commandLineConfiguration, command);
        break;
      }

      default:
        throw new Error(
          `${RushConstants.commandLineFilename} defines a command "${(command as Command).name}"` +
            ` using an unsupported command kind "${(command as Command).commandKind}"`
        );
    }
  }

  #getSharedCommandActionOptions<TCommand extends Command>(
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

  #addGlobalScriptAction(
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
      this.#getSharedCommandActionOptions(commandLineConfiguration, command);

    this.addAction(
      new GlobalScriptAction({
        ...sharedCommandOptions,

        shellCommand,
        autoinstallerName,
        providedByPlugin
      })
    );
  }

  #addPhasedCommandLineConfigAction(
    commandLineConfiguration: CommandLineConfiguration,
    command: IPhasedCommandConfig
  ): void {
    const baseCommandOptions: IBaseScriptActionOptions<IPhasedCommandConfig> =
      this.#getSharedCommandActionOptions(commandLineConfiguration, command);

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

  #startReporterSession(): void {
    if (this.#sessionLifecycleEmitter && this.#sessionStartTimeMs === undefined) {
      this.#sessionStartTimeMs = performance.now();
      this.#sessionLifecycleEmitter.emitSessionStarted({
        rushVersion: _getRushSessionReporterSourceVersion(this.rushSession)!
      });
    }
  }

  #emitReporterFailureDiagnostic(error: Error, includeMessage: boolean = false): void {
    this.#startReporterSession();
    const emitter: LifecycleEmitter | undefined =
      this.#commandLifecycleEmitter ?? this.#sessionLifecycleEmitter;
    const rushSession: RushSession | undefined = this.rushSession;
    if (emitter && rushSession && !_isRushSessionErrorRepresented(rushSession, error)) {
      const diagnostic: IRushDiagnostic = createRushDiagnostic('RUSH_COMMAND_FAILED', {
        parameters: {
          commandName: {
            value: this.selectedAction?.actionName ?? 'unknown',
            privacy: 'public'
          },
          ...(includeMessage
            ? {
                message: {
                  value: error instanceof Error ? error.message : String(error),
                  privacy: 'local-sensitive' as const
                }
              }
            : {})
        }
      });
      emitter.emitDiagnostic(diagnostic);
      _correlateRushSessionError(rushSession, error, diagnostic.diagnosticId);
    }
  }

  #reportErrorAndSetExitCode(error: Error): void {
    this.#emitReporterFailureDiagnostic(error);
    const rushSession: RushSession | undefined = this.rushSession;

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
        this.#rushOptions.reporter?.operationStreamEnabled
      ) {
        this.#terminal.writeErrorLine(message);
      } else {
        // eslint-disable-next-line no-console
        console.error(`\n${message}`);
      }
    }

    if (this.#debugParameter.value) {
      // If catchSyncErrors() called this, then show a call stack similar to what Node.js
      // would show for an uncaught error
      if (
        (rushSession && _isRushSessionOperationStreamEnabled(rushSession)) ||
        this.#rushOptions.reporter?.operationStreamEnabled
      ) {
        this.#terminal.writeErrorLine(error.stack ?? error.message);
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
    this.#emitReporterCompletion(exitCode);
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
      this.#rushOptions.reporterCloseAsync
        ? this.#closeReporterAsync()
        : rushSession
          ? _flushRushSessionReporterAsync(rushSession)
          : Promise.resolve()
    ];
    if (telemetryFlushAsync) {
      pendingFlushes.push(telemetryFlushAsync);
    }
    void Promise.allSettled(pendingFlushes).then(handleExit);
  }

  #reportInitializationErrorAndSetExitCode(error: Error): void {
    if (this.#rushOptions.engine) {
      throw error;
    }
    this.#initializationFailed = true;
    this.#reportErrorAndSetExitCode(error);
  }

  #closeReporterAsync(): Promise<void> {
    if (!this.#reporterClosePromise) {
      this.#reporterClosePromise = (async (): Promise<void> => {
        try {
          await this.#rushOptions.reporterCloseAsync?.();
        } catch (error) {
          process.exitCode = 1;
          process.stderr.write(`[reporter] Unable to finalize reporters: ${(error as Error).message}\n`);
        }
      })();
    }
    return this.#reporterClosePromise;
  }

  #emitReporterCompletion(exitCode: number): void {
    if (!this.#sessionLifecycleEmitter || this.#reporterCompletionEmitted) {
      return;
    }
    this.#reporterCompletionEmitted = true;

    _setRushSessionExitStatusOptions(this.rushSession, {
      cancelled:
        this.selectedAction instanceof PhasedScriptAction &&
        this.selectedAction.sessionAbortController.signal.aborted
    });

    const commandName: string | undefined = this.selectedAction?.actionName;
    if (commandName && this.#commandLifecycleEmitter) {
      const durationMs: number | undefined =
        this.#commandStartTimeMs === undefined ? undefined : performance.now() - this.#commandStartTimeMs;
      this.#commandLifecycleEmitter.emitCommandResult({
        commandName,
        succeeded: exitCode === 0,
        exitCode
      });
      this.#commandLifecycleEmitter.emitCommandCompleted({
        commandName,
        exitCode,
        ...(durationMs === undefined ? {} : { durationMs })
      });
    }

    if (this.#sessionLifecycleEmitter) {
      const durationMs: number | undefined =
        this.#sessionStartTimeMs === undefined ? undefined : performance.now() - this.#sessionStartTimeMs;
      this.#sessionLifecycleEmitter.emitSessionCompleted({
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
