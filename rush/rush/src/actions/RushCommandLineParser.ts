/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as os from 'os';
import * as colors from 'colors';

import { CommandLineFlagParameter } from '../commandLine/CommandLineParameter';
import CommandLineParser from '../commandLine/CommandLineParser';
import RushConfig from '../data/RushConfig';
import LinkAction from './LinkAction';
import RebuildAction from './RebuildAction';
import UpdateAction from './UpdateAction';

export default class RushCommandLineParser extends CommandLineParser {
  public rushConfig: RushConfig;
  private _debugParameter: CommandLineFlagParameter;

  constructor() {
    super({
      toolFilename: 'rush',
      toolDescription: 'This tools helps you to manage building/installing of multiple NPM package folders.'
    });

    this.addAction(new UpdateAction(this));
    this.addAction(new LinkAction(this));
    this.addAction(new RebuildAction(this));
  }

  protected onDefineParameters(): void {
    this._debugParameter = this.defineFlagParameter({
      parameterLongName: '--debug',
      parameterShortName: '-d',
      description: 'Show the full call stack if an error occurs while executing the tool'
    });
  }

  protected onExecute(): void {
    this.trapErrors(() => {
      super.onExecute();
    });
  }

  public trapErrors(action: () => void): void {
    if (this._debugParameter.value) {
      action();
    } else {
      try {
        action();
      } catch (error) {
        console.error(os.EOL + colors.red('ERROR: ' + error.message));
        process.exit(1);
      }
    }
  }

}
