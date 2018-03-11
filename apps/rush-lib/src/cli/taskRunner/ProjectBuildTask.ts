// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as fsx from 'fs-extra';
import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';
import { ITaskWriter } from '@microsoft/stream-collator';
  import {
    IPackageDeps
  } from '@microsoft/package-deps-hash';

import RushConfiguration from '../../data/RushConfiguration';
import RushConfigurationProject from '../../data/RushConfigurationProject';
import { RushConstants } from '../../RushConstants';
import Utilities from '../../utilities/Utilities';
import TaskStatus from './TaskStatus';
import TaskError from './TaskError';
import { ITaskDefinition } from '../taskRunner/ITask';
import {
  PackageChangeAnalyzer
} from '../logic/PackageChangeAnalyzer';

interface IPackageDependencies extends IPackageDeps {
  arguments: string;
}

/**
 * A TaskRunner task which cleans and builds a project
 */
export default class ProjectBuildTask implements ITaskDefinition {
  public get name(): string {
    return this._rushProject.packageName;
  }

  private _hasWarningOrError: boolean;

  constructor(
    private _rushProject: RushConfigurationProject,
    private _rushConfiguration: RushConfiguration,
    private _commandToRun: string,
    private _customFlags: string[],
    public isIncrementalBuildAllowed: boolean
  ) {}

  public execute(writer: ITaskWriter): Promise<TaskStatus> {
    return new Promise<TaskStatus>((resolve: (status: TaskStatus) => void, reject: (errors: TaskError[]) => void) => {
      try {
        const build: string = this._getScriptToRun();
        const deps: IPackageDependencies | undefined = this._getPackageDependencies(build, writer);
        this._executeTask(build, writer, deps, resolve, reject);
      } catch (error) {
        reject([new TaskError('executing', error.toString())]);
      }
    });
  }

  private _getPackageDependencies(buildCommand: string, writer: ITaskWriter): IPackageDependencies | undefined {
    let deps: IPackageDependencies | undefined = undefined;
    PackageChangeAnalyzer.rushConfig = this._rushConfiguration;
    try {
      deps = {
        files: PackageChangeAnalyzer.instance.getPackageDepsHash(this._rushProject.packageName)!.files,
        arguments: buildCommand
      };
    } catch (error) {
      writer.writeLine('Unable to calculate incremental build state. ' +
        'Instead running full rebuild. ' + error.toString());
    }
    return deps;
  }

  private _executeTask(
    buildCommand: string,
    writer: ITaskWriter,
    currentPackageDeps: IPackageDependencies | undefined,
    resolve: (status: TaskStatus) => void,
    reject: (errors: TaskError[]) => void
  ): void {
    this._hasWarningOrError = false;

    const projectFolder: string = this._rushProject.projectFolder;
    let lastPackageDeps: IPackageDependencies | undefined = undefined;

    try {
      writer.writeLine(`>>> ${this.name}`);

      const currentDepsPath: string = path.join(this._rushProject.projectFolder, RushConstants.packageDepsFilename);
      if (fsx.existsSync(currentDepsPath)) {
        lastPackageDeps = JsonFile.load(currentDepsPath) as IPackageDependencies;
      }

      const isPackageUnchanged: boolean = (
        !!(
          lastPackageDeps &&
          currentPackageDeps &&
          (currentPackageDeps.arguments === lastPackageDeps.arguments &&
          _areShallowEqual(currentPackageDeps.files, lastPackageDeps.files, writer))
        )
      );

      if (isPackageUnchanged && this.isIncrementalBuildAllowed) {
        resolve(TaskStatus.Skipped);
      } else {
        // If the deps file exists, remove it before starting a build.
        if (fsx.existsSync(currentDepsPath)) {
          fsx.unlinkSync(currentDepsPath);
        }

        if (!buildCommand) {
          // tslint:disable-next-line:max-line-length
          writer.writeLine(`The 'build' or 'test' command was registered in the package.json but is blank, so no action will be taken.`);
          resolve(TaskStatus.Success);
          return;
        }

        // Run the build step
        writer.writeLine(buildCommand);
        const buildTask: child_process.ChildProcess =
          Utilities.executeShellCommandAsync(buildCommand, projectFolder, process.env, true);

        // Hook into events, in order to get live streaming of build log
        buildTask.stdout.on('data', (data: string) => {
          writer.write(data);
        });

        buildTask.stderr.on('data', (data: string) => {
          writer.writeError(data);
          this._hasWarningOrError = true;
        });

        buildTask.on('close', (code: number) => {
          // Write the logs to disk
          this._writeLogsToDisk(writer);

          if (code) {
            reject([new TaskError('error', `Returned error code: ${code}`)]);
          } else if (this._hasWarningOrError) {
            resolve(TaskStatus.SuccessWithWarning);
          } else {
            // Write deps on success.
            if (currentPackageDeps) {
              JsonFile.save(currentPackageDeps, currentDepsPath);
            }
            resolve(TaskStatus.Success);
          }
        });
      }
    } catch (error) {
      console.log(error);

      // Write the logs to disk
      this._writeLogsToDisk(writer);
      reject([new TaskError('error', error.toString())]);
    }
  }

  private _isBuildCommand(): boolean {
    return this._commandToRun === 'build' || this._commandToRun === 'rebuild';
  }

  private _getScriptToRun(): string {
    let script: string | undefined = undefined;
    if (this._isBuildCommand()) {
      script = this._getScriptCommand('build');

      if (script === undefined) {
        // tslint:disable-next-line:max-line-length
        throw new Error(`The project [${this._rushProject.packageName}] does not define a 'build' command in the 'scripts' section of its package.json`);
      }

    } else {
      script = this._getScriptCommand(this._commandToRun);

      if (script === undefined) {
        // tslint:disable-next-line:max-line-length
        throw new Error(`The project [${this._rushProject.packageName}] does not define a '${this._commandToRun}' command in the 'scripts' section of its package.json`);
      }
    }

    if (script === '') {
      return script;
    }

    return `${script} ${this._customFlags.join(' ')}`;
  }

  private _getScriptCommand(script: string): string | undefined {
    // tslint:disable-next-line:no-string-literal
    if (!this._rushProject.packageJson.scripts) {
      return undefined;
    }

    const rawCommand: string = this._rushProject.packageJson.scripts[script];

    // tslint:disable-next-line:no-null-keyword
    if (rawCommand === undefined || rawCommand === null) {
      return undefined;
    }

    return rawCommand;
  }

  // @todo #179371: add log files to list of things that get gulp cleaned
  private _writeLogsToDisk(writer: ITaskWriter): void {
    const logFilename: string = path.basename(this._rushProject.projectFolder);

    const stdout: string = writer.getStdOutput().replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
    if (stdout) {
      fsx.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.log'), stdout);
    }

    const stderr: string = writer.getStdError().replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
    if (stderr) {
      fsx.writeFileSync(path.join(this._rushProject.projectFolder, logFilename + '.build.error.log'), stderr);
    }
  }
}

function _areShallowEqual(object1: Object, object2: Object, writer: ITaskWriter): boolean {
  for (const n in object1) {
    if (!(n in object2) || object1[n] !== object2[n]) {
      writer.writeLine(`Found mismatch: "${n}": "${object1[n]}" !== "${object2[n]}"`);
      return false;
    }
  }
  for (const n in object2) {
    if (!(n in object1)) {
      writer.writeLine(`Found new prop in obj2: "${n}" value="${object2[n]}"`);
      return false;
    }
  }
  return true;
}
