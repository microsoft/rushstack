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
      'Analyzes the provided telemetry file to provide insight into the build timing data. The "--dependency-analysis" flag' +
        'will identify the projects which are chokepoints during the build. Reducing the build times of these projects will' +
        'directly reduce the overall build time by 1 second. The --simulate flag will identify the optimal number of CPU cores' +
        'to build your project to help teams make more informed decisions about the number of CPU cores to use to build their project.'
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
