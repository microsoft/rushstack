// @public
class ApprovedPackagesConfiguration {
  public constructor(jsonFilename: string);
  // (undocumented)
  public addOrUpdatePackage(packageName: string, reviewCategory: string): void;
  public clear(): void;
  // (undocumented)
  public getItemByName(packageName: string): ApprovedPackagesItem | undefined;
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

// @beta
enum BumpType {
  // (undocumented)
  'major',
  // (undocumented)
  'minor',
  // (undocumented)
  'none',
  // (undocumented)
  'patch',
  // (undocumented)
  'preminor',
  // (undocumented)
  'prerelease'
}

// @public
class ChangeFile {
  // WARNING: The type "IChangeFile" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  public constructor(private _changeFileData: IChangeFile,
      private _rushConfiguration: RushConfiguration);
  public addChange(data: IChangeInfo): void;
  public generatePath(): string;
  public getChanges(packageName: string): IChangeInfo[];
  public writeSync(): void;
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

// @beta
enum Event {
  postRushBuild = 4,
  postRushInstall = 2,
  preRushBuild = 3,
  preRushInstall = 1
}

// @beta
class EventHooks {
  // WARNING: The type "IEventHooksJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  public constructor(eventHooksJson: IEventHooksJson);
  public get(event: Event): string[];
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

// @beta
class IndividualVersionPolicy extends VersionPolicy {
  // WARNING: The type "IIndividualVersionJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(versionPolicyJson: IIndividualVersionJson);
  // WARNING: The type "IIndividualVersionJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  public readonly _json: IIndividualVersionJson;
  public bump(bumpType?: BumpType, identifier?: string): void;
  public ensure(project: IPackageJson): IPackageJson | undefined;
  public readonly lockedMajor: number | undefined;
  public validate(versionString: string, packageName: string): void;
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

// @beta
class LockStepVersionPolicy extends VersionPolicy {
  // WARNING: The type "ILockStepVersionJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(versionPolicyJson: ILockStepVersionJson);
  // WARNING: The type "ILockStepVersionJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  public readonly _json: ILockStepVersionJson;
  public bump(bumpType?: BumpType, identifier?: string): void;
  public ensure(project: IPackageJson): IPackageJson | undefined;
  public readonly nextBump: BumpType;
  public validate(versionString: string, packageName: string): void;
  public readonly version: semver.SemVer;
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
  public get(dependency: string): string | undefined;
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
class Rush {
  public static launch(launcherVersion: string, isManaged: boolean): void;
  // @public
  public static readonly version: string;
}

// @public
class RushConfiguration {
  public readonly approvedPackagesPolicy: ApprovedPackagesPolicy;
  public readonly changesFolder: string;
  public readonly committedShrinkwrapFilename: string;
  public readonly commonFolder: string;
  public readonly commonRushConfigFolder: string;
  public readonly commonTempFolder: string;
  // @beta
  public readonly eventHooks: EventHooks;
  public findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject | undefined;
  public findProjectByTempName(tempProjectName: string): RushConfigurationProject | undefined;
  public static getHomeDirectory(): string;
  public getProjectByName(projectName: string): RushConfigurationProject | undefined;
  public readonly gitAllowedEmailRegExps: string[];
  public readonly gitSampleEmail: string;
  public readonly homeFolder: string;
  public static loadFromConfigurationFile(rushJsonFilename: string): RushConfiguration;
  // (undocumented)
  public static loadFromDefaultLocation(): RushConfiguration;
  public readonly npmCacheFolder: string;
  public readonly npmTmpFolder: string;
  public readonly packageManager: PackageManager;
  public readonly packageManagerToolFilename: string;
  public readonly packageManagerToolVersion: string;
  public readonly pinnedVersions: PinnedVersionsConfiguration;
  public readonly projectFolderMaxDepth: number;
  public readonly projectFolderMinDepth: number;
  // (undocumented)
  public readonly projects: RushConfigurationProject[];
  // (undocumented)
  public readonly projectsByName: Map<string, RushConfigurationProject>;
  public readonly repositoryUrl: string;
  public readonly rushJsonFile: string;
  public readonly rushJsonFolder: string;
  public readonly rushLinkJsonFilename: string;
  // @beta
  public readonly telemetryEnabled: boolean;
  public readonly tempShrinkwrapFilename: string;
  public static tryFindRushJsonLocation(verbose: boolean = true): string | undefined;
  // @beta (undocumented)
  public readonly versionPolicyConfiguration: VersionPolicyConfiguration;
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
  public readonly tempProjectName: string;
  public readonly unscopedTempProjectName: string;
  // @beta
  public readonly versionPolicy: VersionPolicy | undefined;
  // @beta
  public readonly versionPolicyName: string | undefined;
}

// @beta
class VersionPolicy {
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(versionPolicyJson: IVersionPolicyJson);
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  public readonly _json: IVersionPolicyJson;
  public abstract bump(bumpType?: BumpType, identifier?: string): void;
  public readonly definitionName: VersionPolicyDefinitionName;
  public abstract ensure(project: IPackageJson): IPackageJson | undefined;
  // WARNING: Because this definition is explicitly marked as @internal, an underscore prefix ("_") should be added to its name
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  public static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy | undefined;
  public readonly policyName: string;
  public abstract validate(versionString: string, packageName: string): void;
}

// @beta (undocumented)
class VersionPolicyConfiguration {
  // @internal
  public constructor(private _jsonFileName: string);
  public bump(versionPolicyName?: string,
      bumpType?: BumpType,
      identifier?: string,
      shouldCommit?: boolean): void;
  public getVersionPolicy(policyName: string): VersionPolicy;
  public readonly versionPolicies: Map<string, VersionPolicy>;
}

// @beta
enum VersionPolicyDefinitionName {
  // (undocumented)
  'individualVersion',
  // (undocumented)
  'lockStepVersion'
}

// WARNING: Unsupported export: PackageManager
