// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CleanTask } from './CleanTask';
import * as Gulp from 'gulp';
import { IBuildConfig } from './../IBuildConfig';

/**
 * This task runs once at the start of any command,
 * unless the --no-clean parameter is specified
 * @public
 */
export class CleanFlagTask extends CleanTask {
  /** Instantiates a new CleanTask with the name 'clean' */
  private _hasRun: boolean = false;

  constructor() {
    super();
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
  // tslint:disable-next-line:no-string-literal
  return !buildConfig.args['no-clean'] && !this._hasRun;
}

  public executeTask(
    gulp: typeof Gulp,
    completeCallback: (error?: string | Error) => void
  ): void {
    this._hasRun = true;
    super.executeTask(gulp, () => {
      completeCallback();
    });
  }
}