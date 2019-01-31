// @internal
export function _isJestEnabled(rootFolder: string): boolean;

// @public
export function addSuppression(suppression: string | RegExp): void;

// @public
class CleanFlagTask extends CleanTask {
  constructor();
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): void;
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
}

// @public
class CleanTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): void;
}

// @public
class CopyStaticAssetsTask extends GulpTask<ICopyStaticAssetsTaskConfig> {
  constructor();
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream;
  // (undocumented)
  loadSchema(): Object;
}

// @public
class CopyTask extends GulpTask<ICopyConfig> {
  constructor();
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  loadSchema(): Object;
}

// @public
export function coverageData(coverage: number, threshold: number, filePath: string): void;

// @public
export function error(...args: Array<string>): void;

// @public
export function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export function functionalTestRun(name: string, result: TestResultState, duration: number): void;

// @public
class GenerateShrinkwrapTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulpType.Gulp, completeCallback: (error?: string | Error) => void): NodeJS.ReadWriteStream | void;
}

// @public
export function getConfig(): IBuildConfig;

// @public
export function getErrors(): string[];

// @public
export function getWarnings(): string[];

// @public
class GulpTask<TTaskConfig> implements IExecutable {
  constructor(name: string, initialTaskConfig?: Partial<TTaskConfig>);
  protected _getConfigFilePath(): string;
  buildConfig: IBuildConfig;
  cleanMatch: string[];
  copyFile(localSourcePath: string, localDestPath?: string): void;
  enabled: boolean;
  execute(config: IBuildConfig): Promise<void>;
  abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (error?: string | Error) => void): Promise<Object | void> | NodeJS.ReadWriteStream | void;
  fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  fileExists(localPath: string): boolean;
  fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: TTaskConfig): string[];
  isEnabled(buildConfig: IBuildConfig): boolean;
  protected loadSchema(): Object | undefined;
  log(message: string): void;
  logError(message: string): void;
  logVerbose(message: string): void;
  logWarning(message: string): void;
  mergeConfig(taskConfig: Partial<TTaskConfig>): void;
  name: string;
  onRegister(): void;
  readJSONSync(localPath: string): Object | undefined;
  replaceConfig(taskConfig: TTaskConfig): void;
  resolvePath(localPath: string): string;
  readonly schema: Object | undefined;
  setConfig(taskConfig: Partial<TTaskConfig>): void;
  taskConfig: TTaskConfig;
}

// @public (undocumented)
interface IBuildConfig {
  args: {
    [name: string]: string | boolean;
  }
  buildErrorIconPath?: string;
  buildSuccessIconPath?: string;
  distFolder: string;
  gulp: GulpProxy | gulp.Gulp;
  isRedundantBuild?: boolean;
  jestEnabled?: boolean;
  libAMDFolder?: string;
  libES6Folder?: string;
  libESNextFolder?: string;
  libFolder: string;
  onTaskEnd?: (taskName: string, duration: number[], error?: any) => void;
  onTaskStart?: (taskName: string) => void;
  packageFolder: string;
  production: boolean;
  properties?: {
    [key: string]: any;
  }
  relogIssues?: boolean;
  rootPath: string;
  shouldWarningsFailBuild: boolean;
  showToast?: boolean;
  srcFolder: string;
  tempFolder: string;
  uniqueTasks?: IExecutable[];
  verbose: boolean;
}

// @public
interface ICopyConfig {
  copyTo: {
    [destPath: string]: string[];
  }
  shouldFlatten?: boolean;
}

// @public
interface ICopyStaticAssetsTaskConfig {
  // (undocumented)
  excludeExtensions?: string[];
  // (undocumented)
  excludeFiles?: string[];
  // (undocumented)
  includeExtensions?: string[];
  // (undocumented)
  includeFiles?: string[];
}

// @public
interface ICustomGulpTask {
  // (undocumented)
  (gulp: typeof Gulp | GulpProxy, buildConfig: IBuildConfig, done?: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

// @public (undocumented)
interface IExecutable {
  execute: (config: IBuildConfig) => Promise<void>;
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
  isEnabled?: (buildConfig: IBuildConfig) => boolean;
  name?: string;
  onRegister?: () => void;
}

// @alpha
interface IJestConfig {
  cache?: boolean;
  collectCoverageFrom?: string[];
  coverage?: boolean;
  coverageReporters?: string[];
  isEnabled?: boolean;
  maxWorkers?: number;
  moduleDirectories?: string[];
  modulePathIgnorePatterns?: string[];
  testMatch?: string[];
  testPathIgnorePatterns?: string[];
}

// @public
export function initialize(gulp: typeof Gulp): void;

// @public (undocumented)
interface ITscCmdTaskConfig extends IRSCTaskConfig {
  customArgs?: string[];
  removeCommentsFromJavaScript?: boolean;
  staticMatch?: string[];
}

// @public (undocumented)
interface ITslintCmdTaskConfig extends IRSCTaskConfig {
  displayAsError?: boolean;
}

// @public (undocumented)
interface IWebpackResources {
  // (undocumented)
  webpack: typeof Webpack;
}

// @public (undocumented)
interface IWebpackTaskConfig {
  config?: Webpack.Configuration;
  configPath: string;
  printStats?: boolean;
  suppressWarnings?: (string | RegExp)[];
  webpack?: typeof Webpack;
}

// @alpha
class JestTask extends GulpTask<IJestConfig> {
  constructor();
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): void;
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
  loadSchema(): Object;
}

// @public
export function log(...args: Array<string>): void;

// @public
export function logSummary(value: string): void;

// @public
export function mergeConfig(config: Partial<IBuildConfig>): void;

// @public
export function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
export function replaceConfig(config: IBuildConfig): void;

// @public
export function reset(): void;

// @public
export function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
export function setConfig(config: Partial<IBuildConfig>): void;

// @public
export function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

// @public
export function task(taskName: string, taskExecutable: IExecutable): IExecutable;

// @public
enum TestResultState {
  // (undocumented)
  Failed = 1,
  // (undocumented)
  FlakyFailed = 2,
  // (undocumented)
  Passed = 0,
  // (undocumented)
  Skipped = 3
}

// @beta (undocumented)
class TscCmdTask extends RSCTask<ITscCmdTaskConfig> {
  constructor();
  // (undocumented)
  protected _onData(data: Buffer): void;
  // (undocumented)
  executeTask(): Promise<void>;
  // (undocumented)
  loadSchema(): Object;
}

// @beta (undocumented)
class TslintCmdTask extends RSCTask<ITslintCmdTaskConfig> {
  constructor();
  // (undocumented)
  executeTask(): Promise<void>;
  // (undocumented)
  loadSchema(): Object;
}

// @public
class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulpType.Gulp, completeCallback: (error: string) => void): NodeJS.ReadWriteStream | void;
}

// @public
export function verbose(...args: Array<string>): void;

// @public
export function warn(...args: Array<string>): void;

// @public
export function watch(watchMatch: string | string[], taskExecutable: IExecutable): IExecutable;

// @public (undocumented)
class WebpackTask<TExtendedConfig = {}> extends GulpTask<IWebpackTaskConfig & TExtendedConfig> {
  constructor(extendedName?: string, extendedConfig?: TExtendedConfig);
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): void;
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  readonly resources: IWebpackResources;
}

// WARNING: Unsupported export: preCopy
// WARNING: Unsupported export: postCopy
// WARNING: Unsupported export: buildTasks
// WARNING: Unsupported export: bundleTasks
// WARNING: Unsupported export: testTasks
// WARNING: Unsupported export: defaultTasks
// WARNING: Unsupported export: postProcessSourceMapsTask
// WARNING: Unsupported export: validateShrinkwrapTask
// WARNING: Unsupported export: generateShrinkwrapTask
// WARNING: Unsupported export: cleanFlag
// WARNING: Unsupported export: clean
// WARNING: Unsupported export: copyStaticAssets
// WARNING: Unsupported export: jest
// WARNING: Unsupported export: tscCmd
// WARNING: Unsupported export: tslintCmd
// WARNING: Unsupported export: apiExtractor
// WARNING: Unsupported export: sass
// WARNING: Unsupported export: webpack
// WARNING: Unsupported export: serve
// WARNING: Unsupported export: reload
// WARNING: Unsupported export: trustDevCert
// WARNING: Unsupported export: untrustDevCert
// (No @packagedocumentation comment for this package)
