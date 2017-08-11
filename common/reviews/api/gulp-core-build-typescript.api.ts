// WARNING: The type "IApiExtractorTaskConfig" needs to be exported by the package (e.g. added to index.ts)
// @public
class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfig> {
  constructor();
  // (undocumented)
  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream | void;
  // (undocumented)
  public loadSchema(): Object;
}

// @public (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

// @public
class TypeScriptConfiguration {
  public static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  public static getTsConfigFile(config: IBuildConfig): ITsConfigFile<ts.Settings>;
  public static getTypescriptCompiler(): any;
  public static setTypescriptCompiler(typescriptOverride: any): void;
}

// WARNING: The type "ITypeScriptTaskConfig" needs to be exported by the package (e.g. added to index.ts)
// @public (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  constructor();
  // (undocumented)
  public executeTask(gulp: gulpType.Gulp, completeCallback: (error?: string) => void): void;
  // WARNING: The type "ITypeScriptTaskConfig" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: ITypeScriptTaskConfig = this.taskConfig): string[];
  // (undocumented)
  public loadSchema(): Object;
  // WARNING: The type "ITypeScriptTaskConfig" needs to be exported by the package (e.g. added to index.ts)
  public mergeConfig(config: ITypeScriptTaskConfig): void;
}

// WARNING: Unsupported export: apiExtractor
// WARNING: Unsupported export: typescript
// WARNING: Unsupported export: tslint
// WARNING: Unsupported export: text
// WARNING: Unsupported export: removeTripleSlash
// WARNING: Unsupported export: default
// (No packageDescription for this package)
