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
interface ITscCmdTaskConfig extends IBaseCmdTaskConfig {
  removeCommentsFromJavaScript?: boolean;
  staticMatch?: string[];
}

// @public (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

// @public (undocumented)
interface ITslintCmdTaskConfig extends IBaseCmdTaskConfig {
  customArgs?: string[];
  displayAsError?: boolean;
}

// @alpha (undocumented)
class TscCmdTask extends BaseCmdTask<ITscCmdTaskConfig> {
  constructor();
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  executeTask(gulp: Object, completeCallback: (error?: string) => void): Promise<void> | undefined;
  // (undocumented)
  loadSchema(): Object;
}

// @alpha (undocumented)
class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor();
  // (undocumented)
  protected _getArgs(): string[];
  // (undocumented)
  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void;
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  executeTask(gulp: Object, completeCallback: (error?: string) => void): Promise<void> | undefined;
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
