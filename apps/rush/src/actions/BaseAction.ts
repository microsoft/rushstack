// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  CommandLineAction,
  ICommandLineActionOptions
} from '@microsoft/ts-command-line';

import {
  RushConfiguration
} from '@microsoft/rush-lib';

export abstract class BaseAction extends CommandLineAction {
  protected _rushConfiguration: RushConfiguration;

  constructor(options: ICommandLineActionOptions) {
    super(options);
  }

  protected onExecute(): void {
    this._initialize();
    this.run();
  }

  protected abstract run(): void;

  private _initialize(): void {
    this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();
    this._ensureEnvironment();
  }

  private _ensureEnvironment(): void {
    /* tslint:disable-next-line:no-string-literal */
    let environmentPath: string = process.env['PATH'];
    environmentPath = path.join(this._rushConfiguration.commonTempFolder, 'node_modules', '.bin') +
      path.delimiter + environmentPath;
    /* tslint:disable-next-line:no-string-literal */
    process.env['PATH'] = environmentPath;
  }
}