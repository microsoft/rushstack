// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';
import * as wordwrap from 'wordwrap';
import { CommandLineParser, CommandLineFlagParameter } from '@microsoft/ts-command-line';
import {
  RushConfiguration,
  Utilities
} from '@microsoft/rush-lib';

import BuildAction from './BuildAction';
import ChangeAction from './ChangeAction';
import CheckAction from './CheckAction';
import GenerateAction from './GenerateAction';
import InstallAction from './InstallAction';
import LinkAction from './LinkAction';
import PublishAction from './PublishAction';
import RebuildAction from './RebuildAction';
import UnlinkAction from './UnlinkAction';
import ScanAction from './ScanAction';

export default class RushCommandLineParser extends CommandLineParser {
  public rushConfiguration: RushConfiguration;
  private _debugParameter: CommandLineFlagParameter;

  constructor() {
    super({
      toolFilename: 'rush',
      toolDescription: 'Rush helps you to manage a collection of NPM'
      + ' projects.  Rush collects the dependencies for all projects to perform a minimal install,'
      + ' detects which projects can be locally linked, and performs a fast parallel'
      + ' build according to the detected dependency graph.  If you want to decompose'
      + ' your monolithic project into many small packages but are afraid of the dreaded'
      + ' NPM progress bar, Rush is for you.'
    });

    this.rushConfiguration = RushConfiguration.loadFromDefaultLocation();
    this.addAction(new BuildAction(this));
    this.addAction(new ChangeAction(this));
    this.addAction(new CheckAction(this));
    this.addAction(new GenerateAction(this));
    this.addAction(new InstallAction(this));
    this.addAction(new LinkAction(this));
    this.addAction(new PublishAction(this));
    this.addAction(new RebuildAction(this));
    this.addAction(new ScanAction(this));
    this.addAction(new UnlinkAction(this));
  }

  public catchSyncErrors(promise: Promise<void>): void {
    promise.catch((error: Error) => {
      this._exitAndReportError(error);
    });
  }

  protected onDefineParameters(): void {
    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });
  }

  protected onExecute(): void {
    if (this._debugParameter.value) {
      // For debugging, don't catch any exceptions; show the full call stack
      super.onExecute();
    } else {
      try {
        super.onExecute();
      } catch (error) {
        this._exitAndReportError(error);
      }
    }
    if (this.rushConfiguration.rushHooks) {
      this.rushConfiguration.rushHooks.onPostCommand();
    }
  }

  private _exitAndReportError(error: Error): void {
    if (this._debugParameter.value) {
      // If catchSyncErrors() called this, then show a call stack similar to what NodeJS
      // would show for an uncaught error
      console.error(os.EOL + error.stack);
    } else {
      const prefix: string = 'ERROR: ';
      const wrap: (textToWrap: string) => string = wordwrap.soft(prefix.length, Utilities.getConsoleWidth());
      console.error(os.EOL + colors.red(prefix + wrap(error.message).trim()));
    }
    process.exit(1);
  }
}
