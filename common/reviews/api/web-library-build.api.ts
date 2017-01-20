// (undocumented)
export declare function addSuppression(str: string): void;

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

class GenerateShrinkwrapTask extends GulpTask<{}> {
  // (undocumented)
  executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
  // (undocumented)
  name: string;
}

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
  protected _getConfigFilePath(): string;
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
  loadSchema(): Object;
  // (undocumented)
  log(message: string): void;
  // (undocumented)
  logError(message: string): void;
  // (undocumented)
  logVerbose(message: string): void;
  // (undocumented)
  logWarning(message: string): void;
  mergeConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  name: string;
  // (undocumented)
  onRegister(): void;
  // (undocumented)
  readJSONSync(localPath: string): Object;
  replaceConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  resolvePath(localPath: string): string;
  schema: Object;
  setConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  taskConfig: TASK_CONFIG;
}

// (undocumented)
interface IBuildConfig {
  args?: {
    // (undocumented)
    [ name: string ]: string | boolean;
  }
  buildErrorIconPath?: string;
  buildSuccessIconPath?: string;
  distFolder?: string;
  gulp?: GulpProxy | gulp.Gulp;
  isRedundantBuild?: boolean;
  libAMDFolder?: string;
  libFolder?: string;
  onTaskEnd?: (taskName: string, duration: number[], error?: any) => void;
  onTaskStart?: (taskName: string) => void;
  packageFolder?: string;
  production?: boolean;
  properties?: {
    // (undocumented)
    [ key: string ]: any;
  }
  relogIssues?: boolean;
  rootPath?: string;
  shouldWarningsFailBuild?: boolean;
  showToast?: boolean;
  srcFolder?: string;
  tempFolder?: string;
  uniqueTasks?: IExecutable[];
  verbose?: boolean;
}

// (undocumented)
interface ICleanConfig {
}

// (undocumented)
interface ICopyConfig {
  copyTo: {
    // (undocumented)
    [ destPath: string ]: string[];
  }
  shouldFlatten?: boolean;
}

interface ICustomGulpTask {
  // (undocumented)
  (gulp: gulp.Gulp | GulpProxy, buildConfig: IBuildConfig, done: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

// (undocumented)
interface IExecutable {
  execute: (config: IBuildConfig) => Promise<void>;
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
  isEnabled?: (config?: IBuildConfig) => boolean;
  name?: string;
  onRegister?: () => void;
}

export declare function initialize(gulp: gulp.Gulp): void;

// (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

// (undocumented)
interface IWebpackTaskConfig {
  config?: Webpack.Configuration;
  configPath: string;
  suppressWarnings?: (string | RegExp)[];
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

export declare function mergeConfig(config: IBuildConfig): void;

export declare function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function replaceConfig(config: IBuildConfig): void;

// (undocumented)
export declare function reset(): void;

class SchemaValidator {
  // (undocumented)
  static getFormattedErrorMessage(errors: Validator.SchemaErrorDetail[], dataFilePath?: string): string;
  static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  static readCommentedJsonFile < TResult >(filename: string): TResult;
  static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

export declare function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function setConfig(config: IBuildConfig): void;

// (undocumented)
export declare function setExitCode(exitCode: number): void;

// (undocumented)
export declare function setWatchMode(): void;

export declare function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

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
  static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  static getTypescriptCompiler(): any;
  // (undocumented)
  static getTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<typescript.CompilerOptions>;
  static setTypescriptCompiler(typescript: any): void;
}

// (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  // (undocumented)
  executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void;
  // (undocumented)
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: ITypeScriptTaskConfig): string[];
  mergeConfig(config: ITypeScriptTaskConfig): void;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfig: ITypeScriptTaskConfig;
}

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
