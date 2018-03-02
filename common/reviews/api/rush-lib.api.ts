// @internal
class _LastInstallFlag {
  constructor(folderPath: string, state?: Object);
  clear(): void;
  create(): void;
  isValid(): boolean;
  readonly path: string;
}

// @public
class ApprovedPackagesConfiguration {
  constructor(jsonFilename: string);
  // (undocumented)
  addOrUpdatePackage(packageName: string, reviewCategory: string): void;
  clear(): void;
  // (undocumented)
  getItemByName(packageName: string): ApprovedPackagesItem | undefined;
  // (undocumented)
  items: ApprovedPackagesItem[];
  loadFromFile(): void;
  saveToFile(): void;
  tryLoadFromFile(approvedPackagesPolicyEnabled: boolean): boolean;
}

// @public
class ApprovedPackagesItem {
  allowedCategories: Set<string>;
  packageName: string;
}

// @public
class ApprovedPackagesPolicy {
  // WARNING: The type "IRushConfigurationJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(rushConfiguration: RushConfiguration, rushConfigurationJson: IRushConfigurationJson);
  readonly browserApprovedPackages: ApprovedPackagesConfiguration;
  readonly enabled: boolean;
  readonly ignoredNpmScopes: Set<string>;
  readonly nonbrowserApprovedPackages: ApprovedPackagesConfiguration;
  readonly reviewCategories: Set<string>;
}

// @beta
enum BumpType {
  // (undocumented)
  'major' = 5,
  // (undocumented)
  'minor' = 4,
  // (undocumented)
  'none' = 0,
  // (undocumented)
  'patch' = 2,
  // (undocumented)
  'preminor' = 3,
  // (undocumented)
  'prerelease' = 1
}

// @public
class ChangeFile {
  // WARNING: The type "IChangeFile" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(_changeFileData: IChangeFile, _rushConfiguration: RushConfiguration);
  addChange(data: IChangeInfo): void;
  generatePath(): string;
  getChanges(packageName: string): IChangeInfo[];
  writeSync(): void;
}

// @public
enum ChangeType {
  // (undocumented)
  dependency = 1,
  // (undocumented)
  hotfix = 2,
  // (undocumented)
  major = 5,
  // (undocumented)
  minor = 4,
  // (undocumented)
  none = 0,
  // (undocumented)
  patch = 3
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
  constructor(eventHooksJson: IEventHooksJson);
  get(event: Event): string[];
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
  readonly _json: IIndividualVersionJson;
  bump(bumpType?: BumpType, identifier?: string): void;
  ensure(project: IPackageJson): IPackageJson | undefined;
  readonly lockedMajor: number | undefined;
  validate(versionString: string, packageName: string): void;
}

// @public
interface IPackageJson {
  [key: string]: any;
  dependencies?: {
    [key: string]: string;
  }
  description?: string;
  devDependencies?: {
    [key: string]: string;
  }
  name: string;
  optionalDependencies?: {
    [key: string]: string;
  }
  private?: boolean;
  scripts?: {
    [key: string]: string;
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
  readonly _json: ILockStepVersionJson;
  bump(bumpType?: BumpType, identifier?: string): void;
  ensure(project: IPackageJson): IPackageJson | undefined;
  readonly mainProject: string | undefined;
  readonly nextBump: BumpType;
  validate(versionString: string, packageName: string): void;
  readonly version: semver.SemVer;
}

// @public
class PinnedVersionsConfiguration {
  // (undocumented)
  clear(): this;
  // (undocumented)
  delete(dependency: string): boolean;
  // (undocumented)
  forEach(cb: (version: string, dependency: string) => void): this;
  // (undocumented)
  get(dependency: string): string | undefined;
  // (undocumented)
  has(dependency: string): boolean;
  // (undocumented)
  save(): this;
  set(dependency: string, version: string): this;
  // (undocumented)
  readonly size: number;
  static tryLoadFromFile(jsonFilename: string): PinnedVersionsConfiguration;
}

// @public
class Rush {
  static launch(launcherVersion: string, isManaged: boolean): void;
  // @public
  static readonly version: string;
}

// @public
class RushConfiguration {
  readonly approvedPackagesPolicy: ApprovedPackagesPolicy;
  readonly changesFolder: string;
  readonly committedShrinkwrapFilename: string;
  readonly commonFolder: string;
  readonly commonRushConfigFolder: string;
  readonly commonTempFolder: string;
  // @beta
  readonly eventHooks: EventHooks;
  findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject | undefined;
  findProjectByTempName(tempProjectName: string): RushConfigurationProject | undefined;
  static getHomeDirectory(): string;
  getProjectByName(projectName: string): RushConfigurationProject | undefined;
  readonly gitAllowedEmailRegExps: string[];
  readonly gitSampleEmail: string;
  readonly homeFolder: string;
  readonly hotfixChangeEnabled: boolean;
  static loadFromConfigurationFile(rushJsonFilename: string): RushConfiguration;
  // (undocumented)
  static loadFromDefaultLocation(): RushConfiguration;
  readonly npmCacheFolder: string;
  readonly npmTmpFolder: string;
  readonly packageManager: PackageManager;
  readonly packageManagerToolFilename: string;
  readonly packageManagerToolVersion: string;
  readonly pinnedVersions: PinnedVersionsConfiguration;
  readonly pnpmStoreFolder: string;
  readonly projectFolderMaxDepth: number;
  readonly projectFolderMinDepth: number;
  // (undocumented)
  readonly projects: RushConfigurationProject[];
  // (undocumented)
  readonly projectsByName: Map<string, RushConfigurationProject>;
  readonly repositoryUrl: string;
  readonly rushJsonFile: string;
  readonly rushJsonFolder: string;
  readonly rushLinkJsonFilename: string;
  // @beta
  readonly telemetryEnabled: boolean;
  readonly tempShrinkwrapFilename: string;
  static tryFindRushJsonLocation(verbose?: boolean): string | undefined;
  // @beta (undocumented)
  readonly versionPolicyConfiguration: VersionPolicyConfiguration;
}

// @public
class RushConfigurationProject {
  // WARNING: The type "IRushConfigurationProjectJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(projectJson: IRushConfigurationProjectJson, rushConfiguration: RushConfiguration, tempProjectName: string);
  readonly cyclicDependencyProjects: Set<string>;
  readonly downstreamDependencyProjects: string[];
  // @beta
  readonly isMainProject: boolean;
  readonly packageJson: IPackageJson;
  readonly packageName: string;
  readonly projectFolder: string;
  readonly projectRelativeFolder: string;
  readonly reviewCategory: string;
  readonly shouldPublish: boolean;
  readonly skipRushCheck: boolean;
  readonly tempProjectName: string;
  readonly unscopedTempProjectName: string;
  // @beta
  readonly versionPolicy: VersionPolicy | undefined;
  // @beta
  readonly versionPolicyName: string | undefined;
}

// @beta
class VersionPolicy {
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  constructor(versionPolicyJson: IVersionPolicyJson);
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  readonly _json: IVersionPolicyJson;
  abstract bump(bumpType?: BumpType, identifier?: string): void;
  readonly definitionName: VersionPolicyDefinitionName;
  abstract ensure(project: IPackageJson): IPackageJson | undefined;
  readonly isLockstepped: boolean;
  // WARNING: Because this definition is explicitly marked as @internal, an underscore prefix ("_") should be added to its name
  // WARNING: The type "IVersionPolicyJson" needs to be exported by the package (e.g. added to index.ts)
  // @internal
  static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy | undefined;
  readonly policyName: string;
  abstract validate(versionString: string, packageName: string): void;
}

// @beta (undocumented)
class VersionPolicyConfiguration {
  // @internal
  constructor(_jsonFileName: string);
  bump(versionPolicyName?: string, bumpType?: BumpType, identifier?: string, shouldCommit?: boolean): void;
  getVersionPolicy(policyName: string): VersionPolicy;
  validate(projectsByName: Map<string, RushConfigurationProject>): void;
  readonly versionPolicies: Map<string, VersionPolicy>;
}

// @beta
enum VersionPolicyDefinitionName {
  // (undocumented)
  'individualVersion' = 1,
  // (undocumented)
  'lockStepVersion' = 0
}

// WARNING: Unsupported export: PackageManager
