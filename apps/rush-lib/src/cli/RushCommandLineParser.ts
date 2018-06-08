// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';

import { CommandLineParser, CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from '../api/RushConstants';
import { CommandLineConfiguration } from '../api/CommandLineConfiguration';
import { CommandJson } from '../api/CommandLineJson';
import { Utilities } from '../utilities/Utilities';

import { ChangeAction } from './actions/ChangeAction';
import { CheckAction } from './actions/CheckAction';
import { UpdateAction } from './actions/UpdateAction';
import { InstallAction } from './actions/InstallAction';
import { LinkAction } from './actions/LinkAction';
import { PublishAction } from './actions/PublishAction';
import { PurgeAction } from './actions/PurgeAction';
import { UnlinkAction } from './actions/UnlinkAction';
import { ScanAction } from './actions/ScanAction';
import { VersionAction } from './actions/VersionAction';

import { BulkScriptAction } from './scriptActions/BulkScriptAction';

import { Telemetry } from '../logic/Telemetry';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';

export class RushCommandLineParser extends CommandLineParser {
  public telemetry: Telemetry | undefined;
  public rushConfiguration: RushConfiguration;

  private _debugParameter: CommandLineFlagParameter;

  constructor() {
    super({
      toolFilename: 'rush',
      toolDescription: 'Rush makes life easier for JavaScript developers who develop, build, and publish'
        + ' many packages from a central Git repo.  It is designed to handle very large repositories'
        + ' supporting many projects and people.  Rush provides policies, protections, and customizations'
        + ' that help coordinate teams and safely onboard new contributors.  Rush also generates change logs'
        + ' and automates package publishing.  It can manage decoupled subsets of projects with different'
        + ' release and versioning strategies.  A full API is included to facilitate integration with other'
        + ' automation tools.  If you are looking for a proven turnkey solution for monorepo management,'
        + ' Rush is for you.'
    });
    this._populateActions();
  }

  public get isDebug(): boolean {
    return this._debugParameter.value;
  }

  public flushTelemetry(): void {
    if (this.telemetry) {
      this.telemetry.flush();
    }
  }

  protected onDefineParameters(): void {
    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });
  }

  protected onExecute(): Promise<void> {
    return this._wrapOnExecute().catch((error: Error) => {
      this._reportErrorAndSetExitCode(error);
    });
  }

  private _wrapOnExecute(): Promise<void> {
    try {
      if (this.rushConfiguration) {
        this.telemetry = new Telemetry(this.rushConfiguration);
      }
      return super.onExecute().then(() => {
        if (this.telemetry) {
          this.flushTelemetry();
        }
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private _populateActions(): void {
    try {
      const rushJsonFilename: string | undefined = RushConfiguration.tryFindRushJsonLocation();
      if (rushJsonFilename) {
        this.rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFilename);
      }

      this.addAction(new ChangeAction(this));
      this.addAction(new CheckAction(this));
      this.addAction(new InstallAction(this));
      this.addAction(new LinkAction(this));
      this.addAction(new PublishAction(this));
      this.addAction(new PurgeAction(this));
      this.addAction(new ScanAction(this));
      this.addAction(new UpdateAction(this));
      this.addAction(new UnlinkAction(this));
      this.addAction(new VersionAction(this));

      this._populateScriptActions();

    } catch (error) {
      this._reportErrorAndSetExitCode(error);
    }
  }

  private _populateScriptActions(): void {
    if (!this.rushConfiguration) {
      return;
    }

    const commandLineConfigFile: string = path.join(
      this.rushConfiguration.commonRushConfigFolder, RushConstants.commandLineFilename
    );
    const commandLineConfiguration: CommandLineConfiguration
      = CommandLineConfiguration.loadFromFileOrDefault(commandLineConfigFile);

    const documentationForBuild: string = 'The Rush build command assumes that the package.json file for each'
      + ' project contains a "scripts" entry for "npm run build".  It invokes'
      + ' this commands to build each project.  Projects are built in parallel where'
      + ' possible, but always respecting the dependency graph for locally linked projects.'
      + ' The number of simultaneous processes will be based on the number of machine cores'
      + ' unless overridden by the --parallelism flag.';

    // always create a build and a rebuild command
    this.addAction(new BulkScriptAction({
      actionName: 'build',
      summary: '(EXPERIMENTAL) Build all projects that haven\'t been built, or have changed since they were last '
        + 'built.',
      documentation: documentationForBuild,

      parser: this,
      commandLineConfiguration: commandLineConfiguration,

      enableParallelism: true,
      ignoreMissingScript: false
    }));

    this.addAction(new BulkScriptAction({
      actionName: 'rebuild',
      summary: 'Clean and rebuild the entire set of projects',
      documentation: documentationForBuild,

      parser: this,
      commandLineConfiguration: commandLineConfiguration,

      enableParallelism: true,
      ignoreMissingScript: false
    }));

    // Register each custom command
    for (const command of commandLineConfiguration.commands) {
      if (this.tryGetAction(command.name)) {
        throw new Error(`${RushConstants.commandLineFilename} defines a command "${command.name}"`
          + ` using a name that already exists`);
      }

      switch (command.commandKind) {
        case 'bulk':
          this.addAction(new BulkScriptAction({
            actionName: command.name,
            summary: command.summary,
            documentation: command.description || command.summary,

            parser: this,
            commandLineConfiguration: commandLineConfiguration,

            enableParallelism: command.enableParallelism,
            ignoreMissingScript: command.ignoreMissingScript || false
          }));
          break;
        case 'global':
          // todo
          break;
        default:
          throw new Error(`${RushConstants.commandLineFilename} defines a command "${command!.name}"`
            + ` using an unsupported command kind "${command!.commandKind}"`);
      }
    }

    // Check for any invalid associations
    for (const parameter of commandLineConfiguration.parameters) {
      for (const associatedCommand of parameter.associatedCommands) {
        if (!this.tryGetAction(associatedCommand)) {
          throw new Error(`${RushConstants.commandLineFilename} defines a parameter "${parameter.longName}"`
            + ` that is associated with a nonexistent command "${associatedCommand}"`);
        }
      }
    }
  }

  private _reportErrorAndSetExitCode(error: Error): void {
    if (!(error instanceof AlreadyReportedError)) {
      const prefix: string = 'ERROR: ';
      console.error(os.EOL + colors.red(prefix + Utilities.wrapWords(error.message).trim()));
    }

    if (this._debugParameter.value) {
      // If catchSyncErrors() called this, then show a call stack similar to what NodeJS
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
    process.exit(1);
  }
}
