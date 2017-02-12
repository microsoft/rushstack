export declare function addSuppression(str: string): void;

class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfiguration> {
  // (undocumented)
  executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfiguration: IApiExtractorTaskConfiguration;
}

class CleanTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void;
}

class CopyTask extends GulpTask<ICopyConfiguration> {
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

export declare function getConfiguration(): IBuildConfiguration;

export declare function getErrors(): string[];

export declare function getWarnings(): string[];

class GulpTask<TASK_CONFIGURATION> implements IExecutable {
  protected _getConfigurationFilePath(): string;
  buildConfiguration: IBuildConfiguration;
  cleanMatch: string[];
  copyFile(localSourcePath: string, localDestPath?: string): void;
  execute(configuration: IBuildConfiguration): Promise<void>;
  abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  fileExists(localPath: string): boolean;
  fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  getCleanMatch(buildConfiguration: IBuildConfiguration, taskConfiguration?: TASK_CONFIGURATION): string[];
  isEnabled(buildConfiguration: IBuildConfiguration): boolean;
  protected loadSchema(): Object;
  log(message: string): void;
  logError(message: string): void;
  logVerbose(message: string): void;
  logWarning(message: string): void;
  mergeConfiguration(taskConfiguration: TASK_CONFIGURATION): void;
  name: string;
  onRegister(): void;
  readJSONSync(localPath: string): Object;
  replaceConfiguration(taskConfiguration: TASK_CONFIGURATION): void;
  resolvePath(localPath: string): string;
  schema: Object;
  setConfiguration(taskConfiguration: TASK_CONFIGURATION): void;
  taskConfiguration: TASK_CONFIGURATION;
}

// (undocumented)
interface IBuildConfiguration {
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

interface ICopyConfiguration {
  copyTo: {
    [ destPath: string ]: string[];
  }
  shouldFlatten?: boolean;
}

interface ICustomGulpTask {
  // (undocumented)
  (gulp: gulp.Gulp | GulpProxy, buildConfiguration: IBuildConfiguration, done: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

// (undocumented)
interface IExecutable {
  execute: (configuration: IBuildConfiguration) => Promise<void>;
  getCleanMatch?: (configuration: IBuildConfiguration, taskConfiguration?: any) => string[];
  isEnabled?: (configuration?: IBuildConfiguration) => boolean;
  name?: string;
  onRegister?: () => void;
}

export declare function initialize(gulp: gulp.Gulp): void;

// (undocumented)
interface ITsConfigurationFile<T> {
  // (undocumented)
  compilerOptions: T;
}

export declare function log(...args: Array<string | Chalk.ChalkChain>): void;

export declare function logSummary(value: string): void;

export declare function mergeConfiguration(configuration: IBuildConfiguration): void;

export declare function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function replaceConfiguration(configuration: IBuildConfiguration): void;

// @internal
export declare function reset(): void;

class SchemaValidator {
  static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  static readCommentedJsonFile < TResult >(filename: string): TResult;
  static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

export declare function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function setConfiguration(configuration: IBuildConfiguration): void;

export declare function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

export declare function task(taskName: string, task: IExecutable): IExecutable;

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
  static getGulpTypescriptOptions(buildConfiguration: IBuildConfiguration): ITsConfigurationFile<ts.Settings>;
  static getTypescriptCompiler(): any;
  // (undocumented)
  static getTypescriptOptions(buildConfiguration: IBuildConfiguration): ITsConfigurationFile<typescript.CompilerOptions>;
  static setTypescriptCompiler(typescript: any): void;
}

// (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfiguration> {
  // (undocumented)
  executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void;
  // (undocumented)
  getCleanMatch(buildConfiguration: IBuildConfiguration, taskConfiguration?: ITypeScriptTaskConfiguration): string[];
  // (undocumented)
  loadSchema(): Object;
  mergeConfiguration(configuration: ITypeScriptTaskConfiguration): void;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfiguration: ITypeScriptTaskConfiguration;
}

class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
}

export declare function verbose(...args: Array<string | Chalk.ChalkChain>): void;

export declare function warn(...args: Array<string | Chalk.ChalkChain>): void;

export declare function watch(watchMatch: string | string[], task: IExecutable): IExecutable;

// WARNING: Unsupported export: buildTasks
// WARNING: Unsupported export: testTasks
// WARNING: Unsupported export: defaultTasks
// WARNING: Unsupported export: clean
// WARNING: Unsupported export: apiExtractor
// WARNING: Unsupported export: typescript
// WARNING: Unsupported export: tslint
// WARNING: Unsupported export: text
// WARNING: Unsupported export: removeTripleSlash
// WARNING: Unsupported export: instrument
// WARNING: Unsupported export: mocha
// (No packageDescription for this package)
