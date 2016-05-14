/**
 * @file rush.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Defines routing for the rush tool
 */

/// <reference path="../typings/tsd.d.ts" />
import * as os from 'os';
import * as argparse from 'argparse';
import * as path from 'path';
import * as colors from 'colors';

import CommandLineAction from './commandLine/CommandLineAction';
import CommandLineParser from './commandLine/CommandLineParser';
import { CommandLineFlag } from './commandLine/CommandLineParameter';

import RushConfig from './RushConfig';
import executeLink, { IExecuteLinkOptions } from './ExecuteLink';
import executeBuild, { IExecuteBuildOptions } from './ExecuteBuild';
import executeUpdate from './ExecuteUpdate';
import Utilities from './Utilities';

const myPackageJsonFilename: string = path.resolve(path.join(
  module.filename, '..', '..', 'package.json')
);
const myPackageJson: PackageJson = require(myPackageJsonFilename);

console.log(os.EOL + colors.bold(`Rush Multi-Package Build Tool ${myPackageJson.version}`)
  + os.EOL);

class LinkAction extends CommandLineAction {
  private _noLocalLinksParameter: CommandLineFlag;

  constructor() {
    super({
      commandVerb: 'link',
      summary: 'Create node_modules symlinks for all projects',
      documentation: 'Create node_modules symlinks for all projects'
    });
  }

  protected onDefineOptions(): void {
    this._noLocalLinksParameter = this.defineFlagParameter({
      parameterLongName: '--no-local-links',
      parameterShortName: '-n',
      description: 'Do not locally link the projects; always link to the common folder'
    });
  }

  protected onExecute(): void {
    console.log('LINK WITH NLL=' + this._noLocalLinksParameter.value);
/*
    executeLink(RushConfig.loadFromDefaultLocation(), {
      noLocalLinks: this._noLocalLinksParameter.value
    });
*/
  }
}


class UpdateAction extends CommandLineAction {
  constructor() {
    super({
      commandVerb: 'update',
      summary: 'Rebuild the Rush common folder',
      documentation: 'Use this after changing package.json.  It scans all project dependencies'
        + ' and then rebuilds the Rush common folder.'
    });
  }

  protected onDefineOptions(): void {
  }

  protected onExecute(): void {
    console.log('UPDATE');
    //executeUpdate(RushConfig.loadFromDefaultLocation());
  }
}


class RebuildAction extends CommandLineAction {
  private _quietParameter: CommandLineFlag;
  private _productionParameter: CommandLineFlag;
  private _vsoParameter: CommandLineFlag;

  constructor() {
    super({
      commandVerb: 'rebuild',
      summary: 'Cleans and rebuilds the entire set of projects',
      documentation: 'The Rush rebuild command assumes that the package.json file for each'
        + ' project will contain scripts for "npm run clean" and "npm run test".  It invokes'
        + ' these commands to build each project.  Projects are built in parallel where'
        + ' possible, but always respecting the dependency ordering.'
    });
  }

  protected onDefineOptions(): void {
    this._quietParameter = this.defineFlagParameter({
      parameterLongName: '--quiet',
      parameterShortName: '-q',
      description: 'Only show errors and overall build status'
    });
    this._productionParameter = this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'Perform a production build'
    });
    this._vsoParameter = this.defineFlagParameter({
      parameterLongName: '--vso',
      description: 'Display error messages in the format expected by Visual Studio Online'
    });
  }

  protected onExecute(): void {
    console.log('REBUILD WITH VSO=' + this._vsoParameter.value);
    /*
    executeBuild(RushConfig.loadFromDefaultLocation(), {
      production: this._productionParameter.value,
      vso: this._vsoParameter.value,
      quiet: this._quietParameter.value
    });
    */
  }
}

class RushCommandLineParser extends CommandLineParser {
  constructor() {
    super({
      toolFilename: 'rush',
      toolDescription: 'This tools helps you to manage building/installing of multiple NPM package folders.'
    });

    this.addCommand(new RebuildAction());
    this.addCommand(new LinkAction());
    this.addCommand(new UpdateAction());
  }
}

const parser = new RushCommandLineParser();

parser.execute();

