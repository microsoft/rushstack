// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile, FileSystem, LegacyAdapters, JsonObject } from '@rushstack/node-core-library';
import * as glob from 'glob';
import * as globEscape from 'glob-escape';
import * as decomment from 'decomment';
import {
  TypescriptCompiler as TTypescriptCompiler,
  Typescript as TTypescript
} from '@microsoft/rush-stack-compiler-3.1';

import { RSCTask, IRSCTaskConfig } from './RSCTask';
import { TsParseConfigHost } from './TsParseConfigHost';

/**
 * @public
 */
export interface ITscCmdTaskConfig extends IRSCTaskConfig {
  /**
   * Option to pass custom arguments to the tsc command.
   */
  customArgs?: string[];

  /**
   * Glob matches for files to be passed through the build.
   */
  staticMatch?: string[];

  /**
   * Removes comments from all generated `.js` files in the TSConfig outDir. Will **not** remove comments from
   * generated `.d.ts` files. Defaults to false.
   */
  removeCommentsFromJavaScript?: boolean;
}

/**
 * @public
 */
export class TscCmdTask extends RSCTask<ITscCmdTaskConfig> {
  public constructor() {
    super('tsc', {
      staticMatch: ['src/**/*.js', 'src/**/*.json', 'src/**/*.jsx'],
      removeCommentsFromJavaScript: false
    });
  }

  public loadSchema(): JsonObject {
    return JsonFile.load(path.resolve(__dirname, 'schemas', 'tsc-cmd.schema.json'));
  }

  public executeTask(): Promise<void> {
    this.initializeRushStackCompiler();

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

    const resolvedLibFolders: string[] = libFolders.map((libFolder) =>
      path.join(this.buildConfig.rootPath, libFolder)
    );
    const promises: Promise<void>[] = (this.taskConfig.staticMatch || []).map((pattern) =>
      LegacyAdapters.convertCallbackToPromise(
        glob,
        path.join(globEscape(this.buildConfig.rootPath), pattern)
      ).then((matchPaths: string[]) => {
        for (const matchPath of matchPaths) {
          const fileContents: string = FileSystem.readFile(matchPath);
          const relativePath: string = path.relative(srcPath, matchPath);
          for (const resolvedLibFolder of resolvedLibFolders) {
            const destPath: string = path.join(resolvedLibFolder, relativePath);
            FileSystem.writeFile(destPath, fileContents, { ensureFolderExists: true });
          }
        }
      })
    );

    const typescriptCompiler: TTypescriptCompiler = new this._rushStackCompiler.TypescriptCompiler(
      {
        customArgs: this.taskConfig.customArgs,
        fileError: this.fileError.bind(this),
        fileWarning: this.fileWarning.bind(this)
      },
      this.buildFolder,
      this._terminalProvider
    );
    const basePromise: Promise<void> | undefined = typescriptCompiler.invoke();

    if (basePromise) {
      promises.push(basePromise);
    }

    let buildPromise: Promise<void> = Promise.all(promises).then(() => {
      /* collapse void[] to void */
    });

    if (this.taskConfig.removeCommentsFromJavaScript === true) {
      buildPromise = buildPromise.then(() => this._removeComments(this._rushStackCompiler.Typescript));
    }

    return buildPromise;
  }

  protected _onData(data: Buffer): void {
    // Log lines separately
    const dataLines: (string | undefined)[] = data.toString().split('\n');
    for (const dataLine of dataLines) {
      const trimmedLine: string = (dataLine || '').trim();
      if (trimmedLine) {
        if (trimmedLine.match(/\serror\s/i)) {
          // If the line looks like an error, log it as an error
          this.logError(trimmedLine);
        } else {
          this.log(trimmedLine);
        }
      }
    }
  }

  private _removeComments(typescript: typeof TTypescript): Promise<void> {
    const configFilePath: string | undefined = typescript.findConfigFile(
      this.buildConfig.rootPath,
      FileSystem.exists
    );
    if (!configFilePath) {
      return Promise.reject(new Error('Unable to resolve tsconfig file to determine outDir.'));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tsConfig: any = typescript.parseJsonConfigFileContent(
      JsonFile.load(configFilePath),
      new TsParseConfigHost(),
      path.dirname(configFilePath)
    );
    if (!tsConfig || !tsConfig.options.outDir) {
      return Promise.reject('Unable to determine outDir from TypesScript configuration.');
    }

    return LegacyAdapters.convertCallbackToPromise(
      glob,
      path.join(globEscape(tsConfig.options.outDir), '**', '*.js')
    ).then((matches: string[]) => {
      for (const match of matches) {
        const sourceText: string = FileSystem.readFile(match);
        const decommentedText: string = decomment(sourceText, {
          // This option preserves comments that start with /*!, /**! or //! - typically copyright comments
          safe: true
        });
        FileSystem.writeFile(match, decommentedText);
      }
    });
  }
}
