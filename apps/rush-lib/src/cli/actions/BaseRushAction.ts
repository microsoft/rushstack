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
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { RushConstants } from '../../logic/RushConstants';
import { VersionMismatchFinder } from '../../api/VersionMismatchFinder';

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
    return this.run();
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

  protected runRushCheckIfNecessary(isRushCheckCommand: boolean = false): void {
    if (this.rushConfiguration.requireVersionChecks || isRushCheckCommand) {
      // Collect all the preferred versions into a single table
      const allPreferredVersions: { [dependency: string]: string } = {};

      this.rushConfiguration.commonVersions.getAllPreferredVersions().forEach((version: string, dependency: string) => {
        allPreferredVersions[dependency] = version;
      });

      // Create a fake project for the purposes of reporting conflicts with preferredVersions
      // or xstitchPreferredVersions from common-versions.json
      const projects: RushConfigurationProject[] = [...this.rushConfiguration.projects];

      projects.push({
        packageName: 'preferred versions from ' + RushConstants.commonVersionsFilename,
        packageJson: { dependencies: allPreferredVersions }
      } as RushConfigurationProject);

      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(
        projects,
        this.rushConfiguration.commonVersions.allowedAlternativeVersions
      );

      // Iterate over the list. For any dependency with mismatching versions, print the projects
      mismatchFinder.getMismatches().forEach((dependency: string) => {
        console.log(colors.yellow(dependency));
        mismatchFinder.getVersionsOfMismatch(dependency)!.forEach((version: string) => {
          console.log(`  ${version}`);
          mismatchFinder.getConsumersOfMismatch(dependency, version)!.forEach((project: string) => {
            console.log(`   - ${project}`);
          });
        });
        console.log();
      });

      if (mismatchFinder.numberOfMismatches) {
        console.log(colors.red(`Found ${mismatchFinder.numberOfMismatches} mis-matching dependencies!`));
        process.exit(1);
      } else {
        if (isRushCheckCommand) {
          console.log(colors.green(`Found no mis-matching dependencies!`));
        }
      }
    }
  }
}
