// (undocumented)
export function addSuppression(str: string): void;

class CleanTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (result?: Object) => void): void;
}

class CopyTask extends GulpTask<ICopyConfig> {
  constructor();
  public executeTask(gulp: gulp.Gulp,
      completeCallback: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // @internal
  public loadSchema(): Object;
}

// (undocumented)
export function coverageData(coverage: number, threshold: number, filePath: string): void;

// (undocumented)
export function functionalTestRun(name: string, result: TestResultState, duration: number): void;

class GenerateShrinkwrapTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulpType.Gulp, completeCallback: (result?: Object) => void): NodeJS.ReadWriteStream;
}

export function getConfig(): IBuildConfig;

// (undocumented)
export function getErrors(): string[];

// (undocumented)
export function getWarnings(): string[];

class GulpTask<TASK_CONFIG> implements IExecutable {
  protected _getConfigFilePath(): string;
  public buildConfig: IBuildConfig;
  public cleanMatch: string[];
  public copyFile(localSourcePath: string, localDestPath?: string): void;
  public execute(config: IBuildConfig): Promise<void>;
  public abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  public fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  public fileExists(localPath: string): boolean;
  public fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  public getCleanMatch(buildConfig: IBuildConfig, taskConfig: TASK_CONFIG = this.taskConfig): string[];
  public isEnabled(buildConfig: IBuildConfig): boolean;
  protected loadSchema(): Object;
  public log(message: string): void;
  public logError(message: string): void;
  public logVerbose(message: string): void;
  public logWarning(message: string): void;
  public mergeConfig(taskConfig: TASK_CONFIG): void;
  public name: string;
  public onRegister(): void;
  // (undocumented)
  public readJSONSync(localPath: string): Object;
  public replaceConfig(taskConfig: TASK_CONFIG): void;
  public resolvePath(localPath: string): string;
  public readonly schema: Object;
  public setConfig(taskConfig: TASK_CONFIG): void;
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
interface ISchemaValidatorResult {
  // (undocumented)
  details?: ZSchema.SchemaError[];
  // (undocumented)
  message?: string;
  // (undocumented)
  name?: string;
}

export function mergeConfig(config: IBuildConfig): void;

export function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export function replaceConfig(config: IBuildConfig): void;

class SchemaValidator {
  // (undocumented)
  public static getFormattedErrorMessage(error: ISchemaValidatorResult, dataFilePath?: string): string;
  public static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  public static readCommentedJsonFile < TResult >(filename: string): TResult;
  public static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

export function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export function setConfig(config: IBuildConfig): void;

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

class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  public executeTask(gulp: gulpType.Gulp): NodeJS.ReadWriteStream;
}

export function watch(watchMatch: string | string[], task: IExecutable): IExecutable;

// WARNING: Unsupported export: clean
