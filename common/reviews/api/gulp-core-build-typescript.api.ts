class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfig> {
  // (undocumented)
  public executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream;
  // (undocumented)
  public loadSchema(): Object;
  // (undocumented)
  public name: string;
  // (undocumented)
  public taskConfig: IApiExtractorTaskConfig;
}

// (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

// (undocumented)
class TypeScriptConfiguration {
  public static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  public static getTypescriptCompiler(): any;
  // (undocumented)
  public static getTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<typescript.CompilerOptions>;
  public static setTypescriptCompiler(typescript: any): void;
}

// (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  // (undocumented)
  public executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void;
  // (undocumented)
  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: ITypeScriptTaskConfig = this.taskConfig): string[];
  public mergeConfig(config: ITypeScriptTaskConfig): void;
  // (undocumented)
  public name: string;
  // (undocumented)
  public taskConfig: ITypeScriptTaskConfig;
}

// WARNING: Unsupported export: apiExtractor
// WARNING: Unsupported export: typescript
// WARNING: Unsupported export: tslint
// WARNING: Unsupported export: text
// WARNING: Unsupported export: removeTripleSlash
// WARNING: Unsupported export: default
