import * as path from 'path';
import assign = require('object-assign');
import { SchemaValidator, IBuildConfig } from '@microsoft/gulp-core-build';
import ts = require('gulp-typescript');
import * as typescript from 'typescript';

export interface ITsConfigFile<T> {
  compilerOptions: T;
}

/* tslint:disable:no-any */
/*
 * A helper class which provides access to the TSConfig.json file for a particular project.
 * It also is a central place for managing the version of typescript which this project
 * should be built with.
 */
export class TypeScriptConfiguration {
  private static _baseTsConfig: ITsConfigFile<ts.Settings>;
  private static _typescript: any = require('typescript');

  /**
   * Gets `gulp-typescript` version of the config (used by TypeScriptTask)
   * Returns a new object each time.
   */
  public static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings> {
    const file: ITsConfigFile<ts.Settings> = assign({}, this._getTsConfigFile(buildConfig));
    assign(file.compilerOptions, {
      rootDir: buildConfig.rootPath,
      typescript: this.getTypescriptCompiler()
    });
    return file;
  }

  /*
   * Gets the `typescript` version of the config (used by ApiExtractorTask)
   * Note: these differ slightly from the values in the tsconfig.json
   * Returns a new object each time.
   *
   * Specifically, the issue in the difference between:
   *    typescript.CompilerOptions
   *               &
   *          ts.Settings
   *
   * Insofar as `ts.Settings` accepts (and requires) enums for certain options, rather than strings.
   * The clearest example is `moduleResolution` below.
   */
  public static getTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<typescript.CompilerOptions> {
    const oldConfig: ITsConfigFile<ts.Settings> = this.getGulpTypescriptOptions(buildConfig);
    const newConfig: ITsConfigFile<typescript.CompilerOptions> = oldConfig as any;

    delete newConfig.compilerOptions.moduleResolution;

    if (typeof oldConfig.compilerOptions.target === 'string') {
      const target: string =
        (oldConfig.compilerOptions.target as string).toUpperCase();
      newConfig.compilerOptions.target = typescript.ScriptTarget[target];
    }

    const moduleKind: { [module: string]: typescript.ModuleKind } = {
      'commonjs': typescript.ModuleKind.CommonJS,
      'amd': typescript.ModuleKind.AMD,
      'es2015': typescript.ModuleKind.ES2015,
      'none': typescript.ModuleKind.None,
      'system': typescript.ModuleKind.System,
      'umd': typescript.ModuleKind.UMD
    };

    if (typeof oldConfig.compilerOptions.module === 'string') {
      const module: string = oldConfig.compilerOptions.module as string;
      newConfig.compilerOptions.module = moduleKind[(module || 'commonjs').toLowerCase()];
    }

    return newConfig;
  }

  /**
   * Override the version of the typescript compiler
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

  /**
   * Get the version of the typescript compiler which is to be used
   */
  public static getTypescriptCompiler(): any {
    if (!this._typescript) {
      return require('typescript');
    }
    return this._typescript;
  }

  /**
   * Helper function which reads the tsconfig.json (or provides one), and memoizes it
   */
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

  /**
   * Extracts the path to the tsconfig.json based on the buildConfiguration
   */
  private static _getConfigPath(buildConfig: IBuildConfig): string {
    return path.resolve(path.join(buildConfig.rootPath, 'tsconfig.json'));
  }
}