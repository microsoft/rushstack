// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import * as colors from 'colors';
import * as wordwrap from 'wordwrap';
import { CommandLineParser, CommandLineFlagParameter } from '@microsoft/ts-command-line';

import { RushConstants } from '../../RushConstants';
import { CommandLineConfiguration } from '../../data/CommandLineConfiguration';
import { RushConfiguration } from '../../data/RushConfiguration';
import { Utilities } from '../../utilities/Utilities';
import { ChangeAction } from './ChangeAction';
import { CheckAction } from './CheckAction';
import { UpdateAction } from './UpdateAction';
import { InstallAction } from './InstallAction';
import { LinkAction } from './LinkAction';
import { PublishAction } from './PublishAction';
import { PurgeAction } from './PurgeAction';
import { UnlinkAction } from './UnlinkAction';
import { ScanAction } from './ScanAction';
import { VersionAction } from './VersionAction';
import { CustomCommandFactory } from './CustomCommandFactory';
import { CustomRushAction } from './CustomRushAction';

import { Telemetry } from '../logic/Telemetry';
import { AlreadyReportedError } from '../../utilities/AlreadyReportedError';

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
      let  commandLineConfig: CommandLineConfiguration | undefined = undefined;

      const rushJsonFilename: string | undefined = RushConfiguration.tryFindRushJsonLocation();
      if (rushJsonFilename) {
        this.rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFilename);

        const commandLineConfigFile: string = path.join(
          this.rushConfiguration.commonRushConfigFolder, RushConstants.commandLineFilename
        );

        commandLineConfig = CommandLineConfiguration.tryLoadFromFile(commandLineConfigFile);
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

      CustomCommandFactory.createCommands(this, commandLineConfig)
        .forEach((customAction: CustomRushAction) => {
          this.addAction(customAction);
        });

    } catch (error) {
      this._reportErrorAndSetExitCode(error);
    }
  }

  private _reportErrorAndSetExitCode(error: Error): void {
    if (!(error instanceof AlreadyReportedError)) {
      const prefix: string = 'ERROR: ';
      const wrap: (textToWrap: string) => string = wordwrap.soft(prefix.length, Utilities.getConsoleWidth());
      console.error(os.EOL + colors.red(prefix + wrap(error.message).trim()));
    }

    if (this._debugParameter.value) {
      // If catchSyncErrors() called this, then show a call stack similar to what NodeJS
      // would show for an uncaught error
      console.error(os.EOL + error.stack);
    }

    this.flushTelemetry();
    process.exitCode = 1;
  }
}
