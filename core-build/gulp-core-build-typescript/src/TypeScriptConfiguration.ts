// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import assign = require('object-assign');
import { JsonFile } from '@microsoft/node-core-library';
import { IBuildConfig } from '@microsoft/gulp-core-build';
import ts = require('gulp-typescript');

/**
 * @public
 */
export interface ITsConfigFile<T> {
  compilerOptions: T;
}

export interface IFixupSettingsOptions {
  mustBeCommonJsOrEsnext: boolean;
}

/**
 * A helper class which provides access to the TSConfig.json file for a particular project.
 * It also is a central place for managing the version of typescript which this project
 * should be built with.
 * @public
 */
export class TypeScriptConfiguration {
  private static _baseTsConfig: ITsConfigFile<ts.Settings>;
  private static _projectTsConfig: ITsConfigFile<ts.Settings>;
  private static _typescript: any = undefined; // tslint:disable-line:no-any

  /**
   * Gets `gulp-typescript` version of the config (used by TypeScriptTask)
   * Returns a new object each time.
   */
  public static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings> {
    const file: ITsConfigFile<ts.Settings> = assign({}, this.getTsConfigFile(buildConfig));
    assign(file.compilerOptions, {
      rootDir: buildConfig.rootPath,
      typescript: this.getTypescriptCompiler()
    });
    return file;
  }

  /**
   * Override the version of the typescript compiler
   */
  public static setTypescriptCompiler(typescriptOverride: any): void { // tslint:disable-line:no-any
    if (this._typescript) {
      throw new Error('The version of the typescript compiler should only be set once.');
    }

    if (this._baseTsConfig) {
      throw new Error('Set the version of the typescript compiler before tasks call getConfig()');
    }

    this._typescript = typescriptOverride;
  }

  /**
   * Get the version of the typescript compiler which is to be used
   */
  public static getTypescriptCompiler(): any { // tslint:disable-line:no-any
    if (!this._typescript) {
      this._typescript = require('typescript');
    }

    return this._typescript;
  }

  /**
   * Helper function which reads the tsconfig.json (or provides one), and memoizes it
   */
  public static getTsConfigFile(config: IBuildConfig): ITsConfigFile<ts.Settings> {
    if (!this._projectTsConfig) {
      try {
        this._projectTsConfig = JsonFile.load(this._getConfigPath(config));
      } catch (e) {
        /* Failed to load project TS Config - use the base config */
      }
    }

    const baseConfig: ITsConfigFile<ts.Settings> =
      this._baseTsConfig ||
      {
        compilerOptions: {
          declaration: true,
          experimentalDecorators: true,
          forceConsistentCasingInFileNames: true,
          jsx: 'react',
          module: 'commonjs',
          moduleResolution: 'node',
          noUnusedLocals: true,
          sourceMap: true,
          strictNullChecks: true,
          target: 'es5'
        }
      };

    return assign({}, baseConfig, this._projectTsConfig || {});
  }

  public static fixupSettings(
    compilerOptions: ts.Settings,
    logWarning: (msg: string) => void,
    options: Partial<IFixupSettingsOptions> = {}
  ): void {
    if (compilerOptions.module !== 'commonjs' && compilerOptions.module !== 'esnext' && compilerOptions.module) {
      let warningMessage: string =
        'Your tsconfig.json file specifies a different "module" than expected. ' +
        `Expected: "commonjs" or "esnext". Actual: "${compilerOptions.module}".`

      if (options.mustBeCommonJsOrEsnext) {
        warningMessage += ' Using "commonjs" instead.';
        compilerOptions.module = 'commonjs';
      }

      logWarning(warningMessage);
    } else if (!compilerOptions.module) {
      logWarning(`Your tsconfig.json file does not specify a "module". Using "commonjs" instead.`);
      compilerOptions.module = 'commonjs';
    }
  }

  /**
   * Set the base config for the project. Useful when a rig wants to set common config settings.
   */
  public static setBaseConfig(config: ITsConfigFile<ts.Settings>): void {
    this._baseTsConfig = config;
  }

  /**
   * Extracts the path to the tsconfig.json based on the buildConfiguration
   */
  private static _getConfigPath(buildConfig: IBuildConfig): string {
    return path.join(buildConfig.rootPath, 'tsconfig.json');
  }
}