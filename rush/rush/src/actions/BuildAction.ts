/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import {
  CommandLineFlagParameter
} from '@microsoft/ts-command-line';
import RushCommandLineParser from './RushCommandLineParser';
import RebuildAction from './RebuildAction';

export default class BuildAction extends RebuildAction {
  private _cleanParameter: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super(parser, {
      actionVerb: 'build',
      summary: '(EXPERIMENTAL) Build all projects that have changed or need to be built.',
      documentation: 'The Rush build command assumes that the package.json file for each'
      + ' project will contain scripts for "npm run clean" and "npm run test".  It invokes'
      + ' these commands to build each project.  Projects are built in parallel where'
      + ' possible, but always respecting the dependency graph for locally linked projects.'
      + ' The number of simultaneous processes will be equal to the number of machine cores.'
      + ' unless overriden by the --parallelism flag.'
    });
  }

  protected onDefineParameters(): void {
    super.onDefineParameters();

    this._cleanParameter = this.defineFlagParameter({
      parameterLongName: '--clean',
      parameterShortName: '-c',
      description: 'Skip incremental build detection and force a clean build.'
    });
  }

  protected onExecute(): void {
    // If the clean flag is false, we will support incremental build by default.
    this._isIncrementalBuildAllowed = !this._cleanParameter.value;

    super.onExecute();
  }
}