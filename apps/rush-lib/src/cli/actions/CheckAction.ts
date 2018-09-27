// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { VersionMismatchFinder } from '../../api/VersionMismatchFinder';

export class CheckAction extends BaseRushAction {
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
    // abstract
  }

  protected run(): Promise<void> {
    VersionMismatchFinder.rushCheck(this.rushConfiguration);
    return Promise.resolve();
  }
}
