// @public
class AsyncRecycler {
  // (undocumented)
  constructor(rushConfiguration: RushConfiguration);
  public deleteAll(): void;
  public moveFolder(folderPath: string): void;
  public readonly recyclerFolder: string;
}

// @public
class BuildTaskError extends TaskError {
  // (undocumented)
  constructor(type: string, message: string, file: string, line: number, offset: number);
  // (undocumented)
  protected _file: string;
  // (undocumented)
  protected _line: number;
  // (undocumented)
  protected _offset: number;
  // (undocumented)
  public toString(mode: ErrorDetectionMode): string;
}

// @public
enum ChangeType {
  // (undocumented)
  dependency = 1,
  // (undocumented)
  major = 4,
  // (undocumented)
  minor = 3,
  // (undocumented)
  none = 0,
  // (undocumented)
  patch = 2
}

// @public (undocumented)
enum ErrorDetectionMode {
  // (undocumented)
  LocalBuild = 1,
  // (undocumented)
  VisualStudio = 2,
  // (undocumented)
  VisualStudioOnline = 3
}

// @public
class ErrorDetector {
  // (undocumented)
  constructor(rules: IErrorDetectionRule[]);
  // (undocumented)
  public execute(data: string): TaskError[];
}

// @public
interface IChangeFile {
  // (undocumented)
  changes: IChangeInfo[];
  // (undocumented)
  email: string;
}

// @public
interface IChangeInfo {
  author?: string;
  changes?: IChangeInfo[];
  changeType?: ChangeType;
  comment?: string;
  commit?: string;
  newRangeDependency?: string;
  newVersion?: string;
  order?: number;
  packageName: string;
  type?: string;
}

// @public (undocumented)
interface IErrorDetectionRule {
  // (undocumented)
  (line: string): TaskError;
}

// @public (undocumented)
interface IPackageDependency {
  kind: PackageDependencyKind;
  name: string;
  versionRange: string;
}

// @public (undocumented)
interface IPackageJson extends PackageJson {
  rushDependencies?: {
    [ key: string ]: string
  }
}

// @public (undocumented)
interface IResolveOrCreateResult {
  // (undocumented)
  found: Package;
  // (undocumented)
  parentForCreate: Package;
}

// @public
interface IRushLinkJson {
  // (undocumented)
  localLinks: {
    [ name: string ]: string[]
  }
}

// @public
class JsonFile {
  // (undocumented)
  public static loadJsonFile(jsonFilename: string): any;
  // (undocumented)
  public static saveJsonFile(jsonData: any, jsonFilename: string): void;
}

// @public (undocumented)
class Npm {
  // (undocumented)
  public static publishedVersions(packageName: string,
      cwd: string,
      env: { [key: string]: string }): string[];
}

// @public (undocumented)
class Package {
  // (undocumented)
  constructor(name: string, version: string, dependencies: IPackageDependency[], folderPath: string);
  // (undocumented)
  public addChild(child: Package): void;
  public children: Package[];
  // WARNING: The type "PackageNode" needs to be exported by the package (e.g. added to index.ts)
  public static createFromNpm(npmPackage: PackageNode): Package;
  public dependencies: IPackageDependency[];
  public folderPath: string;
  // (undocumented)
  public getChildByName(childPackageName: string): Package;
  public name: string;
  // (undocumented)
  public readonly nameAndVersion: string;
  // WARNING: The type "PackageJson" needs to be exported by the package (e.g. added to index.ts)
  public originalPackageJson: PackageJson;
  public parent: Package;
  // (undocumented)
  public printTree(indent?: string): void;
  public resolve(dependencyName: string): Package;
  public resolveOrCreate(dependencyName: string, cyclicSubtreeRoot?: Package): IResolveOrCreateResult;
  public symlinkTargetFolderPath: string;
  public version: string;
}

// @public
enum PackageDependencyKind {
  LocalLink,
  // (undocumented)
  Normal,
  Optional
}

// @public
class PackageReviewConfiguration {
  // WARNING: The type "IPackageReviewJson" needs to be exported by the package (e.g. added to index.ts)
  constructor(packageReviewJson: IPackageReviewJson, jsonFilename: string);
  // (undocumented)
  public addOrUpdatePackage(packageName: string, allowedInBrowser: boolean, reviewCategory: string): void;
  // (undocumented)
  public getItemByName(packageName: string): PackageReviewItem;
  public readonly ignoredNpmScopes: Set<string>;
  // (undocumented)
  public items: PackageReviewItem[];
  public static loadFromFile(jsonFilename: string): PackageReviewConfiguration;
  // (undocumented)
  public saveFile(jsonFilename: string): void;
}

// @public
class PackageReviewItem {
  public allowedCategories: Set<string>;
  public allowedInBrowser: boolean;
  public packageName: string;
}

// @public
class PinnedVersionsConfiguration {
  // (undocumented)
  public clear(): this;
  // (undocumented)
  public delete(dependency: string): boolean;
  // (undocumented)
  public forEach(cb: (version: string, dependency: string) => void): this;
  // (undocumented)
  public get(dependency: string): string;
  // (undocumented)
  public has(dependency: string): boolean;
  // (undocumented)
  public save(): this;
  public set(dependency: string, version: string): this;
  // (undocumented)
  public readonly size: number;
  public static tryLoadFromFile(jsonFilename: string): PinnedVersionsConfiguration;
}

// @public
export function RegexErrorDetector(regex: RegExp,
    getError: (match: RegExpExecArray) => TaskError): IErrorDetectionRule;

// @public
class RushConfiguration {
  public readonly committedShrinkwrapFilename: string;
  public readonly commonFolder: string;
  public readonly commonFolderName: string;
  public readonly commonTempFolder: string;
  public findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject;
  public getProjectByName(projectName: string): RushConfigurationProject;
  public readonly gitAllowedEmailRegExps: string[];
  public readonly gitSampleEmail: string;
  public readonly homeFolder: string;
  public static loadFromConfigurationFile(rushJsonFilename: string): RushConfiguration;
  // (undocumented)
  public static loadFromDefaultLocation(): RushConfiguration;
  public readonly npmCacheFolder: string;
  public readonly npmTmpFolder: string;
  public readonly npmToolFilename: string;
  public readonly npmToolVersion: string;
  public readonly packageReviewFile: string;
  // (undocumented)
  public readonly pinnedVersions: PinnedVersionsConfiguration;
  public readonly projectFolderMaxDepth: number;
  public readonly projectFolderMinDepth: number;
  // (undocumented)
  public readonly projects: RushConfigurationProject[];
  // (undocumented)
  public readonly projectsByName: Map<string, RushConfigurationProject>;
  public readonly reviewCategories: Set<string>;
  public readonly rushJsonFolder: string;
  public readonly rushLinkJsonFilename: string;
  public readonly tempShrinkwrapFilename: string;
}

// @public
class RushConfigurationProject {
  // WARNING: The type "IRushConfigurationProjectJson" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  constructor(projectJson: IRushConfigurationProjectJson,
                rushConfiguration: RushConfiguration,
                tempProjectName: string);
  public readonly cyclicDependencyProjects: Set<string>;
  public readonly downstreamDependencyProjects: string[];
  // WARNING: The type "PackageJson" needs to be exported by the package (e.g. added to index.ts)
  public readonly packageJson: PackageJson;
  public readonly packageName: string;
  public readonly projectFolder: string;
  public readonly projectRelativeFolder: string;
  public readonly reviewCategory: string;
  public readonly shouldPublish: boolean;
  public readonly tempProjectName: string;
}

// @public
class RushConstants {
  public static npmShrinkwrapFilename: string;
  public static rushTempFolderName: string;
  public static rushTempNpmScope: string;
  public static rushTempProjectsFolderName: string;
}

// @public
class Stopwatch {
  // (undocumented)
  constructor(getTime: () => number = Utilities.getTimeInMs);
  public reset(): Stopwatch;
  public static start(): Stopwatch;
  // (undocumented)
  public readonly state: StopwatchState;
  public stop(): Stopwatch;
  public toString(): string;
}

// @public
enum StopwatchState {
  // (undocumented)
  Started = 2,
  // (undocumented)
  Stopped = 1
}

// @public
class TaskError {
  // (undocumented)
  constructor(type: string, message: string);
  // (undocumented)
  protected _appendPrefix(errorMessage: string, mode: ErrorDetectionMode): string;
  // (undocumented)
  protected _message: string;
  // (undocumented)
  protected _type: string;
  // (undocumented)
  public toString(mode: ErrorDetectionMode): string;
}

// @public (undocumented)
class Utilities {
  public static createFolderWithRetry(folderName: string): void;
  public static dangerouslyDeletePath(folderPath: string): void;
  public static deleteFile(filePath: string): void;
  public static directoryExists(path: string): boolean;
  public static executeCommand(command: string, args: string[], workingDirectory: string,
      suppressOutput: boolean = false, environmentVariables?: { [key: string]: string }): void;
  public static executeCommandAndCaptureOutput(command: string, args: string[], workingDirectory: string,
      environmentVariables?: { [key: string]: string }): string;
  public static executeCommandAsync(command: string, args: string[], workingDirectory: string,
      environmentVariables?: { [key: string]: string }): child_process.ChildProcess;
  public static executeCommandWithRetry(command: string, args: string[], maxAttempts: number,
      workingDirectory: string, suppressOutput: boolean = false): void;
  public static fileExists(path: string): boolean;
  public static getAllReplaced(targetString: string, searchValue: string, replaceValue: string): string;
  public static getConsoleWidth(): number;
  public static getSetAsArray < T >(set: Set<T>): T[];
  public static getTimeInMs(): number;
  // (undocumented)
  public static isFileTimestampCurrent(outputFilename: string, inputFilenames: string[]): boolean;
  public static parseScopedPackageName: {
    name: string;
    scope: string;
  }
  public static retryUntilTimeout < TResult >(fn: () => TResult,
                                             maxWaitTimeMs: number,
                                             getTimeoutError: (innerError: Error) => Error,
                                             fnName: string): TResult;
}

// @public (undocumented)
class VersionControl {
  // (undocumented)
  public static getChangedFiles(prefix?: string, targetBranch?: string): string[];
  // (undocumented)
  public static getChangedFolders(targetBranch?: string): string[];
  // (undocumented)
  public static hasUncommitedChanges(): boolean;
}

// @public (undocumented)
class VersionMismatchFinder {
  // (undocumented)
  constructor(private _projects: RushConfigurationProject[]);
  // (undocumented)
  public getConsumersOfMismatch(mismatch: string, version: string): Array<string>;
  // (undocumented)
  public getMismatches(): Array<string>;
  // (undocumented)
  public getVersionsOfMismatch(mismatch: string): Array<string>;
  // (undocumented)
  public readonly numberOfMismatches: number;
}

// WARNING: Unsupported export: rushVersion
// WARNING: Unsupported export: TestErrorDetector
// WARNING: Unsupported export: TsErrorDetector
// WARNING: Unsupported export: TsLintErrorDetector
// (No packageDescription for this package)
