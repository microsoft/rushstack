// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as fsx from 'fs-extra';
import { CommandLineAction, CommandLineFlagParameter } from '@microsoft/ts-command-line';
import {
  RushConfiguration,
  Utilities,
  Stopwatch
} from '@microsoft/rush-lib';

import LinkAction from './LinkAction';
import InstallManager from '../utilities/InstallManager';
import RushCommandLineParser from './RushCommandLineParser';
import PackageReviewChecker from '../utilities/PackageReviewChecker';

export default class GenerateAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfiguration: RushConfiguration;
  private _packageReviewChecker: PackageReviewChecker;
  private _lazyParameter: CommandLineFlagParameter;
  private _noLinkParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'generate',
      summary: 'Run this command after changing any project\'s package.json.',
      documentation: 'Run "rush regenerate" after changing any project\'s package.json.'
      + ' It scans the dependencies for all projects referenced in "rush.json", and then'
      + ' constructs a superset package.json in the Rush common folder.'
      + ' After running this command, you will need to commit your changes to git.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._lazyParameter = this.defineFlagParameter({
      parameterLongName: '--lazy',
      parameterShortName: '-l',
      description: 'Do not clean the "node_modules" folder before running "npm install".'
      + ' This is faster, but less correct, so only use it for debugging.'
    });
    this._noLinkParameter = this.defineFlagParameter({
      parameterLongName: '--no-link',
      description: 'Do not automatically run the "rush link" action after "rush generate"'
    });
  }

  protected onExecute(): void {
    this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();

    const stopwatch: Stopwatch = Stopwatch.start();
    const isLazy: boolean = this._lazyParameter.value;

    console.log('Starting "rush generate"' + os.EOL);

    if (this._rushConfiguration.packageReviewFile) {
      this._packageReviewChecker = new PackageReviewChecker(this._rushConfiguration);
      this._packageReviewChecker.saveCurrentDependencies();
    }

    const installManager: InstallManager = new InstallManager(this._rushConfiguration);

    installManager.ensureLocalNpmTool(false);

    installManager.regenerate();

    if (fsx.existsSync(this._rushConfiguration.shrinkwrapFilename)) {
      console.log('Deleting npm-shrinkwrap.json');
      Utilities.dangerouslyDeletePath(this._rushConfiguration.shrinkwrapFilename);
    }

    if (isLazy) {
      console.log(colors.green(
        `${os.EOL}Rush is running in "--lazy" mode. ` +
        `You will need to run a normal "rush generate" before committing.`));

      // Do an incremental install
      installManager.installCommonModules(false);

      console.log(os.EOL + colors.bold('(Skipping "npm shrinkwrap")') + os.EOL);
    } else {
      // Do a clean install
      installManager.installCommonModules(true);

      console.log(os.EOL + colors.bold('Running "npm shrinkwrap"...'));
      Utilities.executeCommand(this._rushConfiguration.npmToolFilename,
        ['shrinkwrap'], this._rushConfiguration.commonFolder);
      console.log('"npm shrinkwrap" completed' + os.EOL);
    }

    stopwatch.stop();
    console.log(os.EOL + colors.green(`Rush generate finished successfully. (${stopwatch.toString()})`));

    if (!this._noLinkParameter.value) {
      const linkAction: LinkAction = new LinkAction(this._parser);
      linkAction.execute();
    } else {
      console.log(os.EOL + 'Next you should probably run: "rush link"');
    }
  }
}
