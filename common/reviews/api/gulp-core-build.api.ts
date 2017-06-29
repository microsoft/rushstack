// @public
export function addSuppression(str: string): void;

// @public
class CleanTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (error?: string) => void): void;
}

// @public
class CopyTask extends GulpTask<ICopyConfig> {
  constructor();
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (error?: string) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  public loadSchema(): Object;
}

// @public
export function coverageData(coverage: number, threshold: number, filePath: string): void;

// @public
export function error(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string,  message: string): void;

// @public
export function functionalTestRun(name: string, result: TestResultState, duration: number): void;

// @public
class GenerateShrinkwrapTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulpType.Gulp,
      completeCallback: (error?: string) => void): NodeJS.ReadWriteStream | void;
}

// @public
export function getConfig(): IBuildConfig;

// @public
export function getErrors(): string[];

// @public
export function getWarnings(): string[];

// @public
class GulpTask<TASK_CONFIG> implements IExecutable {
  protected _getConfigFilePath(): string;
  public buildConfig: IBuildConfig;
  public cleanMatch: string[];
  public copyFile(localSourcePath: string, localDestPath?: string): void;
  public enabled: boolean;
  public execute(config: IBuildConfig): Promise<void>;
  // WARNING: The type "GulpProxy" needs to be exported by the package (e.g. added to index.ts)
  public abstract executeTask(gulp: gulp.Gulp | GulpProxy,
      completeCallback?: (error?: string) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  public fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  public fileExists(localPath: string): boolean;
  public fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: TASK_CONFIG = this.taskConfig): string[];
  public isEnabled(buildConfig: IBuildConfig): boolean;
  protected loadSchema(): Object | undefined;
  public log(message: string): void;
  public logError(message: string): void;
  public logVerbose(message: string): void;
  public logWarning(message: string): void;
  public mergeConfig(taskConfig: TASK_CONFIG): void;
  public name: string;
  public onRegister(): void;
  public readJSONSync(localPath: string): Object | undefined;
  public replaceConfig(taskConfig: TASK_CONFIG): void;
  public resolvePath(localPath: string): string;
  public readonly schema: Object | undefined;
  public setConfig(taskConfig: TASK_CONFIG): void;
  public taskConfig: TASK_CONFIG;
}

// @public (undocumented)
interface IBuildConfig {
  args: {
    [ name: string ]: string | boolean
  }
  buildErrorIconPath?: string;
  buildSuccessIconPath?: string;
  distFolder: string;
  gulp: GulpProxy | gulp.Gulp;
  isRedundantBuild?: boolean;
  libAMDFolder?: string;
  libES6Folder?: string;
  libFolder: string;
  onTaskEnd?: (taskName: string, duration: number[], error?: any) => void;
  onTaskStart?: (taskName: string) => void;
  packageFolder: string;
  production: boolean;
  properties?: {
    [ key: string ]: any
  }
  relogIssues?: boolean;
  rootPath: string;
  shouldWarningsFailBuild?: boolean;
  showToast?: boolean;
  srcFolder: string;
  tempFolder: string;
  uniqueTasks?: IExecutable[];
  verbose: boolean;
}

// @public
interface ICopyConfig {
  copyTo: {
    [ destPath: string ]: string[];
  }
  shouldFlatten?: boolean;
}

// @public
interface ICustomGulpTask {
  // WARNING: The type "GulpProxy" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  (gulp: gulp.Gulp | GulpProxy, buildConfig: IBuildConfig, done?: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

// @public (undocumented)
interface IExecutable {
  execute: (config: IBuildConfig) => Promise<void>;
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
  isEnabled?: (buildConfig: IBuildConfig) => boolean;
  name?: string;
  onRegister?: () => void;
}

// @public
export function initialize(gulp: gulp.Gulp): void;

// @public
export function log(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export function logSummary(value: string): void;

// @public
export function mergeConfig(config: IBuildConfig): void;

// @public
export function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
export function replaceConfig(config: IBuildConfig): void;

// @public
export function reset(): void;

// @public
class SchemaValidator {
  public static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  public static readCommentedJsonFile < TResult >(filename: string): TResult;
  public static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

// @public
export function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
export function setConfig(config: IBuildConfig): void;

// @public
export function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

// @public
export function task(taskName: string, task: IExecutable): IExecutable;

// @public
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

// @public
class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulpType.Gulp, completeCallback: (error: string) => void): NodeJS.ReadWriteStream | void;
}

// @public
export function verbose(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export function warn(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export function watch(watchMatch: string | string[], task: IExecutable): IExecutable;

// WARNING: Unsupported export: clean
// (No packageDescription for this package)
