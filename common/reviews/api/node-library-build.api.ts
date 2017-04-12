export declare function addSuppression(str: string): void;

// WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
// WARNING: Unable to resolve external type reference for "IApiExtractorTaskConfig"
class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfig> {
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulp.Gulp"
  // WARNING: Unable to find a documentation file ("node.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "NodeJS.ReadWriteStream"
  // (undocumented)
  executeTask(gulp: gulp.Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream;
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  name: string;
  // WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IApiExtractorTaskConfig"
  // (undocumented)
  taskConfig: IApiExtractorTaskConfig;
}

class CleanTask extends GulpTask<void> {
  constructor();
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulp.Gulp"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): void;
}

// WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
// WARNING: Unable to resolve external type reference for "ICopyConfig"
class CopyTask extends GulpTask<ICopyConfig> {
  constructor();
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulp.Gulp"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("es6-promise.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Promise"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("node.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "NodeJS.ReadWriteStream"
  executeTask(gulp: gulp.Gulp, completeCallback: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
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
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulpType.Gulp"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("node.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "NodeJS.ReadWriteStream"
  executeTask(gulp: gulpType.Gulp, completeCallback: (result?: Object) => void): NodeJS.ReadWriteStream;
}

export declare function getConfig(): IBuildConfig;

export declare function getErrors(): string[];

export declare function getWarnings(): string[];

class GulpTask<TASK_CONFIG> implements IExecutable {
  protected _getConfigFilePath(): string;
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  buildConfig: IBuildConfig;
  cleanMatch: string[];
  copyFile(localSourcePath: string, localDestPath?: string): void;
  enabled: boolean;
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  // WARNING: Unable to find a documentation file ("es6-promise.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Promise"
  execute(config: IBuildConfig): Promise<void>;
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulp.Gulp"
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "GulpProxy"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("es6-promise.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Promise"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("node.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "NodeJS.ReadWriteStream"
  abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (result?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  fileExists(localPath: string): boolean;
  fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: TASK_CONFIG): string[];
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  isEnabled(buildConfig: IBuildConfig): boolean;
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  protected loadSchema(): Object;
  log(message: string): void;
  logError(message: string): void;
  logVerbose(message: string): void;
  logWarning(message: string): void;
  mergeConfig(taskConfig: TASK_CONFIG): void;
  name: string;
  onRegister(): void;
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  readJSONSync(localPath: string): Object;
  replaceConfig(taskConfig: TASK_CONFIG): void;
  resolvePath(localPath: string): string;
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  schema: Object;
  setConfig(taskConfig: TASK_CONFIG): void;
  taskConfig: TASK_CONFIG;
}

// (undocumented)
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
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulp.Gulp"
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "GulpProxy"
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("es6-promise.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Promise"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("node.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "NodeJS.ReadWriteStream"
  // (undocumented)
  (gulp: gulp.Gulp | GulpProxy, buildConfig: IBuildConfig, done: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

// (undocumented)
interface IExecutable {
  execute: (config: IBuildConfig) => Promise<void>;
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
  isEnabled?: (buildConfig: IBuildConfig) => boolean;
  name?: string;
  onRegister?: () => void;
}

export declare function initialize(gulp: gulp.Gulp): void;

// (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

export declare function log(...args: Array<string | Chalk.ChalkChain>): void;

export declare function logSummary(value: string): void;

export declare function mergeConfig(config: IBuildConfig): void;

export declare function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function replaceConfig(config: IBuildConfig): void;

// @internal
export declare function reset(): void;

class SchemaValidator {
  static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  static readCommentedJsonFile < TResult >(filename: string): TResult;
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

export declare function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

export declare function setConfig(config: IBuildConfig): void;

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
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  // WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "ITsConfigFile"
  // WARNING: Unable to find a documentation file ("gulp-typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "ts.Settings"
  static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  static getTypescriptCompiler(): any;
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  // WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "ITsConfigFile"
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "typescript.CompilerOptions"
  // (undocumented)
  static getTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<typescript.CompilerOptions>;
  static setTypescriptCompiler(typescript: any): void;
}

// WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
// WARNING: Unable to resolve external type reference for "ITypeScriptTaskConfig"
// (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulpType.Gulp"
  // (undocumented)
  executeTask(gulp: gulpType.Gulp, completeCallback: (result?: string) => void): void;
  // WARNING: Unable to find a documentation file ("gulp-core-build.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "IBuildConfig"
  // WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "ITypeScriptTaskConfig"
  // (undocumented)
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: ITypeScriptTaskConfig): string[];
  // WARNING: Unable to find a documentation file ("typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "Object"
  // (undocumented)
  loadSchema(): Object;
  // WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "ITypeScriptTaskConfig"
  mergeConfig(config: ITypeScriptTaskConfig): void;
  // (undocumented)
  name: string;
  // WARNING: Unable to find a documentation file ("gulp-core-build-typescript.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "ITypeScriptTaskConfig"
  // (undocumented)
  taskConfig: ITypeScriptTaskConfig;
}

class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  // WARNING: Unable to find a documentation file ("gulp.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "gulpType.Gulp"
  // WARNING: Unable to find a documentation file ("node.api.json")for the referenced package
  // WARNING: Unable to resolve external type reference for "NodeJS.ReadWriteStream"
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
