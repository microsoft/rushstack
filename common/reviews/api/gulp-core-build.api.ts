export function addSuppression(str: string): void;

class CleanTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (result?: Object) => void): void;
}

class CopyTask extends GulpTask<ICopyConfiguration> {
  constructor();
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // @internal
  public loadSchema(): Object;
}

export function coverageData(coverage: number, threshold: number, filePath: string): void;

export function error(...args: Array<string | Chalk.ChalkChain>): void;

export function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

export function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

export function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string,  message: string): void;

export function functionalTestRun(name: string, result: TestResultState, duration: number): void;

class GenerateShrinkwrapTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulpType.Gulp, completeCallback: (result?: Object) => void): NodeJS.ReadWriteStream;
}

export function getConfiguration(): IBuildConfiguration;

export function getErrors(): string[];

export function getWarnings(): string[];

class GulpTask<TASK_CONFIGURATION> implements IExecutable {
  protected _getConfigurationFilePath(): string;
  public buildConfiguration: IBuildConfiguration;
  public cleanMatch: string[];
  public copyFile(localSourcePath: string, localDestPath?: string): void;
  public execute(configuration: IBuildConfiguration): Promise<void>;
  public abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  public fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  public fileExists(localPath: string): boolean;
  public fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  public getCleanMatch(buildConfiguration: IBuildConfiguration,
                         taskConfiguration: TASK_CONFIGURATION = this.taskConfiguration): string[];
  public isEnabled(buildConfiguration: IBuildConfiguration): boolean;
  protected loadSchema(): Object;
  public log(message: string): void;
  public logError(message: string): void;
  public logVerbose(message: string): void;
  public logWarning(message: string): void;
  public mergeConfiguration(taskConfiguration: TASK_CONFIGURATION): void;
  public name: string;
  public onRegister(): void;
  public readJSONSync(localPath: string): Object;
  public replaceConfiguration(taskConfiguration: TASK_CONFIGURATION): void;
  public resolvePath(localPath: string): string;
  public readonly schema: Object;
  public setConfiguration(taskConfiguration: TASK_CONFIGURATION): void;
  public taskConfiguration: TASK_CONFIGURATION;
}

// (undocumented)
interface IBuildConfiguration {
  args?: {
    [ name: string ]: string | boolean
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
    [ key: string ]: any
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

export function initialize(gulp: gulp.Gulp): void;

export function log(...args: Array<string | Chalk.ChalkChain>): void;

export function logSummary(value: string): void;

export function mergeConfiguration(configuration: IBuildConfiguration): void;

export function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export function replaceConfiguration(configuration: IBuildConfiguration): void;

// @internal
export function reset(): void;

class SchemaValidator {
  public static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  public static readCommentedJsonFile < TResult >(filename: string): TResult;
  public static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

export function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export function setConfiguration(configuration: IBuildConfiguration): void;

export function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

export function task(taskName: string, task: IExecutable): IExecutable;

enum TestResultState {
  // (undocumented)
  Failed,
  // (undocumented)
  FlakyFailed,
  // (undocumented)
  Passed,
  // (undocumented)
  Skipped
}

class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
}

export function verbose(...args: Array<string | Chalk.ChalkChain>): void;

export function warn(...args: Array<string | Chalk.ChalkChain>): void;

export function watch(watchMatch: string | string[], task: IExecutable): IExecutable;

// WARNING: Unsupported export: clean
// (No packageDescription for this package)
