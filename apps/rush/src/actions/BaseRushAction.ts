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

import EventHooksManager from '../utilities/EventHooksManager';

/**
 * The base Rush action that all Rush actions should extend.
 */
export abstract class BaseRushAction extends CommandLineAction {
  private _rushConfiguration: RushConfiguration;
  private _eventHooksManager: EventHooksManager;

  constructor(options: ICommandLineActionOptions) {
    super(options);
  }

  protected onExecute(): void {
    this._ensureEnvironment();
    this.run();
  }

  /**
   * All Rush actions need to implement this method. This method runs after
   * environment has been set up by the base class.
   */
  protected abstract run(): void;

  protected get rushConfiguration(): RushConfiguration {
    if (!this._rushConfiguration) {
      this._rushConfiguration = RushConfiguration.loadFromDefaultLocation();
    }
    return this._rushConfiguration;
  }

  protected get eventHooksManager(): EventHooksManager {
    if (!this._eventHooksManager) {
      this._eventHooksManager = new EventHooksManager(this.rushConfiguration.eventHooks);
    }
    return this._eventHooksManager;
  }

  private _ensureEnvironment(): void {
    /* tslint:disable-next-line:no-string-literal */
    let environmentPath: string = process.env['PATH'];
    environmentPath = path.join(this.rushConfiguration.commonTempFolder, 'node_modules', '.bin') +
      path.delimiter + environmentPath;
    /* tslint:disable-next-line:no-string-literal */
    process.env['PATH'] = environmentPath;
  }
}