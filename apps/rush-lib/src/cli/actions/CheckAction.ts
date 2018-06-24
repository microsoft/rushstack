// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { VersionMismatchFinder } from '../../api/VersionMismatchFinder';
import { Variants } from '../../api/Variants';
import { CommandLineStringParameter } from '@microsoft/ts-command-line';

export class CheckAction extends BaseRushAction {
  private _variant: CommandLineStringParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'check',
      summary: 'Checks each project\'s package.json files and ensures that all dependencies are of the same ' +
        'version throughout the repository.',
      documentation: 'Checks each project\'s package.json files and ensures that all dependencies are of the ' +
        'same version throughout the repository.',
      safeForSimultaneousRushProcesses: true,
      parser
    });
  }

  protected onDefineParameters(): void {
    this._variant = this.defineStringParameter(Variants.VARIANT_PARAMETER);
  }

  protected run(): Promise<void> {
    VersionMismatchFinder.rushCheck(this.rushConfiguration, {
      variant: this._variant.value
    });
    return Promise.resolve();
  }
}
