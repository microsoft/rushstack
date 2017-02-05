export declare function addSuppression(str: string): void;

class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfig> {
  executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream;
  loadSchema(): Object;
  name: string;
  taskConfig: IApiExtractorTaskConfig;
}

class CleanTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void;
}

class CopyTask extends GulpTask<ICopyConfig> {
  constructor();
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // @internal
  loadSchema(): Object;
}

export declare function coverageData(coverage: number, threshold: number, filePath: string): void;

export declare function error(...args: Array<string | Chalk.ChalkChain>): void;

export declare function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

export declare function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

export declare function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

export declare function functionalTestRun(name: string, result: TestResultState, duration: number): void;

class GenerateShrinkwrapTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulpType.Gulp, completeCallback: (result?: Object) => void): NodeJS.ReadWriteStream;
}

export declare function getConfig(): IBuildConfig;

export declare function getErrors(): string[];

export declare function getWarnings(): string[];

class GulpTask<TASK_CONFIG> implements IExecutable {
  protected _getConfigFilePath(): string;
  buildConfig: IBuildConfig;
  cleanMatch: string[];
  copyFile(localSourcePath: string, localDestPath?: string): void;
  execute(config: IBuildConfig): Promise<void>;
  abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  fileExists(localPath: string): boolean;
  fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: TASK_CONFIG): string[];
  isEnabled(buildConfig: IBuildConfig): boolean;
  protected loadSchema(): Object;
  log(message: string): void;
  logError(message: string): void;
  logVerbose(message: string): void;
  logWarning(message: string): void;
  mergeConfig(taskConfig: TASK_CONFIG): void;
  name: string;
  onRegister(): void;
  readJSONSync(localPath: string): Object;
  replaceConfig(taskConfig: TASK_CONFIG): void;
  resolvePath(localPath: string): string;
  schema: Object;
  setConfig(taskConfig: TASK_CONFIG): void;
  taskConfig: TASK_CONFIG;
}

interface IBuildConfig {
  args?: {
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

interface ICopyConfig {
  copyTo: {
    [ destPath: string ]: string[];
  }
  shouldFlatten?: boolean;
}

interface ICustomGulpTask {
  (gulp: gulp.Gulp | GulpProxy, buildConfig: IBuildConfig, done: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

interface IExecutable {
  execute: (config: IBuildConfig) => Promise<void>;
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
  isEnabled?: (config?: IBuildConfig) => boolean;
  name?: string;
  onRegister?: () => void;
}

export declare function initialize(gulp: gulp.Gulp): void;

interface ITsConfigFile<T> {
  compilerOptions: T;
}

interface IWebpackTaskConfig {
  config?: Webpack.Configuration;
  configPath: string;
  suppressWarnings?: (string | RegExp)[];
  webpack?: typeof Webpack;
}

export declare function logSummary(value: string): void;

export declare function mergeConfig(config: IBuildConfig): void;

export declare function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function replaceConfig(config: IBuildConfig): void;

// @internal
export declare function reset(): void;

class SchemaValidator {
  static getFormattedErrorMessage(errors: Validator.SchemaErrorDetail[], dataFilePath?: string): string;
  static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  static readCommentedJsonFile < TResult >(filename: string): TResult;
  static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

export declare function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function setConfig(config: IBuildConfig): void;

export declare function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

export declare function task(taskName: string, task: IExecutable): IExecutable;

enum TestResultState {
  Failed = 1,
  FlakyFailed = 2,
  Passed = 0,
  Skipped = 3
}

class TypeScriptConfiguration {
  static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  static getTypescriptCompiler(): any;
  static getTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<typescript.CompilerOptions>;
  static setTypescriptCompiler(typescript: any): void;
}

class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void;
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: ITypeScriptTaskConfig): string[];
  loadSchema(): Object;
  mergeConfig(config: ITypeScriptTaskConfig): void;
  name: string;
  taskConfig: ITypeScriptTaskConfig;
}

class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
}

export declare function verbose(...args: Array<string | Chalk.ChalkChain>): void;

export declare function warn(...args: Array<string | Chalk.ChalkChain>): void;

export declare function watch(watchMatch: string | string[], task: IExecutable): IExecutable;

class WebpackTask extends GulpTask<IWebpackTaskConfig> {
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void;
  isEnabled(buildConfig: IBuildConfig): boolean;
  loadSchema(): Object;
  name: string;
  resources: Object;
  taskConfig: IWebpackTaskConfig;
}

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
// (No packageDescription for this package)
