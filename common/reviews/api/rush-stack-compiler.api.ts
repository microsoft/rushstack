// @beta
class ApiExtractorTask {
  constructor(options: IApiExtractorTaskConfig, constants: Constants, terminal: Terminal);
  // (undocumented)
  invoke(): Promise<void>;
}

// @beta
class BaseCmdTask<TTaskConfig extends IBaseCmdTaskOptions> {
  constructor(constants: Constants, terminal: Terminal, options: IBaseTaskOptions<TTaskConfig>);
  // (undocumented)
  protected _constants: Constants;
  // (undocumented)
  protected _getArgs(): string[];
  // (undocumented)
  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void;
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  protected _onError(data: Buffer): void;
  // (undocumented)
  protected _options: IBaseTaskOptions<TTaskConfig>;
  // (undocumented)
  protected _terminal: Terminal;
  // (undocumented)
  static getPackagePath(packageName: string): string | undefined;
  // (undocumented)
  protected invokeCmd(): Promise<void>;
}

// @beta (undocumented)
class Constants {
  constructor(projectFolderPath: string);
  // (undocumented)
  readonly distFolderPath: string;
  // (undocumented)
  readonly libFolderPath: string;
  // (undocumented)
  readonly projectFolderPath: string;
  // (undocumented)
  readonly srcFolderPath: string;
  // (undocumented)
  readonly tempFolderPath: string;
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
  // @beta
  typescriptCompilerFolder?: string;
}

// @beta (undocumented)
interface IBaseCmdTaskOptions {
  customArgs?: string[];
}

// @beta
interface IBaseTaskOptions<TTaskConfig> {
  packageBinPath: string;
  packageName: string;
  taskOptions: TTaskConfig;
}

// @public (undocumented)
interface ITslintCmdTaskConfig extends IBaseCmdTaskOptions {
  displayAsError?: boolean;
  // (undocumented)
  fileError: WriteFileIssueFunction;
  // (undocumented)
  fileWarning: WriteFileIssueFunction;
}

// @beta (undocumented)
class TscCmdTask extends BaseCmdTask<IBaseCmdTaskOptions> {
  constructor(taskOptions: IBaseCmdTaskOptions, constants: Constants, terminal: Terminal);
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  invoke(): Promise<void>;
  // (undocumented)
  loadSchema(): Object;
}

// @beta (undocumented)
class TslintCmdTask extends BaseCmdTask<ITslintCmdTaskConfig> {
  constructor(taskOptions: ITslintCmdTaskConfig, constants: Constants, terminal: Terminal);
  // (undocumented)
  protected _getArgs(): string[];
  // (undocumented)
  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void;
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  invoke(): Promise<void>;
  // (undocumented)
  loadSchema(): Object;
}

// WARNING: Unsupported export: WriteFileIssueFunction
// (No @packagedocumentation comment for this package)
