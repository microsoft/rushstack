// @beta
class ApiExtractorRunner extends RushStackCompilerBase<IApiExtractorTaskConfig> {
  constructor(taskOptions: IApiExtractorTaskConfig, rootPath: string, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
}

// @public (undocumented)
interface IApiExtractorTaskConfig {
  apiJsonFolder?: string;
  apiReviewFolder?: string;
  // @beta
  dtsRollupTrimming: boolean;
  entry?: string;
  // @beta
  generateDtsRollup?: boolean;
  localBuild?: boolean;
  // @beta
  publishFolderForBeta?: string;
  // @beta
  publishFolderForInternal?: string;
  // @beta
  publishFolderForPublic?: string;
  skipLibCheck?: boolean;
}

// @public (undocumented)
interface ITslintRunnerConfig extends IRushStackCompilerBaseOptions {
  displayAsError?: boolean;
  // (undocumented)
  fileError: WriteFileIssueFunction;
  // (undocumented)
  fileWarning: WriteFileIssueFunction;
}

// @beta (undocumented)
class RushStackCompilerBase<TOptions> {
  constructor(taskOptions: TOptions, rootPath: string, terminalProvider: ITerminalProvider);
  // WARNING: The type "StandardBuildFolders" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  protected _standardBuildFolders: StandardBuildFolders;
  // (undocumented)
  protected _taskOptions: TOptions;
  // (undocumented)
  protected _terminal: Terminal;
}

// @beta (undocumented)
class TslintRunner extends RushStackCompilerBase<ITslintRunnerConfig> {
  constructor(taskOptions: ITslintRunnerConfig, rootPath: string, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
}

// WARNING: The type "IRushStackCompilerBaseOptions" needs to be exported by the package (e.g. added to index.ts)
// @beta (undocumented)
class TypescriptCompiler extends RushStackCompilerBase<IRushStackCompilerBaseOptions> {
  // WARNING: The type "IRushStackCompilerBaseOptions" needs to be exported by the package (e.g. added to index.ts)
  constructor(taskOptions: IRushStackCompilerBaseOptions, rootPath: string, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
  // (undocumented)
  typescript: typeof typescript;
}

// WARNING: Unsupported export: WriteFileIssueFunction
// (No @packagedocumentation comment for this package)
