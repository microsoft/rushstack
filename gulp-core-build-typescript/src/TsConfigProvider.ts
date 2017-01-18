import * as path from 'path';
import assign = require('object-assign');
import { SchemaValidator, IBuildConfig } from '@microsoft/gulp-core-build';
import ts = require('gulp-typescript');
import * as typescript from 'typescript';

export interface ITsConfigFile<T> {
  compilerOptions: T;
}

/* tslint:disable:no-any */
export class TsConfigProvider {
  private static _baseTsConfig: ITsConfigFile<ts.Settings>;
  private static _typescript: any = require('typescript');

  /**
   * Gets the tsconfig file, used by TypeScriptTask
   */
  public static getConfig(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings> {
    const file: ITsConfigFile<ts.Settings> = assign({}, this._getTsConfigFile(buildConfig));
    assign(file.compilerOptions, {
      rootDir: buildConfig.rootPath,
      module: 'commonjs',
      typescript: this.getTypescriptCompiler()
    });
    return file;
  }

  /*
   * Gets the typescript compiler options, used by ApiExtractorTask
   * These differ slightly from the values in the tsconfig, so this function exists
   * to translate the types of configs
   */
  public static getTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<typescript.CompilerOptions> {
    const oldConfig: ITsConfigFile<ts.Settings> = this.getConfig(buildConfig);
    const newConfig: ITsConfigFile<typescript.CompilerOptions> = oldConfig as any;

    delete oldConfig.compilerOptions.typescript;
    console.log(JSON.stringify(newConfig, undefined, 2));

    newConfig.compilerOptions.moduleResolution =
      oldConfig.compilerOptions.moduleResolution === 'node' ?
        typescript.ModuleResolutionKind.NodeJs : typescript.ModuleResolutionKind.Classic;

    return newConfig;
  }

  /**
   * Override the version of the typescript compiler used
   */
  public static setTypescriptCompiler(typescript: any): void {
    if (this._typescript) {
      throw new Error('The version of the typescript compiler should only be set once.');
    }
    if (this._baseTsConfig) {
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

  private static _getTsConfigFile(config: IBuildConfig): ITsConfigFile<ts.Settings> {
    if (!this._baseTsConfig) {
      try {
        this._baseTsConfig = SchemaValidator.readCommentedJsonFile<any>(
          this._getConfigPath(config)
        );
      } catch (e) {
        /* no-op */
      }

      if (!this._baseTsConfig) {
        this._baseTsConfig = {
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
    }
    return this._baseTsConfig;
  }

  private static _getConfigPath(buildConfig: IBuildConfig): string {
    return path.resolve(path.join(buildConfig.rootPath, 'tsconfig.json'));
  }
}