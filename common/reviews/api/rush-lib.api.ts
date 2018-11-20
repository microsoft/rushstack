// @public
declare class ApprovedPackagesConfiguration {
    // (undocumented)
    constructor(jsonFilename: string);
    private _addItem;
    private _addItemJson;
    // (undocumented)
    addOrUpdatePackage(packageName: string, reviewCategory: string): void;
    clear(): void;
    // (undocumented)
    getItemByName(packageName: string): ApprovedPackagesItem | undefined;
    // (undocumented)
    items: ApprovedPackagesItem[];
    // (undocumented)
    private _itemsByName;
    // (undocumented)
    private _jsonFilename;
    // (undocumented)
    private static _jsonSchema;
    // (undocumented)
    private _loadedJson;
    loadFromFile(): void;
    saveToFile(): void;
    tryLoadFromFile(approvedPackagesPolicyEnabled: boolean): boolean;
}

// @public
declare class ApprovedPackagesItem {
    allowedCategories: Set<string>;
    packageName: string;
}

// @public
declare class ApprovedPackagesPolicy {
    // @internal (undocumented)
    constructor(rushConfiguration: RushConfiguration, rushConfigurationJson: IRushConfigurationJson);
    readonly browserApprovedPackages: ApprovedPackagesConfiguration;
    // (undocumented)
    private _browserApprovedPackages;
    readonly enabled: boolean;
    // (undocumented)
    private _enabled;
    readonly ignoredNpmScopes: Set<string>;
    // (undocumented)
    private _ignoredNpmScopes;
    readonly nonbrowserApprovedPackages: ApprovedPackagesConfiguration;
    // (undocumented)
    private _nonbrowserApprovedPackages;
    readonly reviewCategories: Set<string>;
    // (undocumented)
    private _reviewCategories;
}

// @beta
declare enum BumpType {
    ,
    ,
    ,
    ,
    ,
    // (undocumented)
    'major' = 5
// (undocumented)
    'minor' = 4// (undocumented)
    'none' = 0// (undocumented)
    'patch' = 2// (undocumented)
    'preminor' = 3// (undocumented)
    'prerelease' = 1
}

// @public
declare class ChangeManager {
    static createEmptyChangeFiles(rushConfiguration: RushConfiguration, projectName: string, emailAddress: string): string | undefined;
}

// @public
declare class CommonVersionsConfiguration {
    // (undocumented)
    private constructor();
    readonly allowedAlternativeVersions: Map<string, ReadonlyArray<string>>;
    // (undocumented)
    private _allowedAlternativeVersions;
    // (undocumented)
    private static _deserializeTable;
    readonly filePath: string;
    // (undocumented)
    private _filePath;
    getAllPreferredVersions(): Map<string, string>;
    // (undocumented)
    private static _jsonSchema;
    static loadFromFile(jsonFilename: string): CommonVersionsConfiguration;
    // (undocumented)
    private _onSetAllowedAlternativeVersions;
    // (undocumented)
    private _onSetPreferredVersions;
    readonly preferredVersions: Map<string, string>;
    // (undocumented)
    private _preferredVersions;
    save(): void;
    // (undocumented)
    private _serialize;
    // (undocumented)
    private static _serializeTable;
    readonly xstitchPreferredVersions: Map<string, string>;
    // (undocumented)
    private _xstitchPreferredVersions;
}

// @beta (undocumented)
declare const enum DependencyType {
    // (undocumented)
    Regular = "dependencies",
    // (undocumented)
    Dev = "devDependencies",
    // (undocumented)
    Optional = "optionalDependencies",
    // (undocumented)
    Peer = "peerDependencies"
}

// @public
declare const enum EnvironmentVariableNames {
    RUSH_TEMP_FOLDER = "RUSH_TEMP_FOLDER",
    RUSH_PREVIEW_VERSION = "RUSH_PREVIEW_VERSION",
    RUSH_VARIANT = "RUSH_VARIANT"
}

// @beta
declare enum Event {
    preRushInstall = 1,
    postRushInstall = 2,
    preRushBuild = 3,
    postRushBuild = 4
}

// @beta
declare class EventHooks {
    // @internal (undocumented)
    constructor(eventHooksJson: IEventHooksJson);
    get(event: Event): string[];
    // (undocumented)
    private _hooks;
}

// @beta
declare class IndividualVersionPolicy extends VersionPolicy {
    // @internal (undocumented)
    constructor(versionPolicyJson: IIndividualVersionJson);
    bump(bumpType?: BumpType, identifier?: string): void;
    ensure(project: IPackageJson, force?: boolean): IPackageJson | undefined;
    // @internal
    readonly _json: IIndividualVersionJson;
    readonly lockedMajor: number | undefined;
    // (undocumented)
    private _lockedMajor;
    validate(versionString: string, packageName: string): void;
}

// @internal
declare class _LastInstallFlag {
    constructor(folderPath: string, state?: Object);
    clear(): void;
    create(): void;
    isValid(): boolean;
    readonly path: string;
    // (undocumented)
    private _path;
    // (undocumented)
    private _state;
}

// @beta
declare class LockStepVersionPolicy extends VersionPolicy {
    // @internal (undocumented)
    constructor(versionPolicyJson: ILockStepVersionJson);
    bump(bumpType?: BumpType, identifier?: string): void;
    ensure(project: IPackageJson, force?: boolean): IPackageJson | undefined;
    // (undocumented)
    private _getReleaseType;
    // @internal
    readonly _json: ILockStepVersionJson;
    readonly mainProject: string | undefined;
    // (undocumented)
    private _mainProject;
    readonly nextBump: BumpType;
    // (undocumented)
    private _nextBump;
    update(newVersionString: string): boolean;
    // (undocumented)
    private _updatePackageVersion;
    validate(versionString: string, packageName: string): void;
    readonly version: string;
    // (undocumented)
    private _version;
}

// @beta (undocumented)
declare class PackageJsonDependency {
    // (undocumented)
    constructor(name: string, version: string, type: DependencyType, onChange: () => void);
    // (undocumented)
    readonly dependencyType: DependencyType;
    // (undocumented)
    readonly name: string;
    // (undocumented)
    private _name;
    // (undocumented)
    private _onChange;
    // (undocumented)
    setVersion(newVersion: string): void;
    // (undocumented)
    private _type;
    // (undocumented)
    readonly version: string;
    // (undocumented)
    private _version;
}

// @beta (undocumented)
declare class PackageJsonEditor {
    // (undocumented)
    private constructor();
    // (undocumented)
    addOrUpdateDependency(packageName: string, newVersion: string, dependencyType: DependencyType): void;
    // (undocumented)
    private readonly _data;
    // (undocumented)
    private readonly _dependencies;
    readonly dependencyList: ReadonlyArray<PackageJsonDependency>;
    // (undocumented)
    private readonly _devDependencies;
    readonly devDependencyList: ReadonlyArray<PackageJsonDependency>;
    // (undocumented)
    readonly filePath: string;
    // (undocumented)
    private readonly _filePath;
    // (undocumented)
    static fromObject(object: IPackageJson, filename: string): PackageJsonEditor;
    // (undocumented)
    static load(filePath: string): PackageJsonEditor;
    // (undocumented)
    private _modified;
    // (undocumented)
    readonly name: string;
    // (undocumented)
    private _normalize;
    // (undocumented)
    private _onChange;
    // (undocumented)
    saveIfModified(): boolean;
    // (undocumented)
    tryGetDependency(packageName: string): PackageJsonDependency | undefined;
    // (undocumented)
    tryGetDevDependency(packageName: string): PackageJsonDependency | undefined;
    // (undocumented)
    readonly version: string;
}

// @public
declare type PackageManager = 'pnpm' | 'npm' | 'yarn';

// @public
declare class PnpmOptionsConfiguration {
    // @internal (undocumented)
    constructor(json: IPnpmOptionsJson);
    readonly strictPeerDependencies: boolean;
}

// @public
declare class Rush {
    static launch(launcherVersion: string, isManaged: boolean): void;
    static launchRushX(launcherVersion: string, isManaged: boolean): void;
    // (undocumented)
    private static _printStartupBanner;
    static readonly version: string;
    // (undocumented)
    private static _version;
}

// @public
declare class RushConfiguration {
    private constructor();
    readonly approvedPackagesPolicy: ApprovedPackagesPolicy;
    // (undocumented)
    private _approvedPackagesPolicy;
    readonly changesFolder: string;
    // (undocumented)
    private _changesFolder;
    // @deprecated
    readonly committedShrinkwrapFilename: string;
    readonly commonFolder: string;
    // (undocumented)
    private _commonFolder;
    readonly commonRushConfigFolder: string;
    // (undocumented)
    private _commonRushConfigFolder;
    readonly commonScriptsFolder: string;
    // (undocumented)
    private _commonScriptsFolder;
    readonly commonTempFolder: string;
    // (undocumented)
    private _commonTempFolder;
    // @deprecated
    readonly commonVersions: CommonVersionsConfiguration;
    readonly currentInstalledVariant: string | undefined;
    readonly currentVariantJsonFilename: string;
    // (undocumented)
    private _currentVariantJsonFilename;
    readonly ensureConsistentVersions: boolean;
    // (undocumented)
    private _ensureConsistentVersions;
    // @beta
    readonly eventHooks: EventHooks;
    // (undocumented)
    private _eventHooks;
    findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject | undefined;
    findProjectByTempName(tempProjectName: string): RushConfigurationProject | undefined;
    private static _generateTempNamesForProjects;
    getCommittedShrinkwrapFilename(variant?: string | undefined): string;
    getCommonVersions(variant?: string | undefined): CommonVersionsConfiguration;
    getPnpmfilePath(variant?: string | undefined): string;
    getProjectByName(projectName: string): RushConfigurationProject | undefined;
    // (undocumented)
    private _getVariantConfigFolderPath;
    readonly gitAllowedEmailRegExps: string[];
    // (undocumented)
    private _gitAllowedEmailRegExps;
    readonly gitSampleEmail: string;
    // (undocumented)
    private _gitSampleEmail;
    readonly hotfixChangeEnabled: boolean;
    // (undocumented)
    private _hotfixChangeEnabled;
    // (undocumented)
    private static _jsonSchema;
    static loadFromConfigurationFile(rushJsonFilename: string): RushConfiguration;
    // (undocumented)
    static loadFromDefaultLocation(): RushConfiguration;
    readonly npmCacheFolder: string;
    // (undocumented)
    private _npmCacheFolder;
    readonly npmTmpFolder: string;
    // (undocumented)
    private _npmTmpFolder;
    readonly packageManager: PackageManager;
    // (undocumented)
    private _packageManager;
    readonly packageManagerToolFilename: string;
    // (undocumented)
    private _packageManagerToolFilename;
    readonly packageManagerToolVersion: string;
    // (undocumented)
    private _packageManagerToolVersion;
    // (undocumented)
    readonly pnpmOptions: PnpmOptionsConfiguration;
    // (undocumented)
    private _pnpmOptions;
    readonly pnpmStoreFolder: string;
    // (undocumented)
    private _pnpmStoreFolder;
    // (undocumented)
    private _populateDownstreamDependencies;
    readonly projectFolderMaxDepth: number;
    // (undocumented)
    private _projectFolderMaxDepth;
    readonly projectFolderMinDepth: number;
    // (undocumented)
    private _projectFolderMinDepth;
    // (undocumented)
    readonly projects: RushConfigurationProject[];
    // (undocumented)
    private _projects;
    // (undocumented)
    readonly projectsByName: Map<string, RushConfigurationProject>;
    // (undocumented)
    private _projectsByName;
    readonly repositoryUrl: string;
    // (undocumented)
    private _repositoryUrl;
    readonly rushJsonFile: string;
    // (undocumented)
    private _rushJsonFile;
    readonly rushJsonFolder: string;
    // (undocumented)
    private _rushJsonFolder;
    readonly rushLinkJsonFilename: string;
    // (undocumented)
    private _rushLinkJsonFilename;
    readonly rushUserFolder: string;
    // (undocumented)
    private _rushUserFolder;
    readonly shrinkwrapFilePhrase: string;
    // @beta
    readonly telemetryEnabled: boolean;
    // (undocumented)
    private _telemetryEnabled;
    readonly tempShrinkwrapFilename: string;
    // (undocumented)
    private _tempShrinkwrapFilename;
    readonly tempShrinkwrapPreinstallFilename: string;
    // (undocumented)
    private _tempShrinkwrapPreinstallFilename;
    static tryFindRushJsonLocation(verbose?: boolean): string | undefined;
    tryGetProjectForPath(currentFolderPath: string): RushConfigurationProject | undefined;
    private static _validateCommonRushConfigFolder;
    // (undocumented)
    private _variants;
    // @beta (undocumented)
    readonly versionPolicyConfiguration: VersionPolicyConfiguration;
    // (undocumented)
    private _versionPolicyConfiguration;
    readonly yarnCacheFolder: string;
    // (undocumented)
    private _yarnCacheFolder;
}

// @public
declare class RushConfigurationProject {
    // @internal (undocumented)
    constructor(projectJson: IRushConfigurationProjectJson, rushConfiguration: RushConfiguration, tempProjectName: string);
    readonly cyclicDependencyProjects: Set<string>;
    // (undocumented)
    private _cyclicDependencyProjects;
    readonly downstreamDependencyProjects: string[];
    // (undocumented)
    private _downstreamDependencyProjects;
    // @beta
    readonly isMainProject: boolean;
    // @deprecated
    readonly packageJson: IPackageJson;
    // (undocumented)
    private _packageJson;
    // @beta
    readonly packageJsonEditor: PackageJsonEditor;
    // (undocumented)
    private _packageJsonEditor;
    readonly packageName: string;
    // (undocumented)
    private _packageName;
    readonly projectFolder: string;
    // (undocumented)
    private _projectFolder;
    readonly projectRelativeFolder: string;
    // (undocumented)
    private _projectRelativeFolder;
    readonly reviewCategory: string;
    // (undocumented)
    private _reviewCategory;
    // (undocumented)
    private readonly _rushConfiguration;
    readonly shouldPublish: boolean;
    // (undocumented)
    private _shouldPublish;
    readonly skipRushCheck: boolean;
    // (undocumented)
    private _skipRushCheck;
    readonly tempProjectName: string;
    // (undocumented)
    private _tempProjectName;
    readonly unscopedTempProjectName: string;
    // (undocumented)
    private _unscopedTempProjectName;
    // @beta
    readonly versionPolicy: VersionPolicy | undefined;
    // (undocumented)
    private _versionPolicy;
    // @beta
    readonly versionPolicyName: string | undefined;
    // (undocumented)
    private _versionPolicyName;
}

// @beta
declare abstract class VersionPolicy {
    // @internal (undocumented)
    constructor(versionPolicyJson: IVersionPolicyJson);
    abstract bump(bumpType?: BumpType, identifier?: string): void;
    readonly definitionName: VersionPolicyDefinitionName;
    // (undocumented)
    private _definitionName;
    abstract ensure(project: IPackageJson, force?: boolean): IPackageJson | undefined;
    readonly isLockstepped: boolean;
    // @internal
    abstract readonly _json: IVersionPolicyJson;
    // @internal
    static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy | undefined;
    readonly policyName: string;
    // (undocumented)
    private _policyName;
    abstract validate(versionString: string, packageName: string): void;
}

// @beta
declare class VersionPolicyConfiguration {
    // @internal (undocumented)
    constructor(jsonFileName: string);
    bump(versionPolicyName?: string, bumpType?: BumpType, identifier?: string, shouldCommit?: boolean): void;
    getVersionPolicy(policyName: string): VersionPolicy;
    // (undocumented)
    private _jsonFileName;
    // (undocumented)
    private static _jsonSchema;
    // (undocumented)
    private _loadFile;
    // (undocumented)
    private _saveFile;
    update(versionPolicyName: string, newVersion: string): void;
    validate(projectsByName: Map<string, RushConfigurationProject>): void;
    readonly versionPolicies: Map<string, VersionPolicy>;
    // (undocumented)
    private _versionPolicies;
}

// @beta
declare enum VersionPolicyDefinitionName {
    // (undocumented)
    'lockStepVersion' = 0,
    // (undocumented)
    'individualVersion' = 1
}

