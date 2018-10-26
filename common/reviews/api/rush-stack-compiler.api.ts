// @beta
class ApiExtractorTask extends RushStackCompilerTask<IApiExtractorTaskConfig> {
  constructor(taskOptions: IApiExtractorTaskConfig, constants: Constants, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
}

// @beta
class CmdRunner<TTaskConfig extends IBaseCmdTaskOptions> {
  constructor(constants: Constants, terminal: Terminal, options: IBaseTaskOptions<TTaskConfig>);
  // (undocumented)
  protected _getArgs(): string[];
  // (undocumented)
  protected _onClose(code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void): void;
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  protected _onError(data: Buffer): void;
  // (undocumented)
  runCmd(options: IRunCmdOptions): Promise<void>;
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
}

// @beta (undocumented)
interface IBaseCmdTaskOptions {
  customArgs?: string[];
}

// @beta
interface IBaseTaskOptions<TTaskConfig> {
  packageBinPath: string;
  // (undocumented)
  packageJson: IPackageJson;
  packagePath: string;
  taskOptions: TTaskConfig;
}

// @beta (undocumented)
interface IRunCmdOptions {
  // (undocumented)
  args: string[];
  // (undocumented)
  onClose?: (code: number, hasErrors: boolean, resolve: () => void, reject: (error: Error) => void) => void;
  // (undocumented)
  onData?: (data: Buffer) => void;
  // (undocumented)
  onError?: (data: Buffer) => void;
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
class TscCmdTask extends RushStackCompilerTask<IBaseCmdTaskOptions> {
  constructor(taskOptions: IBaseCmdTaskOptions, constants: Constants, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
}

// @beta (undocumented)
class TslintCmdTask extends RushStackCompilerTask<ITslintCmdTaskConfig> {
  constructor(taskOptions: ITslintCmdTaskConfig, constants: Constants, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
}

// WARNING: Unsupported export: WriteFileIssueFunction
// (No @packagedocumentation comment for this package)
