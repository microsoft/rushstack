// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import { SymlinkAnalyzer } from './SymlinkAnalyzer';

export class DeployManager {
  private _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  public deploy(value: string, overwriteExisting: boolean, targetFolder: string | undefined) {

  }
}
