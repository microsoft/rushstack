// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { CommandLineFlagParameter, CommandLineStringParameter } from '@rushstack/ts-command-line';
import { ConsoleTerminalProvider, type ITerminal, Terminal } from '@rushstack/terminal';

import type { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder';

export class CheckAction extends BaseRushAction {
  private readonly _terminal: ITerminal;
  private readonly _jsonFlag: CommandLineFlagParameter;
  private readonly _verboseFlag: CommandLineFlagParameter;
  private readonly _subspaceParameter: CommandLineStringParameter | undefined;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'check',
      summary:
        "Checks each project's package.json files and ensures that all dependencies are of the same " +
        'version throughout the repository.',
      documentation:
        "Checks each project's package.json files and ensures that all dependencies are of the " +
        'same version throughout the repository.',
      safeForSimultaneousRushProcesses: true,
      parser
    });

    this._terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: parser.isDebug }));
    this._jsonFlag = this.defineFlagParameter({
      parameterLongName: '--json',
      description: 'If this flag is specified, output will be in JSON format.'
    });
    this._verboseFlag = this.defineFlagParameter({
      parameterLongName: '--verbose',
      description:
        'If this flag is specified, long lists of package names will not be truncated. ' +
        `This has no effect if the ${this._jsonFlag.longName} flag is also specified.`
    });
    this._subspaceParameter = this.defineStringParameter({
      parameterLongName: '--subspace',
      argumentName: 'SUBSPACE_NAME',
      description:
        '(EXPERIMENTAL) Specifies an individual Rush subspace to check, requiring versions to be ' +
        'consistent only within that subspace (ignoring other subspaces). This parameter is required when ' +
        'the "subspacesEnabled" setting is set to true in subspaces.json.'
    });
  }

  protected async runAsync(): Promise<void> {
    if (this.rushConfiguration.subspacesFeatureEnabled && !this._subspaceParameter) {
      throw new Error(
        `The --subspace parameter must be specified with "rush check" when subspaces is enabled.`
      );
    }
    VersionMismatchFinder.rushCheck(this.rushConfiguration, this._terminal, {
      printAsJson: this._jsonFlag.value,
      truncateLongPackageNameLists: !this._verboseFlag.value,
      subspace: this._subspaceParameter?.value
        ? this.rushConfiguration.getSubspace(this._subspaceParameter.value)
        : this.rushConfiguration.defaultSubspace
    });
  }
}
