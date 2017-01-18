import * as path from 'path';
import assign = require('object-assign');
import { SchemaValidator, IBuildConfig } from '@microsoft/gulp-core-build';
import ts = require('gulp-typescript');

/* tslint:disable:no-any */
export class TsConfigProvider {
  private static _tsconfig: { compilerOptions: ts.Settings };
  private static _typescript: any = require('typescript');

  public static getConfig(buildConfig: IBuildConfig): { compilerOptions: ts.Settings } {
    if (!this._tsconfig) {
      try {
        this._tsconfig = SchemaValidator.readCommentedJsonFile<any>(
          this._getConfigPath(buildConfig)
        );
      } catch (e) {
        /* no-op */
      }

      if (!this._tsconfig) {
        this._tsconfig = {
          compilerOptions: {
            declaration: true,
            experimentalDecorators: true,
            jsx: 'react',
            moduleResolution: 'node',
            sourceMap: true,
            target: 'es5',
            noUnusedParameters: true,
            noUnusedLocals: true
          }
        };
      }
      assign(this._tsconfig.compilerOptions, {
        rootDir: buildConfig.rootPath,
        module: 'commonjs',
        typescript: this.getTypescriptCompiler()
      });
    }

    return this._tsconfig;
  }

  /**
   * Override the version of the typescript compiler used
   */
  public static setTypescriptCompiler(typescript: any): void {
    if (this._typescript) {
      throw new Error('The version of the typescript compiler should only be set once.');
    }
    if (this._tsconfig) {
      throw new Error('Set the version of the typescript compiler before tasks call getConfig()');
    }
    this._typescript = typescript;
  }

  public static getTypescriptCompiler(): any {
    if (!this._typescript) {
      return require('typescript');
    }
    return this._typescript;
  }

  private static _getConfigPath(buildConfig: IBuildConfig): string {
    return path.resolve(path.join(buildConfig.rootPath, 'tsconfig.json'));
  }
}