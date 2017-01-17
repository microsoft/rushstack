// (undocumented)
export function addSuppression(str: string): void;

// (undocumented)
class CleanTask extends GulpTask<ICleanConfig> {
  // (undocumented)
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (result?: Object) => void): void;
  // (undocumented)
  public name: string;
  // (undocumented)
  public taskConfig: ICleanConfig;
}

class CopyTask extends GulpTask<ICopyConfig> {
  // (undocumented)
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // (undocumented)
  public loadSchema(): Object;
  // (undocumented)
  public taskConfig: ICopyConfig;
}

// (undocumented)
export function coverageData(coverage: number, threshold: number, filePath: string): void;

// (undocumented)
export function endTaskSrc(taskName: string, startHrtime: [number, number], fileCount: number): void;

// (undocumented)
export function error(...args: Array<string | Chalk.ChalkChain>): void;

// (undocumented)
export function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// (undocumented)
export function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// (undocumented)
export function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string,  message: string): void;

// (undocumented)
export function functionalTestRun(name: string, result: TestResultState, duration: number): void;

// (undocumented)
export function generateGulpError(error: Object): Object;

class GenerateShrinkwrapTask extends GulpTask<{}> {
  // (undocumented)
  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
  // (undocumented)
  public name: string;
}

export function getConfig(): IBuildConfig;

// (undocumented)
export function getErrors(): string[];

// (undocumented)
export function getStart(): [number, number];

// (undocumented)
export function getWarnings(): string[];

// (undocumented)
export function getWatchMode(): boolean;

// (undocumented)
class GulpTask<TASK_CONFIG> implements IExecutable {
  protected _getConfigFilePath(): string;
  protected _readCommentedJsonFile(filename: string): TASK_CONFIG;
  // (undocumented)
  public buildConfig: IBuildConfig;
  // (undocumented)
  public cleanMatch: string[];
  // (undocumented)
  public copyFile(localSourcePath: string, localDestPath?: string): void;
  // (undocumented)
  public execute(config: IBuildConfig): Promise<void>;
  // (undocumented)
  public abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // (undocumented)
  public fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  // (undocumented)
  public fileExists(localPath: string): boolean;
  // (undocumented)
  public fileWarning(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  // (undocumented)
  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: TASK_CONFIG = this.taskConfig): string[];
  // (undocumented)
  public isEnabled(buildConfig: IBuildConfig): boolean;
  public loadSchema(): Object;
  // (undocumented)
  public log(message: string): void;
  // (undocumented)
  public logError(message: string): void;
  // (undocumented)
  public logVerbose(message: string): void;
  // (undocumented)
  public logWarning(message: string): void;
  public mergeConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  public name: string;
  // (undocumented)
  public onRegister(): void;
  // (undocumented)
  public readJSONSync(localPath: string): Object;
  public replaceConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  public resolvePath(localPath: string): string;
  public readonly schema: Object;
  public setConfig(taskConfig: TASK_CONFIG): void;
  // (undocumented)
  public taskConfig: TASK_CONFIG;
}

// (undocumented)
interface IBuildConfig {
  args?: {
    // (undocumented)
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
    // (undocumented)
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

export function initialize(gulp: gulp.Gulp): void;

// (undocumented)
export function log(...args: Array<string | Chalk.ChalkChain>): void;

// (undocumented)
export function logEndSubtask(name: string, startTime: [number, number], errorObject?: Error): void;

// (undocumented)
export function logStartSubtask(name: string): void;

// (undocumented)
export function logSummary(value: string): void;

// (undocumented)
export function markTaskCreationTime(): void;

export function mergeConfig(config: IBuildConfig): void;

export function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export function replaceConfig(config: IBuildConfig): void;

// (undocumented)
export function reset(): void;

export function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export function setConfig(config: IBuildConfig): void;

// (undocumented)
export function setExitCode(exitCode: number): void;

// (undocumented)
export function setWatchMode(): void;

export function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

export function task(taskName: string, task: IExecutable): IExecutable;

// (undocumented)
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

class ValidateShrinkwrapTask extends GulpTask<{}> {
  // (undocumented)
  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
  // (undocumented)
  public name: string;
}

// (undocumented)
export function verbose(...args: Array<string | Chalk.ChalkChain>): void;

// (undocumented)
export function warn(...args: Array<string | Chalk.ChalkChain>): void;

export function watch(watchMatch: string | string[], task: IExecutable): IExecutable;

// (undocumented)
export function writeError(e: any): void;

// WARNING: Unsupported export: clean
