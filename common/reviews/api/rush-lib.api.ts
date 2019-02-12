// @public
declare class ApprovedPackagesConfiguration {
    // (undocumented)
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
declare class ApprovedPackagesItem {
    allowedCategories: Set<string>;
    packageName: string;
}

// @public
declare class ApprovedPackagesPolicy {
    // @internal (undocumented)
    constructor(rushConfiguration: RushConfiguration, rushConfigurationJson: IRushConfigurationJson);
    readonly browserApprovedPackages: ApprovedPackagesConfiguration;
    readonly enabled: boolean;
    readonly ignoredNpmScopes: Set<string>;
    readonly nonbrowserApprovedPackages: ApprovedPackagesConfiguration;
    readonly reviewCategories: Set<string>;
    }

// @beta
declare enum BumpType {
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
declare class ChangeManager {
    static createEmptyChangeFiles(rushConfiguration: RushConfiguration, projectName: string, emailAddress: string): string | undefined;
}

// @public
declare class CommonVersionsConfiguration {
    readonly allowedAlternativeVersions: Map<string, ReadonlyArray<string>>;
    readonly filePath: string;
    getAllPreferredVersions(): Map<string, string>;
    static loadFromFile(jsonFilename: string): CommonVersionsConfiguration;
    readonly preferredVersions: Map<string, string>;
    save(): void;
    readonly xstitchPreferredVersions: Map<string, string>;
    }

// @beta (undocumented)
declare const enum DependencyType {
    // (undocumented)
    Dev = "devDependencies",
    // (undocumented)
    Optional = "optionalDependencies",
    // (undocumented)
    Peer = "peerDependencies",
    // (undocumented)
    Regular = "dependencies"
}

// @public
declare const enum EnvironmentVariableNames {
    RUSH_ABSOLUTE_SYMLINKS = "RUSH_ABSOLUTE_SYMLINKS",
    RUSH_PREVIEW_VERSION = "RUSH_PREVIEW_VERSION",
    RUSH_TEMP_FOLDER = "RUSH_TEMP_FOLDER",
    RUSH_VARIANT = "RUSH_VARIANT"
}

// @beta
declare enum Event {
    postRushBuild = 4,
    postRushInstall = 2,
    preRushBuild = 3,
    preRushInstall = 1
}

// @beta
declare class EventHooks {
    // @internal (undocumented)
    constructor(eventHooksJson: IEventHooksJson);
    get(event: Event): string[];
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
    validate(versionString: string, packageName: string): void;
}

// @internal
declare class _LastInstallFlag {
    constructor(folderPath: string, state?: Object);
    clear(): void;
    create(): void;
    isValid(): boolean;
    readonly path: string;
    }

// @beta
declare class LockStepVersionPolicy extends VersionPolicy {
    // @internal (undocumented)
    constructor(versionPolicyJson: ILockStepVersionJson);
    bump(bumpType?: BumpType, identifier?: string): void;
    ensure(project: IPackageJson, force?: boolean): IPackageJson | undefined;
    // @internal
    readonly _json: ILockStepVersionJson;
    readonly mainProject: string | undefined;
    readonly nextBump: BumpType;
    update(newVersionString: string): boolean;
    validate(versionString: string, packageName: string): void;
    readonly version: string;
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
    setVersion(newVersion: string): void;
    // (undocumented)
    readonly version: string;
    }

// @beta (undocumented)
declare class PackageJsonEditor {
    // (undocumented)
    addOrUpdateDependency(packageName: string, newVersion: string, dependencyType: DependencyType): void;
    readonly dependencyList: ReadonlyArray<PackageJsonDependency>;
    readonly devDependencyList: ReadonlyArray<PackageJsonDependency>;
    // (undocumented)
    readonly filePath: string;
    // (undocumented)
    static fromObject(object: IPackageJson, filename: string): PackageJsonEditor;
    // (undocumented)
    static load(filePath: string): PackageJsonEditor;
    // (undocumented)
    readonly name: string;
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
    static readonly version: string;
}

// @public
declare class RushConfiguration {
    readonly approvedPackagesPolicy: ApprovedPackagesPolicy;
    readonly changesFolder: string;
    // @deprecated
    readonly committedShrinkwrapFilename: string;
    readonly commonFolder: string;
    readonly commonRushConfigFolder: string;
    readonly commonScriptsFolder: string;
    readonly commonTempFolder: string;
    // @deprecated
    readonly commonVersions: CommonVersionsConfiguration;
    readonly currentInstalledVariant: string | undefined;
    readonly currentVariantJsonFilename: string;
    readonly ensureConsistentVersions: boolean;
    // @beta
    readonly eventHooks: EventHooks;
    findProjectByShorthandName(shorthandProjectName: string): RushConfigurationProject | undefined;
    findProjectByTempName(tempProjectName: string): RushConfigurationProject | undefined;
    getCommittedShrinkwrapFilename(variant?: string | undefined): string;
    getCommonVersions(variant?: string | undefined): CommonVersionsConfiguration;
    getPnpmfilePath(variant?: string | undefined): string;
    getProjectByName(projectName: string): RushConfigurationProject | undefined;
    readonly gitAllowedEmailRegExps: string[];
    readonly gitSampleEmail: string;
    readonly hotfixChangeEnabled: boolean;
    static loadFromConfigurationFile(rushJsonFilename: string): RushConfiguration;
    // (undocumented)
    static loadFromDefaultLocation(): RushConfiguration;
    readonly npmCacheFolder: string;
    readonly npmTmpFolder: string;
    readonly packageManager: PackageManager;
    readonly packageManagerToolFilename: string;
    readonly packageManagerToolVersion: string;
    // (undocumented)
    readonly pnpmOptions: PnpmOptionsConfiguration;
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
    readonly shrinkwrapFilePhrase: string;
    readonly storeLooseVersions: boolean;
    // @beta
    readonly telemetryEnabled: boolean;
    readonly tempShrinkwrapFilename: string;
    readonly tempShrinkwrapPreinstallFilename: string;
    static tryFindRushJsonLocation(verbose?: boolean): string | undefined;
    tryGetProjectForPath(currentFolderPath: string): RushConfigurationProject | undefined;
    // @beta (undocumented)
    readonly versionPolicyConfiguration: VersionPolicyConfiguration;
    readonly yarnCacheFolder: string;
    // (undocumented)
    readonly yarnOptions: YarnOptionsConfiguration;
    }

// @public
declare class RushConfigurationProject {
    // @internal (undocumented)
    constructor(projectJson: IRushConfigurationProjectJson, rushConfiguration: RushConfiguration, tempProjectName: string);
    readonly cyclicDependencyProjects: Set<string>;
    readonly downstreamDependencyProjects: string[];
    // @beta
    readonly isMainProject: boolean;
    // @deprecated
    readonly packageJson: IPackageJson;
    // @beta
    readonly packageJsonEditor: PackageJsonEditor;
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

// @internal
declare class _RushGlobalFolder {
    // (undocumented)
    constructor();
    readonly nodeSpecificPath: string;
    readonly path: string;
    }

// @beta
declare abstract class VersionPolicy {
    // @internal (undocumented)
    constructor(versionPolicyJson: IVersionPolicyJson);
    abstract bump(bumpType?: BumpType, identifier?: string): void;
    readonly definitionName: VersionPolicyDefinitionName;
    abstract ensure(project: IPackageJson, force?: boolean): IPackageJson | undefined;
    readonly isLockstepped: boolean;
    // @internal
    abstract readonly _json: IVersionPolicyJson;
    // @internal
    static load(versionPolicyJson: IVersionPolicyJson): VersionPolicy | undefined;
    readonly policyName: string;
    abstract validate(versionString: string, packageName: string): void;
}

// @beta
declare class VersionPolicyConfiguration {
    // @internal (undocumented)
    constructor(jsonFileName: string);
    bump(versionPolicyName?: string, bumpType?: BumpType, identifier?: string, shouldCommit?: boolean): void;
    getVersionPolicy(policyName: string): VersionPolicy;
    update(versionPolicyName: string, newVersion: string): void;
    validate(projectsByName: Map<string, RushConfigurationProject>): void;
    readonly versionPolicies: Map<string, VersionPolicy>;
    }

// @beta
declare enum VersionPolicyDefinitionName {
    // (undocumented)
    'individualVersion' = 1,
    // (undocumented)
    'lockStepVersion' = 0
}

// @public
declare class YarnOptionsConfiguration {
    // @internal (undocumented)
    constructor(json: IYarnOptionsJson);
    readonly ignoreEngines: boolean;
}

