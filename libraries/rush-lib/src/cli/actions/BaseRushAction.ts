// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { CommandLineAction, type ICommandLineActionOptions } from '@rushstack/ts-command-line';
import { LockFile } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration.ts';
import { EventHooksManager } from '../../logic/EventHooksManager.ts';
import { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { Utilities } from '../../utilities/Utilities.ts';
import type { RushGlobalFolder } from '../../api/RushGlobalFolder.ts';
import type { RushSession } from '../../pluginFramework/RushSession.ts';
import type { IRushCommand } from '../../pluginFramework/RushLifeCycle.ts';
import { measureAsyncFn } from '../../utilities/performance.ts';

const PERF_PREFIX: string = 'rush:action';

export interface IBaseRushActionOptions extends ICommandLineActionOptions {
  /**
   * By default, Rush operations acquire a lock file which prevents multiple commands from executing simultaneously
   * in the same repo folder.  (For example, it would be a mistake to run "rush install" and "rush build" at the
   * same time.)  If your command makes sense to run concurrently with other operations,
   * set safeForSimultaneousRushProcesses=true to disable this protection.  In particular, this is needed for
   * custom scripts that invoke other Rush commands.
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
export abstract class BaseConfiglessRushAction extends CommandLineAction implements IRushCommand {
  private _safeForSimultaneousRushProcesses: boolean;

  protected readonly rushConfiguration: RushConfiguration | undefined;
  protected readonly terminal: ITerminal;
  protected readonly rushSession: RushSession;
  protected readonly rushGlobalFolder: RushGlobalFolder;
  protected readonly parser: RushCommandLineParser;

  public constructor(options: IBaseRushActionOptions) {
    super(options);

    const { parser, safeForSimultaneousRushProcesses } = options;
    this.parser = parser;
    const { rushConfiguration, terminal, rushSession, rushGlobalFolder } = parser;
    this._safeForSimultaneousRushProcesses = !!safeForSimultaneousRushProcesses;
    this.rushConfiguration = rushConfiguration;
    this.terminal = terminal;
    this.rushSession = rushSession;
    this.rushGlobalFolder = rushGlobalFolder;
  }

  protected override async onExecuteAsync(): Promise<void> {
    this._ensureEnvironment();

    if (this.rushConfiguration) {
      if (!this._safeForSimultaneousRushProcesses) {
        if (!LockFile.tryAcquire(this.rushConfiguration.commonTempFolder, 'rush')) {
          this.terminal.writeLine(
            Colorize.red(`Another Rush command is already running in this repository.`)
          );
          process.exit(1);
        }
      }
    }

    if (!RushCommandLineParser.shouldRestrictConsoleOutput()) {
      this.terminal.write(`Starting "rush ${this.actionName}"\n`);
    }

    await measureAsyncFn(`${PERF_PREFIX}:runAsync`, () => this.runAsync());
  }

  /**
   * All Rush actions need to implement this method. This method runs after
   * environment has been set up by the base class.
   */
  protected abstract runAsync(): Promise<void>;

  private _ensureEnvironment(): void {
    if (this.rushConfiguration) {
      // eslint-disable-next-line dot-notation
      let environmentPath: string | undefined = process.env['PATH'];
      environmentPath =
        path.join(this.rushConfiguration.commonTempFolder, 'node_modules', '.bin') +
        path.delimiter +
        environmentPath;
      // eslint-disable-next-line dot-notation
      process.env['PATH'] = environmentPath;
    }
  }
}

/**
 * The base class that most Rush command-line actions should extend.
 */
export abstract class BaseRushAction extends BaseConfiglessRushAction {
  private _eventHooksManager: EventHooksManager | undefined;

  protected get eventHooksManager(): EventHooksManager {
    if (!this._eventHooksManager) {
      this._eventHooksManager = new EventHooksManager(this.rushConfiguration);
    }

    return this._eventHooksManager;
  }

  protected readonly rushConfiguration!: RushConfiguration;

  protected override async onExecuteAsync(): Promise<void> {
    if (!this.rushConfiguration) {
      throw Utilities.getRushConfigNotFoundError();
    }

    this._throwPluginErrorIfNeed();

    await measureAsyncFn(`${PERF_PREFIX}:initializePluginsAsync`, () =>
      this.parser.pluginManager.tryInitializeAssociatedCommandPluginsAsync(this.actionName)
    );

    this._throwPluginErrorIfNeed();

    const { hooks: sessionHooks } = this.rushSession;
    await measureAsyncFn(`${PERF_PREFIX}:initializePlugins`, async () => {
      if (sessionHooks.initialize.isUsed()) {
        // Avoid the cost of compiling the hook if it wasn't tapped.
        await sessionHooks.initialize.promise(this);
      }
    });

    return super.onExecuteAsync();
  }

  /**
   * If an error is encountered while trying to load plugins, it is saved in the `PluginManager.error`
   * property, so we can defer throwing it until when `_throwPluginErrorIfNeed()` is called.
   */
  private _throwPluginErrorIfNeed(): void {
    // If the plugin configuration is broken, these three commands are used to fix the problem:
    //
    //   "rush update"
    //   "rush init-autoinstaller"
    //   "rush update-autoinstaller"
    //
    // In addition, the "rush setup" command is designed to help new users configure their access
    // to a private NPM registry, which means it can't rely on plugins that might live in that
    // registry.
    //
    // Thus we do not report plugin errors when invoking these commands.
    if (!['update', 'init-autoinstaller', 'update-autoinstaller', 'setup'].includes(this.actionName)) {
      const pluginError: Error | undefined = this.parser.pluginManager.error;
      if (pluginError) {
        throw pluginError;
      }
    }
  }
}
