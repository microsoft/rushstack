// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';
import * as colors from 'colors';

import inquirer = require('inquirer');

import {
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';
import { FileSystem } from '@microsoft/node-core-library';

import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import {
  IChangeFile,
  IChangeInfo
} from '../../api/ChangeManagement';
import { VersionControl } from '../../utilities/VersionControl';
import { ChangeFile } from '../../api/ChangeFile';
import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { ChangeFiles } from '../../logic/ChangeFiles';
import {
  VersionPolicy,
  IndividualVersionPolicy,
  LockStepVersionPolicy,
  VersionPolicyDefinitionName
} from '../../api/VersionPolicy';

export class ChangeAction extends BaseRushAction {
  private _exactFlag: CommandLineFlagParameter;
  private _caretFlag: CommandLineFlagParameter;
  private _devDependencyFlag: CommandLineFlagParameter;
  private _makeConsistentFlag: CommandLineFlagParameter;
  private _noInstallFlag: CommandLineFlagParameter;
  private _packageName: CommandLineStringParameter;
  private _versionSpecifier: CommandLineStringParameter;

  constructor(parser: RushCommandLineParser) {
    const documentation: string[] = [
      'Blah.'
    ];
    super({
      actionName: 'add',
      summary: 'Adds a dependency to the package.json and runs rush upgrade.',
      documentation: documentation.join(os.EOL),
      safeForSimultaneousRushProcesses: false,
      parser
    });
  }

  public onDefineParameters(): void {
    this._packageName = this.defineStringParameter({
      parameterLongName: '--package',
      parameterShortName: '-p',
      required: true,
      argumentName: 'PACKAGE_NAME',
      description: '(Required) The name of the package which should be added as a dependency'
    });
    this._versionSpecifier = this.defineStringParameter({
      parameterLongName: '--version',
      parameterShortName: '-v',
      argumentName: 'VERSION_RANGE',
      description: ''
    });
    this._exactFlag = this.defineFlagParameter({
      parameterLongName: '--exact',
      description: 'If specified, the version specifier inserted into the'
        + ' package.json will be a locked, exact version.'
    });
    this._caretFlag = this.defineFlagParameter({
      parameterLongName: '--caret',
      description: 'If specified, the version specifier inserted into the'
        + ' package.json will be a prepended with a "caret" specifier ("^").'
    });
    this._devDependencyFlag = this.defineFlagParameter({
      parameterLongName: '--dev',
      description: 'If specified, the package will be added as a "devDependency"'
        + ' to the package.json'
    });
    this._makeConsistentFlag = this.defineFlagParameter({
      parameterLongName: '--make-consistent',
      parameterShortName: '-c',
      description: 'If specified, other packages with this dependency will have their package.json'
        + ' files updated to point at the specified depdendency'
    });
    this._noInstallFlag = this.defineFlagParameter({
      parameterLongName: '--no-install',
      parameterShortName: '-n',
      description: 'If specified, the "rush update" command will not be run after updating the'
        + ' package.json files.'
    });
  }

  public run(): Promise<void> {
    const project: RushConfigurationProject | undefined
      = this.rushConfiguration.getCurrentProjectFromPath(process.cwd());

    if (!project) {
      return Promise.reject(new Error('Not currently in a project folder'));
    }




    this.rushConfiguration.projects


    return Promise.resolve();
  }
}
