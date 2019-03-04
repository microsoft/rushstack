// @public
declare function addSuppression(suppression: string | RegExp): void;

// @public (undocumented)
declare const clean: IExecutable;

// @public (undocumented)
declare const cleanFlag: IExecutable;

// @public
declare class CleanFlagTask extends CleanTask {
    // (undocumented)
    constructor();
    // (undocumented)
    executeTask(gulp: typeof gulp_2, completeCallback: (error?: string | Error) => void): void;
    // (undocumented)
    isEnabled(buildConfig: IBuildConfig): boolean;
}

// @public
declare class CleanTask extends GulpTask<void> {
    constructor();
    executeTask(gulp: typeof gulp_2, completeCallback: (error?: string | Error) => void): void;
}

// @public (undocumented)
declare const copyStaticAssets: CopyStaticAssetsTask;

// @public
declare class CopyStaticAssetsTask extends GulpTask<ICopyStaticAssetsTaskConfig> {
    // (undocumented)
    constructor();
    // (undocumented)
    executeTask(gulp: typeof gulp_2, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream;
    // (undocumented)
    loadSchema(): Object;
}

// @public
declare class CopyTask extends GulpTask<ICopyConfig> {
    constructor();
    executeTask(gulp: typeof gulp_2, completeCallback: (error?: string | Error) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
    loadSchema(): Object;
}

// @public
declare function coverageData(coverage: number, threshold: number, filePath: string): void;

// @public
declare function error(...args: Array<string>): void;

// @public
declare function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
declare function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
declare function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
declare function functionalTestRun(name: string, result: TestResultState, duration: number): void;

// @public
declare class GenerateShrinkwrapTask extends GulpTask<void> {
    constructor();
    // Warning: (ae-forgotten-export) The symbol gulp needs to be exported from the entry point index.d.ts
    executeTask(gulp: gulp.Gulp, completeCallback: (error?: string | Error) => void): NodeJS.ReadWriteStream | void;
}

// @public
declare function getConfig(): IBuildConfig;

// @public
declare function getErrors(): string[];

// @public
declare function getWarnings(): string[];

// @public
declare abstract class GulpTask<TTaskConfig> implements IExecutable {
    constructor(name: string, initialTaskConfig?: Partial<TTaskConfig>);
    buildConfig: IBuildConfig;
    cleanMatch: string[];
    copyFile(localSourcePath: string, localDestPath?: string): void;
    enabled: boolean;
    execute(config: IBuildConfig): Promise<void>;
    // Warning: (ae-forgotten-export) The symbol GulpProxy needs to be exported from the entry point index.d.ts
    abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (error?: string | Error) => void): Promise<Object | void> | NodeJS.ReadWriteStream | void;
    fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
    fileExists(localPath: string): boolean;
    fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
    getCleanMatch(buildConfig: IBuildConfig, taskConfig?: TTaskConfig): string[];
    protected _getConfigFilePath(): string;
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
    };
    buildErrorIconPath?: string;
    buildSuccessIconPath?: string;
    distFolder: string;
    gulp: GulpProxy | gulp_2.Gulp;
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
    };
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
    };
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
    (gulp: typeof gulp_2 | GulpProxy, buildConfig: IBuildConfig, done?: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
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
declare function initialize(gulp: typeof gulp_2): void;

// @internal
declare function _isJestEnabled(rootFolder: string): boolean;

// @public (undocumented)
declare const jest: JestTask;

// @alpha
declare class JestTask extends GulpTask<IJestConfig> {
    // (undocumented)
    constructor();
    // (undocumented)
    executeTask(gulp: typeof gulp_2, completeCallback: (error?: string | Error) => void): void;
    // (undocumented)
    isEnabled(buildConfig: IBuildConfig): boolean;
    loadSchema(): Object;
}

// @public
declare function log(...args: Array<string>): void;

// @public
declare function logSummary(value: string): void;

// @public
declare function mergeConfig(config: Partial<IBuildConfig>): void;

// @public
declare function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
declare function replaceConfig(config: IBuildConfig): void;

// @public
declare function reset(): void;

// @public
declare function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
declare function setConfig(config: Partial<IBuildConfig>): void;

// @public
declare function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

// @public
declare function task(taskName: string, taskExecutable: IExecutable): IExecutable;

// @public
declare enum TestResultState {
    // (undocumented)
    Failed = 1,
    // (undocumented)
    FlakyFailed = 2,
    // (undocumented)
    Passed = 0,
    // (undocumented)
    Skipped = 3
}

// @public
declare class ValidateShrinkwrapTask extends GulpTask<void> {
    constructor();
    executeTask(gulp: gulp.Gulp, completeCallback: (error: string) => void): NodeJS.ReadWriteStream | void;
    }

// @public
declare function verbose(...args: Array<string>): void;

// @public
declare function warn(...args: Array<string>): void;

// @public
declare function watch(watchMatch: string | string[], taskExecutable: IExecutable): IExecutable;


// (No @packageDocumentation comment for this package)
