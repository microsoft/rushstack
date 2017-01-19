// (undocumented)
export declare function addSuppression(str: string): void;

// (undocumented)
class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfig> {
  // (undocumented)
  executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfig: IApiExtractorTaskConfig;
}

// (undocumented)
class CleanTask extends GulpTask<ICleanConfig> {
  // (undocumented)
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfig: ICleanConfig;
}

// (undocumented)
class CopyTask extends GulpTask<ICopyConfig> {
  // (undocumented)
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  taskConfig: ICopyConfig;
}

// (undocumented)
export declare function coverageData(coverage: number, threshold: number, filePath: string): void;

// (undocumented)
export declare function endTaskSrc(taskName: string, startHrtime: [number, number], fileCount: number): void;

// (undocumented)
export declare function error(...args: Array<string | Chalk.ChalkChain>): void;

// (undocumented)
export declare function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// (undocumented)
export declare function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// (undocumented)
export declare function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// (undocumented)
export declare function functionalTestRun(name: string, result: TestResultState, duration: number): void;

// (undocumented)
export declare function generateGulpError(error: Object): Object;

// (undocumented)
class GenerateShrinkwrapTask extends GulpTask<{}> {
  // (undocumented)
  executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
  // (undocumented)
  name: string;
}

// (undocumented)
export declare function getConfig(): IBuildConfig;

// (undocumented)
export declare function getErrors(): string[];

// (undocumented)
export declare function getStart(): [number, number];

// (undocumented)
export declare function getWarnings(): string[];

// (undocumented)
export declare function getWatchMode(): boolean;

// (undocumented)
class GulpTask<TASK_CONFIG> implements IExecutable {
  // (undocumented)
  protected _getConfigFilePath(): string;
  // (undocumented)
  protected _readCommentedJsonFile(filename: string): TASK_CONFIG;
  // (undocumented)
  buildConfig: IBuildConfig;
  // (undocumented)
  cleanMatch: string[];
  // (undocumented)
  copyFile(localSourcePath: string, localDestPath?: string): void;
  // (undocumented)
  execute(config: IBuildConfig): Promise<void>;
  // (undocumented)
  abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // (undocumented)
  fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  // (undocumented)
  fileExists(localPath: string): boolean;
  // (undocumented)
  fileWarning(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  // (undocumented)
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: TASK_CONFIG): string[];
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  log(message: string): void;
  // (undocumented)
  logError(message: string): void;
  // (undocumented)
  logVerbose(message: string): void;
  // (undocumented)
  logWarning(message: string): void;
  // (undocumented)
  mergeConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  name: string;
  // (undocumented)
  onRegister(): void;
  // (undocumented)
  readJSONSync(localPath: string): Object;
  // (undocumented)
  replaceConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  resolvePath(localPath: string): string;
  // (undocumented)
  schema: Object;
  // (undocumented)
  setConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  taskConfig: TASK_CONFIG;
}

// (undocumented)
interface IBuildConfig {
  // (undocumented)
  args?: {
    // (undocumented)
    [ name: string ]: string | boolean;
  }
  // (undocumented)
  buildErrorIconPath?: string;
  // (undocumented)
  buildSuccessIconPath?: string;
  // (undocumented)
  distFolder?: string;
  // (undocumented)
  gulp?: GulpProxy | gulp.Gulp;
  // (undocumented)
  isRedundantBuild?: boolean;
  // (undocumented)
  libAMDFolder?: string;
  // (undocumented)
  libFolder?: string;
  // (undocumented)
  onTaskEnd?: (taskName: string, duration: number[], error?: any) => void;
  // (undocumented)
  onTaskStart?: (taskName: string) => void;
  // (undocumented)
  packageFolder?: string;
  // (undocumented)
  production?: boolean;
  // (undocumented)
  properties?: {
    // (undocumented)
    [ key: string ]: any;
  }
  // (undocumented)
  relogIssues?: boolean;
  // (undocumented)
  rootPath?: string;
  // (undocumented)
  shouldWarningsFailBuild?: boolean;
  // (undocumented)
  showToast?: boolean;
  // (undocumented)
  srcFolder?: string;
  // (undocumented)
  tempFolder?: string;
  // (undocumented)
  uniqueTasks?: IExecutable[];
  // (undocumented)
  verbose?: boolean;
}

// (undocumented)
interface ICleanConfig {
}

// (undocumented)
interface ICopyConfig {
  // (undocumented)
  copyTo: {
    // (undocumented)
    [ destPath: string ]: string[];
  }
  // (undocumented)
  shouldFlatten?: boolean;
}

// (undocumented)
interface ICustomGulpTask {
  // (undocumented)
  (gulp: gulp.Gulp | GulpProxy, buildConfig: IBuildConfig, done: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

// (undocumented)
interface IExecutable {
  // (undocumented)
  execute: (config: IBuildConfig) => Promise<void>;
  // (undocumented)
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
  // (undocumented)
  isEnabled?: (config?: IBuildConfig) => boolean;
  // (undocumented)
  name?: string;
  // (undocumented)
  onRegister?: () => void;
}

// (undocumented)
export declare function initialize(gulp: gulp.Gulp): void;

// (undocumented)
interface ISchemaValidatorResult {
  // (undocumented)
  details?: ZSchema.SchemaError[];
  // (undocumented)
  message?: string;
  // (undocumented)
  name?: string;
}

// (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

// (undocumented)
interface IWebpackTaskConfig {
  // (undocumented)
  config?: Webpack.Configuration;
  // (undocumented)
  configPath: string;
  // (undocumented)
  suppressWarnings?: (string | RegExp)[];
  // (undocumented)
  webpack?: typeof Webpack;
}

// (undocumented)
export declare function log(...args: Array<string | Chalk.ChalkChain>): void;

// (undocumented)
export declare function logEndSubtask(name: string, startTime: [number, number], errorObject?: Error): void;

// (undocumented)
export declare function logStartSubtask(name: string): void;

// (undocumented)
export declare function logSummary(value: string): void;

// (undocumented)
export declare function markTaskCreationTime(): void;

// (undocumented)
export declare function mergeConfig(config: IBuildConfig): void;

// (undocumented)
export declare function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// (undocumented)
export declare function replaceConfig(config: IBuildConfig): void;

// (undocumented)
export declare function reset(): void;

// (undocumented)
class SchemaValidator {
  // (undocumented)
  static getFormattedErrorMessage(error: ISchemaValidatorResult, dataFilePath?: string): string;
  // (undocumented)
  static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  static readCommentedJsonFile < TResult >(filename: string): TResult;
  // (undocumented)
  static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

// (undocumented)
export declare function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// (undocumented)
export declare function setConfig(config: IBuildConfig): void;

// (undocumented)
export declare function setExitCode(exitCode: number): void;

// (undocumented)
export declare function setWatchMode(): void;

// (undocumented)
export declare function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

// (undocumented)
export declare function task(taskName: string, task: IExecutable): IExecutable;

// (undocumented)
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

// (undocumented)
class TypeScriptConfiguration {
  // (undocumented)
  static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  // (undocumented)
  static getTypescriptCompiler(): any;
  // (undocumented)
  static getTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<typescript.CompilerOptions>;
  // (undocumented)
  static setTypescriptCompiler(typescript: any): void;
}

// (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  // (undocumented)
  executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void;
  // (undocumented)
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: ITypeScriptTaskConfig): string[];
  // (undocumented)
  mergeConfig(config: ITypeScriptTaskConfig): void;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfig: ITypeScriptTaskConfig;
}

// (undocumented)
class ValidateShrinkwrapTask extends GulpTask<{}> {
  // (undocumented)
  executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
  // (undocumented)
  name: string;
}

// (undocumented)
export declare function verbose(...args: Array<string | Chalk.ChalkChain>): void;

// (undocumented)
export declare function warn(...args: Array<string | Chalk.ChalkChain>): void;

// (undocumented)
export declare function watch(watchMatch: string | string[], task: IExecutable): IExecutable;

// (undocumented)
class WebpackTask extends GulpTask<IWebpackTaskConfig> {
  // (undocumented)
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void;
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
  // (undocumented)
  name: string;
  // (undocumented)
  resources: Object;
  // (undocumented)
  taskConfig: IWebpackTaskConfig;
}

// (undocumented)
export declare function writeError(e: any): void;

// WARNING: Unsupported export: preCopy
// WARNING: Unsupported export: postCopy
// WARNING: Unsupported export: compileTsTasks
// WARNING: Unsupported export: buildTasks
// WARNING: Unsupported export: bundleTasks
// WARNING: Unsupported export: testTasks
// WARNING: Unsupported export: defaultTasks
// WARNING: Unsupported export: postProcessSourceMapsTask
// WARNING: Unsupported export: validateShrinkwrapTask
// WARNING: Unsupported export: generateShrinkwrapTask
// WARNING: Unsupported export: clean
// WARNING: Unsupported export: apiExtractor
// WARNING: Unsupported export: typescript
// WARNING: Unsupported export: tslint
// WARNING: Unsupported export: text
// WARNING: Unsupported export: removeTripleSlash
// WARNING: Unsupported export: sass
// WARNING: Unsupported export: karma
// WARNING: Unsupported export: webpack
// WARNING: Unsupported export: serve
// WARNING: Unsupported export: reload
// WARNING: Unsupported export: trustDevCert
// WARNING: Unsupported export: untrustDevCert
