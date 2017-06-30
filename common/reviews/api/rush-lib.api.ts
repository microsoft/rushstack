// @public
class ApprovedPackagesConfiguration {
  public constructor(jsonFilename: string);
  // (undocumented)
  public addOrUpdatePackage(packageName: string, reviewCategory: string): void;
  public clear(): void;
  // (undocumented)
  public getItemByName(packageName: string): ApprovedPackagesItem;
  // (undocumented)
  public items: ApprovedPackagesItem[];
  public loadFromFile(): void;
  public saveToFile(): void;
  public tryLoadFromFile(approvedPackagesPolicyEnabled: boolean): boolean;
}

// @public
class ApprovedPackagesItem {
  public allowedCategories: Set<string>;
  public packageName: string;
}

// @public
class ApprovedPackagesPolicy {
  // WARNING: The type "IRushConfigurationJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  public constructor(rushConfiguration: RushConfiguration, rushConfigurationJson: IRushConfigurationJson);
  public readonly browserApprovedPackages: ApprovedPackagesConfiguration;
  public readonly enabled: boolean;
  public readonly ignoredNpmScopes: Set<string>;
  public readonly nonbrowserApprovedPackages: ApprovedPackagesConfiguration;
  public readonly reviewCategories: Set<string>;
}

// @public
class AsyncRecycler {
  constructor(rushConfiguration: RushConfiguration);
  public deleteAll(): void;
  public moveFolder(folderPath: string): void;
  public readonly recyclerFolder: string;
}

// @alpha
enum BaseTypeName {
  // (undocumented)
  'individualVersion',
  // (undocumented)
  'lockStepVersion'
}

// @public
class BuildTaskError extends TaskError {
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

// @alpha
enum BumpType {
  // (undocumented)
  'major',
  // (undocumented)
  'minor',
  // (undocumented)
  'patch',
  // (undocumented)
  'prerelease',
  // (undocumented)
  'release'
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
  constructor(rules: IErrorDetectionRule[]);
  // (undocumented)
  public execute(data: string): TaskError[];
}

// @alpha
enum Event {
  postRushBuild = 4,
  postRushInstall = 2,
  preRushBuild = 3,
  preRushInstall = 1
}

// @alpha
class EventHooks {
  public constructor(eventHooksJson: IEventHooksJson);
  public get(event: Event): string[];
}

// @public
interface IChangeFile {
  // (undocumented)
  changes: IChangeInfo[];
  // (undocumented)
  email: string;
  // (undocumented)
  packageName: string;
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

// @alpha
interface IEventHooksJson {
  postRushBuild?: string[];
}

// @alpha
class IndividualVersionPolicy extends VersionPolicy {
  // WARNING: The type "IIndividualVersionJson" needs to be exported by the package (e.g. added to index.ts)
  constructor(versionPolicyJson: IIndividualVersionJson);
  // (undocumented)
  public ensure(project: IPackageJson): IPackageJson | undefined;
  // (undocumented)
  public readonly lockedMajor: number | undefined;
}

// @public
interface IPackageJson {
  // (undocumented)
  [ key: string ]: any;
  dependencies?: {
    [ key: string ]: string
  }
  description?: string;
  devDependencies?: {
    [ key: string ]: string
  }
  name: string;
  optionalDependencies?: {
    [ key: string ]: string
  }
  private?: boolean;
  scripts?: {
    [ key: string ]: string
  }
  version: string;
}

// @public
interface IRushLinkJson {
  // (undocumented)
  localLinks: {
    [ name: string ]: string[]
  }
}

// @public
interface ISaveJsonFileOptions {
  onlyIfChanged?: boolean;
}

// @public
class JsonFile {
  public static loadJsonFile(jsonFilename: string): any;
  public static saveJsonFile(jsonData: any, jsonFilename: string, options: ISaveJsonFileOptions = {}): boolean;
}

// @alpha (undocumented)
class JsonSchemaValidator {
  // (undocumented)
  public static loadFromFile(schemaFilename: string): JsonSchemaValidator;
  // WARNING: The type "ValidateErrorCallback" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  public validateObject(jsonObject: Object, errorCallback: ValidateErrorCallback): void;
}

// @alpha
class LockStepVersionPolicy extends VersionPolicy {
  // WARNING: The type "ILockStepVersionJson" needs to be exported by the package (e.g. added to index.ts)
  constructor(versionPolicyJson: ILockStepVersionJson);
  // (undocumented)
  public ensure(project: IPackageJson): IPackageJson | undefined;
  // (undocumented)
  public readonly nextBump: BumpType;
  // (undocumented)
  public readonly version: semver.SemVer;
}

// @public (undocumented)
class Npm {
  // (undocumented)
  public static publishedVersions(packageName: string,
      cwd: string,
      env: { [key: string]: string }): string[];
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
  public readonly approvedPackagesPolicy: ApprovedPackagesPolicy;
  public readonly committedShrinkwrapFilename: string;
  public readonly commonFolder: string;
  public readonly commonRushConfigFolder: string;
  public readonly commonTempFolder: string;
  // @alpha
  public readonly eventHooks: EventHooks;
  public findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject;
  public findProjectByTempName(tempProjectName: string): RushConfigurationProject | undefined;
  public getProjectByName(projectName: string): RushConfigurationProject;
  // @alpha
  public getVersionPolicy(policyName: string): VersionPolicy;
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
  public readonly pinnedVersions: PinnedVersionsConfiguration;
  public readonly projectFolderMaxDepth: number;
  public readonly projectFolderMinDepth: number;
  // (undocumented)
  public readonly projects: RushConfigurationProject[];
  // (undocumented)
  public readonly projectsByName: Map<string, RushConfigurationProject>;
  public readonly rushJsonFolder: string;
  public readonly rushLinkJsonFilename: string;
  // @alpha
  public readonly telemetryEnabled: boolean;
  public readonly tempShrinkwrapFilename: string;
  // @alpha
  public readonly versionPolicies: Map<string, VersionPolicy>;
}

// @public
class RushConfigurationProject {
  // WARNING: The type "IRushConfigurationProjectJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(projectJson: IRushConfigurationProjectJson,
                rushConfiguration: RushConfiguration,
                tempProjectName: string);
  public readonly cyclicDependencyProjects: Set<string>;
  public readonly downstreamDependencyProjects: string[];
  public readonly packageJson: IPackageJson;
  public readonly packageName: string;
  public readonly projectFolder: string;
  public readonly projectRelativeFolder: string;
  public readonly reviewCategory: string;
  public readonly shouldPublish: boolean;
  public readonly tempPackageJsonFilename: string;
  public readonly tempProjectName: string;
  // @alpha
  public readonly versionPolicy: VersionPolicy;
}

// @public
module RushConstants {
  browserApprovedPackagesFilename: string = 'browser-approved-packages.json';

  changeFilesFolderName: string = 'changes';

  commonFolderName: string = 'common';

  nodeModulesFolderName: string = 'node_modules';

  nonbrowserApprovedPackagesFilename: string = 'nonbrowser-approved-packages.json';

  npmShrinkwrapFilename: string = 'npm-shrinkwrap.json';

  packageDepsFilename: string = 'package-deps.json';

  packageJsonFilename: string = 'package.json';

  pinnedVersionsFilename: string = 'pinned-versions.json';

  rushTempFolderName: string = 'temp';

  rushTempNpmScope: string = '@rush-temp';

  rushTempProjectsFolderName: string = 'projects';

}

// @public
class Stopwatch {
  constructor(getTime: () => number = Utilities.getTimeInMs);
  public readonly duration: number;
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
  public static escapeShellParameter(parameter: string): string;
  public static executeCommand(command: string, args: string[], workingDirectory: string,
      suppressOutput: boolean = false, environmentVariables?: { [key: string]: string }): void;
  public static executeCommandAndCaptureOutput(command: string, args: string[], workingDirectory: string,
      environmentVariables?: { [key: string]: string }): string;
  public static executeCommandAsync(command: string, args: string[], workingDirectory: string,
      environmentVariables?: { [key: string]: string }): child_process.ChildProcess;
  public static executeCommandWithRetry(command: string, args: string[], maxAttempts: number,
      workingDirectory: string, suppressOutput: boolean = false): void;
  // @alpha
  public static executeShellCommand(command: string,
      workingDirectory: string,
      environmentVariables?: { [key: string]: string },
      captureOutput: boolean = false): child_process.SpawnSyncReturns<Buffer>;
  // @alpha
  public static executeShellCommandAsync(command: string,
      workingDirectory: string,
      environmentVariables?: { [key: string]: string },
      captureOutput: boolean = false): child_process.ChildProcess;
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
  public static hasUncommittedChanges(): boolean;
}

// @public (undocumented)
class VersionMismatchFinder {
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

// @alpha
class VersionPolicy {
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  constructor(versionPolicyJson: IVersionPolicyJson);
  // (undocumented)
  public readonly baseType: BaseTypeName;
  // (undocumented)
  public abstract ensure(project: IPackageJson): IPackageJson | undefined;
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  // (undocumented)
  public static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy;
  // (undocumented)
  public readonly policyName: string;
}

// WARNING: Unsupported export: rushVersion
// WARNING: Unsupported export: TestErrorDetector
// WARNING: Unsupported export: TsErrorDetector
// WARNING: Unsupported export: TsLintErrorDetector
// (No packageDescription for this package)
