// @beta
class ApiExtractorRunner extends RushStackCompilerBase<IApiExtractorTaskConfig> {
  constructor(taskOptions: IApiExtractorTaskConfig, constants: Constants, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
}

// @beta
class CmdRunner<TTaskConfig extends IRushStackCompilerBaseOptions> {
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

// @beta (undocumented)
interface IRushStackCompilerBaseOptions {
  customArgs?: string[];
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
class TslintRunner extends RushStackCompilerBase<ITslintRunnerConfig> {
  constructor(taskOptions: ITslintRunnerConfig, constants: Constants, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
}

// @beta (undocumented)
class TypescriptCompiler extends RushStackCompilerBase<IRushStackCompilerBaseOptions> {
  constructor(taskOptions: IRushStackCompilerBaseOptions, constants: Constants, terminalProvider: ITerminalProvider);
  // (undocumented)
  invoke(): Promise<void>;
  // (undocumented)
  typescript: typeof typescript;
}

// WARNING: Unsupported export: WriteFileIssueFunction
// (No @packagedocumentation comment for this package)
