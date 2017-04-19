class AsyncRecycler {
  // (undocumented)
  constructor(rushConfiguration: RushConfiguration);
  public deleteAll(): void;
  public moveFolder(folderPath: string): void;
  public readonly recyclerFolder: string;
}

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

// (undocumented)
enum ErrorDetectionMode {
  // (undocumented)
  LocalBuild = 1,
  // (undocumented)
  VisualStudio = 2,
  // (undocumented)
  VisualStudioOnline = 3
}

class ErrorDetector {
  // (undocumented)
  constructor(rules: IErrorDetectionRule[]);
  // (undocumented)
  public execute(data: string): TaskError[];
}

interface IChangeFile {
  // (undocumented)
  changes: IChangeInfo[];
  // (undocumented)
  email: string;
}

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

// (undocumented)
interface IErrorDetectionRule {
  // (undocumented)
  (line: string): TaskError;
}

// (undocumented)
interface IPackageDependency {
  kind: PackageDependencyKind;
  name: string;
  versionRange: string;
}

// (undocumented)
interface IPackageJson extends PackageJson {
  rushDependencies?: {
    [ key: string ]: string
  }
}

// (undocumented)
interface IPinnedVersionsJson {
  // (undocumented)
  [ dependency: string ]: string;
}

// (undocumented)
interface IResolveOrCreateResult {
  // (undocumented)
  found: Package;
  // (undocumented)
  parentForCreate: Package;
}

interface IRushConfigurationProjectJson {
  // (undocumented)
  cyclicDependencyProjects: string[];
  // (undocumented)
  packageName: string;
  // (undocumented)
  projectFolder: string;
  // (undocumented)
  reviewCategory?: string;
  // (undocumented)
  shouldPublish?: boolean;
}

interface IRushLinkJson {
  // (undocumented)
  localLinks: {
    [ name: string ]: string[]
  }
}

class JsonFile {
  // (undocumented)
  public static loadJsonFile(jsonFilename: string): any;
  // (undocumented)
  public static saveJsonFile(jsonData: any, jsonFilename: string): void;
}

// (undocumented)
class Npm {
  // (undocumented)
  public static publishedVersions(packageName: string,
      cwd: string,
      env: { [key: string]: string }): string[];
}

// (undocumented)
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

// (undocumented)
enum PackageDependencyKind {
  LocalLink,
  // (undocumented)
  Normal,
  Optional
}

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

// (undocumented)
class PackageReviewItem {
  // (undocumented)
  public allowedCategories: Set<string>;
  // (undocumented)
  public allowedInBrowser: boolean;
  // (undocumented)
  public packageName: string;
}

// (undocumented)
class PinnedVersionsConfiguration {
  constructor(pinnedVersionJson: IPinnedVersionsJson, private _filename: string);
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
  // (undocumented)
  public set(dependency: string, version: string): this;
  // (undocumented)
  public readonly size: number;
  // (undocumented)
  public static tryLoadFromFile(jsonFilename: string): PinnedVersionsConfiguration;
}

export function RegexErrorDetector(regex: RegExp,
    getError: (match: RegExpExecArray) => TaskError): IErrorDetectionRule;

class RushConfiguration {
  // WARNING: The type "IRushConfigurationJson" needs to be exported by the package (e.g. added to index.ts)
  constructor(rushConfigurationJson: IRushConfigurationJson, rushJsonFilename: string);
  public readonly cacheFolder: string;
  public readonly commonFolder: string;
  public readonly commonFolderName: string;
  public findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject;
  public getProjectByName(projectName: string): RushConfigurationProject;
  public readonly gitAllowedEmailRegExps: string[];
  public readonly gitSampleEmail: string;
  public readonly homeFolder: string;
  public static loadFromConfigurationFile(rushJsonFilename: string): RushConfiguration;
  // (undocumented)
  public static loadFromDefaultLocation(): RushConfiguration;
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
  public readonly shrinkwrapFilename: string;
  public readonly tempModulesFolder: string;
  public readonly tmpFolder: string;
}

class RushConfigurationProject {
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

// (undocumented)
enum StopwatchState {
  // (undocumented)
  Started = 2,
  // (undocumented)
  Stopped = 1
}

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

// (undocumented)
class Utilities {
  // (undocumented)
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

// (undocumented)
class VersionControl {
  // (undocumented)
  public static getChangedFiles(prefix?: string, targetBranch?: string): string[];
  // (undocumented)
  public static getChangedFolders(targetBranch?: string): string[];
}

// (undocumented)
class VersionMismatchFinder {
  // (undocumented)
  constructor(projects: RushConfigurationProject[]);
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
