// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as Gulp from 'gulp';
import * as path from 'path';
import {
  JsonFile,
  IPackageJson
} from '@microsoft/node-core-library';
import * as fsx from 'fs-extra';
import * as glob from 'glob';

import { BaseCmdTask } from './BaseCmdTask';

/**
 * @public
 */
export interface ITscCmdTaskConfig {
  /**
   * The path to the typescript compiler package if the task should override the version of the compiler.
   */
  typescriptCompilerPackagePath?: string;

  /**
   * Optional list of custom args to pass to "tsc"
   */
  customArgs?: string[];

  /**
   * Glob matches for files to be passed through the build.
   */
  staticMatch?: string[];

  /**
   * The directory in which the typescript compiler should be invoked.
   */
  buildDirectory?: string;
}

/**
 * @public
 */
export class TscCmdTask extends BaseCmdTask<ITscCmdTaskConfig> {
  constructor() {
    super(
      'tsc',
      {
        staticMatch: [
          'src/**/*.js',
          'src/**/*.json',
          'src/**/*.jsx'
        ]
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, '..', 'schemas', 'tsc-cmd.schema.json'));
  }

  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): Promise<void> | undefined {
    // require.resolve('typescript') resolves to <package>/lib/typescript.js, and we want the package path
    let compilerPackagePath: string = path.resolve(require.resolve('typescript'), '..', '..');
    // Find the "tsc" executable
    if (this.taskConfig.typescriptCompilerPackagePath) {
      // The TS version is being overridden
      if (!fsx.existsSync(this.taskConfig.typescriptCompilerPackagePath)) {
        completeCallback(
          `The specified compiler path (${this.taskConfig.typescriptCompilerPackagePath}) does not ` +
          'exist'
        );
        return;
      }

      compilerPackagePath = this.taskConfig.typescriptCompilerPackagePath;
    }

    const buildDirectory: string = this.taskConfig.buildDirectory || this.buildConfig.rootPath;

    // Print the version
    const packageJson: IPackageJson = JsonFile.load(path.join(compilerPackagePath, 'package.json'));
    this.log(`TypeScript version: ${packageJson.version}`);

    const compilerBinaryPath: string = path.resolve(compilerPackagePath, 'bin', 'tsc');
    if (!fsx.existsSync(compilerBinaryPath)) {
      completeCallback('The compiler binary is missing. This indicates that typescript is not installed correctly.');
      return;
    }

    // Static passthrough files.
    const srcPath: string = path.join(this.buildConfig.rootPath, this.buildConfig.srcFolder);
    const libFolders: string[] = [this.buildConfig.libFolder];
    if (this.buildConfig.libAMDFolder) {
      libFolders.push(this.buildConfig.libAMDFolder);
    }

    if (this.buildConfig.libES6Folder) {
      libFolders.push(this.buildConfig.libES6Folder);
    }

    if (this.buildConfig.libESNextFolder) {
      libFolders.push(this.buildConfig.libESNextFolder);
    }

    const resolvedLibFolders: string[] = libFolders.map((libFolder) => path.join(this.buildConfig.rootPath, libFolder));
    const promises: Promise<void>[] = (this.taskConfig.staticMatch || []).map((pattern) => {
      return new Promise((resolve: () => void, reject: (error: Error) => void) => {
        glob(path.join(this.buildConfig.rootPath, pattern), (error: Error, matchPaths: string[]) => {
          if (error) {
            reject(error);
          } else {
            for (const matchPath of matchPaths) {
              const fileContents: Buffer = fsx.readFileSync(matchPath);
              const relativePath: string = path.relative(srcPath, matchPath);
              for (const resolvedLibFolder of resolvedLibFolders) {
                const destPath: string = path.join(resolvedLibFolder, relativePath);
                fsx.ensureDirSync(path.dirname(destPath));
                fsx.writeFileSync(destPath, fileContents);
              }
            }

            resolve();
          }
        });
      });
    });

    promises.push(
      this._callCmd(
        compilerBinaryPath,
        buildDirectory,
        this.taskConfig.customArgs || [],
        {
          onData: (data: Buffer) => {
            // Log lines separately
            const dataLines: (string | undefined)[] = data.toString().split('\n');
            for (const dataLine of dataLines) {
              if (dataLine) {
                const trimmedLine: string = dataLine.trim();
                if (trimmedLine.match(/\serror\s/i)) {
                  // If the line looks like an error, log it as an error
                  this.logError(trimmedLine);
                } else {
                  this.log(trimmedLine);
                }
              }
            }
          }
        }
      )
    );

    return Promise.all(promises).then(() => { /* collapse void[] to void */ });
  }
}
