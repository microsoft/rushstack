// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as os from 'os';
import * as path from 'path';

import {
  CommandLineAction,
  ICommandLineActionOptions
} from '@microsoft/ts-command-line';

import { LockFile } from '@microsoft/node-core-library';

import { RushConfiguration } from '../../api/RushConfiguration';
import { EventHooksManager } from '../../logic/EventHooksManager';
import { RushCommandLineParser } from './../RushCommandLineParser';
import { Utilities } from '../../utilities/Utilities';

export interface IBaseRushActionOptions extends ICommandLineActionOptions {
  /**
   * If true, no locking mechanism will be enforced when this action is run.
   * Note this defaults to false (which is a safer assumption in case this value
   *  is omitted).
   */
  safeForSimultaneousRushProcesses?: boolean;

  /**
   * The rush parser.
   */
  parser: RushCommandLineParser;
}

/**
 * The base class for a few specialized Rush command-line actions that
 * can be used without a rush.json configuration.
 */
export abstract class BaseConfiglessRushAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _safeForSimultaneousRushProcesses: boolean;

  protected get rushConfiguration(): RushConfiguration | undefined {
    return this._parser.rushConfiguration;
  }

  protected get parser(): RushCommandLineParser {
    return this._parser;
  }

  constructor(options: IBaseRushActionOptions) {
    super(options);

    this._parser = options.parser;
    this._safeForSimultaneousRushProcesses = !!options.safeForSimultaneousRushProcesses;
  }

  protected onExecute(): Promise<void> {
    this._ensureEnvironment();

    if (this.rushConfiguration) {
      if (!this._safeForSimultaneousRushProcesses) {
        if (!LockFile.tryAcquire(this.rushConfiguration.commonTempFolder, 'rush')) {
          console.log(colors.red(`Another rush command is already running in this repository.`));
          process.exit(1);
        }
      }
    }

    console.log(`Starting "rush ${this.actionName}"${os.EOL}`);
    return this.run().then(() => {
      // If we make it here, everything went fine, so reset the exit code back to 0
      process.exitCode = 0;
    });
  }

  /**
   * All Rush actions need to implement this method. This method runs after
   * environment has been set up by the base class.
   */
  protected abstract run(): Promise<void>;

  private _ensureEnvironment(): void {
    if (this.rushConfiguration) {
      /* tslint:disable-next-line:no-string-literal */
      let environmentPath: string | undefined = process.env['PATH'];
      environmentPath = path.join(this.rushConfiguration.commonTempFolder, 'node_modules', '.bin') +
        path.delimiter + environmentPath;
      /* tslint:disable-next-line:no-string-literal */
      process.env['PATH'] = environmentPath;
    }
  }
}

/**
 * The base class that most Rush command-line actions should extend.
 */
export abstract class BaseRushAction extends BaseConfiglessRushAction {
  private _eventHooksManager: EventHooksManager;

  protected get rushConfiguration(): RushConfiguration {
    return super.rushConfiguration!;
  }

  protected onExecute(): Promise<void> {
    if (!this.rushConfiguration) {
      throw Utilities.getRushConfigNotFoundError();
    }

    return super.onExecute();
  }

  protected get eventHooksManager(): EventHooksManager {
    if (!this._eventHooksManager) {
      this._eventHooksManager = new EventHooksManager(this.rushConfiguration.eventHooks,
        this.rushConfiguration.commonTempFolder);
    }
    return this._eventHooksManager;
  }
}
