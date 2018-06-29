// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';
import * as fsx from 'fs-extra';
import * as glob from 'glob';

import {
  BaseCmdTask,
  IBaseCmdTaskConfig
} from './BaseCmdTask';

/**
 * @public
 */
export interface ITscCmdTaskConfig extends IBaseCmdTaskConfig {
  /**
   * Glob matches for files to be passed through the build.
   */
  staticMatch?: string[];
}

/**
 * @alpha
 */
export class TscCmdTask extends BaseCmdTask<ITscCmdTaskConfig> {
  constructor() {
    super(
      'tsc',
      {
        initialTaskConfig: {
          staticMatch: [
            'src/**/*.js',
            'src/**/*.json',
            'src/**/*.jsx'
          ]
        },
        packageName: 'typescript',
        packageBinPath: path.join('bin', 'tsc')
      }
    );
  }

  public loadSchema(): Object {
    return JsonFile.load(path.resolve(__dirname, '..', 'schemas', 'tsc-cmd.schema.json'));
  }

  public executeTask(gulp: Object, completeCallback: (error?: string) => void): Promise<void> | undefined {
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

    let completeCallbackCalled: boolean = false;
    let completeCallbackError: string | undefined;
    const basePromise: Promise<void> | undefined = super.executeTask(
      gulp,
      (error?: string) => {
        completeCallbackCalled = true;
        completeCallbackError = error;
      }
    );

    if (basePromise) {
      promises.push(basePromise);
    }

    return Promise.all(promises).then(() => {
      if (completeCallbackCalled) {
        completeCallback(completeCallbackError);
      }
    });
  }

  protected _onData(data: Buffer): void {
    // Log lines separately
    const dataLines: (string | undefined)[] = data.toString().split('\n');
    for (const dataLine of dataLines) {
      const trimmedLine: string = (dataLine || '').trim();
      if (!!trimmedLine) {
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
