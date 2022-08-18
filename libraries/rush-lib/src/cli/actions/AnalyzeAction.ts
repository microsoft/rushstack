// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import { Terminal } from '@rushstack/node-core-library';

import { BaseRushAction } from './BaseRushAction';
import { RushCommandLineParser } from '../RushCommandLineParser';
import { dependencyAnalysis, simulateBuildTime } from '../../logic/operations/DependencyAnalysisPlugin';

export class AnalyzeAction extends BaseRushAction {
  private _dependencyAnalysisFlag!: CommandLineFlagParameter;
  private _simulateFlag!: CommandLineFlagParameter;
  private _telemetryFileName!: CommandLineStringParameter;

  public constructor(parser: RushCommandLineParser) {
    const documentation: string[] = [
      'Adds specified package(s) to the dependencies of the current project (as determined by the current working directory)' +
        ' and then runs "rush update". If no version is specified, a version will be automatically detected (typically' +
        ' either the latest version or a version that won\'t break the "ensureConsistentVersions" policy). If a version' +
        ' range (or a workspace range) is specified, the latest version in the range will be used. The version will be' +
        ' automatically prepended with a tilde, unless the "--exact" or "--caret" flags are used. The "--make-consistent"' +
        ' flag can be used to update all packages with the dependency.'
    ];
    super({
      actionName: 'analyze',
      summary: 'Analyzes the Rush Project based on a telemetry file.',
      documentation: documentation.join(os.EOL),
      safeForSimultaneousRushProcesses: false,
      parser
    });
  }

  public onDefineParameters(): void {
    this._dependencyAnalysisFlag = this.defineFlagParameter({
      parameterLongName: '--dependency-analysis',
      parameterShortName: '-d',
      description: 'print build timing analysis by project'
    });
    this._simulateFlag = this.defineFlagParameter({
      parameterLongName: '--simulate',
      description:
        'Simulate the build with different number of CPU cores and find the optimal number of CPU cores.'
    });
    this._telemetryFileName = this.defineStringParameter({
      parameterLongName: '--file',
      required: true,
      argumentName: 'FILE',
      description:
        'The name of the telemetry file for dependency analysis to utilize. The telemetry file should exist in the rush telemetry folder'
    });
  }

  public async runAsync(): Promise<void> {
    const terminal: Terminal = new Terminal(this.rushSession.terminalProvider);
    const telemetryFolderName: string = path.join(this.rushConfiguration.commonTempFolder, 'telemetry');
    const fullPath: string = path.join(telemetryFolderName, this._telemetryFileName?.value ?? '');

    if (this._dependencyAnalysisFlag.value) {
      dependencyAnalysis(fullPath, terminal);
    }

    if (this._simulateFlag.value) {
      simulateBuildTime(fullPath, terminal);
    }
  }
}
