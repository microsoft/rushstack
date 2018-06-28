// @public
class ApiExtractorTask extends ApiExtractorBaseTask {
  // (undocumented)
  protected updateExtractorConfig(extractorConfig: IExtractorConfig): void;
  // (undocumented)
  protected updateExtractorOptions(extractorOptions: IExtractorOptions, entryPointFile: string): void;
}

// @public (undocumented)
interface IFixupSettingsOptions {
  // (undocumented)
  mustBeCommonJsOrEsnext: boolean;
}

// @public (undocumented)
interface ITscCmdTaskConfig {
  buildDirectory?: string;
  customArgs?: string[];
  staticMatch?: string[];
  typescriptCompilerPackagePath?: string;
}

// @public (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

// @public (undocumented)
interface ITslintCmdTaskConfig {
  buildDirectory?: string;
  customArgs?: string[];
  displayAsError?: boolean;
  tslintPackagePath?: string;
}

// @alpha (undocumented)
class TscCmdTask extends BaseCmdTask<ITscCmdTaskConfig> {
  constructor();
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): Promise<void> | undefined;
  // (undocumented)
  loadSchema(): Object;
}

// @alpha (undocumented)
class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor();
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): Promise<void> | undefined;
  // (undocumented)
  loadSchema(): Object;
}

// @public
class TypeScriptConfiguration {
  static fixupSettings(compilerOptions: ts.Settings, logWarning: (msg: string) => void, options?: Partial<IFixupSettingsOptions>): void;
  static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  static getTsConfigFile(config: IBuildConfig): ITsConfigFile<ts.Settings>;
  static getTypescriptCompiler(): any;
  static setBaseConfig(config: ITsConfigFile<ts.Settings>): void;
  static setTypescriptCompiler(typescriptOverride: any): void;
}

// WARNING: The type "ITypeScriptTaskConfig" needs to be exported by the package (e.g. added to index.ts)
// @public (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  constructor();
  // (undocumented)
  executeTask(gulp: gulpType.Gulp, completeCallback: (error?: string) => void): void;
  // WARNING: The type "ITypeScriptTaskConfig" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: ITypeScriptTaskConfig): string[];
  // (undocumented)
  loadSchema(): Object;
  // WARNING: The type "ITypeScriptTaskConfig" needs to be exported by the package (e.g. added to index.ts)
  mergeConfig(config: ITypeScriptTaskConfig): void;
}

// WARNING: Unsupported export: apiExtractor
// WARNING: Unsupported export: typescript
// WARNING: Unsupported export: tslint
// WARNING: Unsupported export: text
// WARNING: Unsupported export: removeTripleSlash
// WARNING: Unsupported export: tscCmd
// WARNING: Unsupported export: tslintCmd
// WARNING: Unsupported export: apiExtractorStandalone
// WARNING: Unsupported export: default
// (No @packagedocumentation comment for this package)
