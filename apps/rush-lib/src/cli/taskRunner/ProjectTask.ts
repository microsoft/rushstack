// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as fsx from 'fs-extra';
import * as path from 'path';
import { JsonFile, Text } from '@microsoft/node-core-library';
import { ITaskWriter } from '@microsoft/stream-collator';
import { IPackageDeps } from '@microsoft/package-deps-hash';

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
export default class ProjectTask implements ITaskDefinition {
  public get name(): string {
    return this._rushProject.packageName;
  }

  private _hasWarningOrError: boolean;
  private _packageChangeAnalyzer: PackageChangeAnalyzer;

  constructor(
    private _rushProject: RushConfigurationProject,
    private _rushConfiguration: RushConfiguration,
    private _commandToRun: string,
    private _customFlags: string[],
    public isIncrementalBuildAllowed: boolean,
    private _ignoreMissingScript: boolean
  ) {
    this._packageChangeAnalyzer = new PackageChangeAnalyzer(this._rushConfiguration);
  }

  public execute(writer: ITaskWriter): Promise<TaskStatus> {
    return new Promise<TaskStatus>((resolve: (status: TaskStatus) => void, reject: (errors: TaskError[]) => void) => {
      try {
        const taskCommand: string = this._getScriptToRun();
        const deps: IPackageDependencies | undefined = this._getPackageDependencies(taskCommand, writer);
        this._executeTask(taskCommand, writer, deps, resolve, reject);
      } catch (error) {
        reject([new TaskError('executing', error.toString())]);
      }
    });
  }

  private _getPackageDependencies(taskCommand: string, writer: ITaskWriter): IPackageDependencies | undefined {
    let deps: IPackageDependencies | undefined = undefined;
    this._rushConfiguration = this._rushConfiguration;
    try {
      deps = {
        files: this._packageChangeAnalyzer.getPackageDepsHash(this._rushProject.packageName)!.files,
        arguments: taskCommand
      };
    } catch (error) {
      writer.writeLine('Unable to calculate incremental build state. ' +
        'Instead running full rebuild. ' + error.toString());
    }

    return deps;
  }

  private _executeTask(
    taskCommand: string,
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
        try {
          lastPackageDeps = JsonFile.load(currentDepsPath) as IPackageDependencies;
        } catch (e) {
          // Warn and ignore - treat failing to load the file as the project being not built.
          writer.writeLine(
            `Warning: error parsing ${RushConstants.packageDepsFilename}: ${e}. Ignoring and ` +
            'treating the project as non-built.'
          );
        }
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

        if (!taskCommand) {
          // tslint:disable-next-line:max-line-length
          writer.writeLine(`The task command ${this._commandToRun} was registered in the package.json but is blank, so no action will be taken.`);
          resolve(TaskStatus.Skipped);
          return;
        }

        // Run the task

        const convertedTaskCommand: string = process.platform === 'win32'
          ? convertSlashesForWindows(taskCommand)
          : taskCommand;

        writer.writeLine(convertedTaskCommand);
        const task: child_process.ChildProcess =
          Utilities.executeShellCommandAsync(convertedTaskCommand, projectFolder, process.env, true);

        // Hook into events, in order to get live streaming of build log
        task.stdout.on('data', (data: string) => {
          writer.write(data);
        });

        task.stderr.on('data', (data: string) => {
          writer.writeError(data);
          this._hasWarningOrError = true;
        });

        task.on('close', (code: number) => {
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

      if (script === undefined && !this._ignoreMissingScript) {
        // tslint:disable-next-line:max-line-length
        throw new Error(`The project [${this._rushProject.packageName}] does not define a '${this._commandToRun}' command in the 'scripts' section of its package.json`);
      }
    }

    if (!script) {
      return '';
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

/**
 * When running a command from the "scripts" block in package.json, if the command
 * contains Unix-style path slashes, the package managers will convert the slashes
 * to backslashes for the Windows OS.  This is a complicated heuristic.  For example,
 * we want to convert "node_modules/bin/this && ./scripts/that" to
 * "node_modules\bin\this && .\scripts\that" but we don't want to convert
 * the slashes in  "cmd.exe /c blah".  NPM and PNPM use npm-lifecycle for this,
 * but it unfortunately has a dependency on the entire node-gyp kitchen sink.
 * Yarn has a simplified implementation in fix-cmd-win-slashes.js, but it's not
 * exposed as a library.
 *
 * Since the "&&" and quoting edge cases are mostly deprecated for Rush projects,
 * we will just do something very basic for now.  We can improve it later if someone
 * actually complains.
 */
export function convertSlashesForWindows(command: string): string {
  // Match everything up to the first space, "&", "|", "<", ">", or quote
  const commandRegExp: RegExp = /^([^\s&|<>"]+)(.*)$/;
  const match: RegExpMatchArray | null = commandRegExp.exec(command);
  if (match) {
    // Example input: "bin/blarg --path ./config/blah.json && a/b"
    // commandPart="bin/blarg"
    // remainder=" --path ./config/blah.json && a/b"
    const commandPart: string = match[1];
    const remainder: string = match[2];

    // If the command part already contains a backslash, then leave it alone
    if (commandPart.indexOf('\\') < 0) {
      // Replace all the slashes with backslashes, e.g. to produce:
      // "bin\blarg --path ./config/blah.json && a/b"
      //
      // NOTE: we don't attempt to process the path parameter or stuff after "&&"
      return Text.replaceAll(commandPart, '/', '\\') + remainder;
    }
  }

  // Don't change anything
  return command;
}
