import * as path from 'path';
import assign = require('object-assign');
import { SchemaValidator, IBuildConfiguration } from '@microsoft/gulp-core-build';
import ts = require('gulp-typescript');
import * as typescript from 'typescript';

export interface ITsConfigurationFile<T> {
  compilerOptions: T;
}

/* tslint:disable:no-any */
/*
 * A helper class which provides access to the TSConfig.json file for a particular project.
 * It also is a central place for managing the version of typescript which this project
 * should be built with.
 */
export class TypeScriptConfiguration {
  private static _baseTsConfiguration: ITsConfigurationFile<ts.Settings>;
  private static _typescript: any = require('typescript');

  /**
   * Gets `gulp-typescript` version of the configuration (used by TypeScriptTask)
   * Returns a new object each time.
   */
  public static getGulpTypescriptOptions(buildConfiguration: IBuildConfiguration): ITsConfigurationFile<ts.Settings> {
    const file: ITsConfigurationFile<ts.Settings> = assign({}, this._getTsConfigurationFile(buildConfiguration));
    assign(file.compilerOptions, {
      rootDir: buildConfiguration.rootPath,
      typescript: this.getTypescriptCompiler()
    });
    return file;
  }

  /*
   * Gets the `typescript` version of the configuration (used by ApiExtractorTask)
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
  public static getTypescriptOptions(buildConfiguration: IBuildConfiguration):
      ITsConfigurationFile<typescript.CompilerOptions> {
    const oldConfiguration: ITsConfigurationFile<ts.Settings> = this.getGulpTypescriptOptions(buildConfiguration);
    const newConfiguration: ITsConfigurationFile<typescript.CompilerOptions> = oldConfiguration as any;

    delete newConfiguration.compilerOptions.moduleResolution;

    /**
     * Attempt to index into the enum to determine which target.
     */
    const scriptTarget: { [module: string]: typescript.ScriptTarget } = {
      'es2015': typescript.ScriptTarget.ES2015,
      'es2016': typescript.ScriptTarget.ES2016,
      'es2017': typescript.ScriptTarget.ES2017,
      'es3': typescript.ScriptTarget.ES3,
      'es5': typescript.ScriptTarget.ES5,
      'exnext': typescript.ScriptTarget.ESNext,
      'latest': typescript.ScriptTarget.Latest
    };
    if (typeof oldConfiguration.compilerOptions.target === 'string') {
      const target: string = oldConfiguration.compilerOptions.target.toLowerCase();
      newConfiguration.compilerOptions.target = scriptTarget[target];

      if (!newConfiguration.compilerOptions.target) {
        throw new Error(`Invalid setting found in tsconfig.json: target: '${target}' to be one of: `
         + Object.keys(scriptTarget).toString());
      }
    }

    /**
     * Map the string in the tsconfig.json file to an enum for the typescript API
     */
    const moduleKind: { [module: string]: typescript.ModuleKind } = {
      'commonjs': typescript.ModuleKind.CommonJS,
      'amd': typescript.ModuleKind.AMD,
      'es2015': typescript.ModuleKind.ES2015,
      'none': typescript.ModuleKind.None,
      'system': typescript.ModuleKind.System,
      'umd': typescript.ModuleKind.UMD
    };

    if (typeof oldConfiguration.compilerOptions.module === 'string') {
      const module: string = oldConfiguration.compilerOptions.module as string;
      newConfiguration.compilerOptions.module = moduleKind[module.toLowerCase()];

      if (!newConfiguration.compilerOptions.module) {
        throw new Error(`Invalid setting found in tsconfig.json: Expected module: '${module}' to be one of: `
          + Object.keys(moduleKind).toString());
      }
    }

    return newConfiguration;
  }

  /**
   * Override the version of the typescript compiler
   */
  public static setTypescriptCompiler(typescript: any): void {
    if (this._typescript) {
      throw new Error('The version of the typescript compiler should only be set once.');
    }
    if (this._baseTsConfiguration) {
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
  private static _getTsConfigurationFile(configuration: IBuildConfiguration): ITsConfigurationFile<ts.Settings> {
    if (!this._baseTsConfiguration) {
      try {
        this._baseTsConfiguration = SchemaValidator.readCommentedJsonFile<any>(
          this._getConfigurationPath(configuration)
        );
      } catch (e) {
        /* no-op */
      }

      if (!this._baseTsConfiguration) {
        this._baseTsConfiguration = {
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
    return this._baseTsConfiguration;
  }

  /**
   * Extracts the path to the tsconfig.json based on the buildConfiguration
   */
  private static _getConfigurationPath(buildConfiguration: IBuildConfiguration): string {
    return path.resolve(path.join(buildConfiguration.rootPath, 'tsconfig.json'));
  }
}