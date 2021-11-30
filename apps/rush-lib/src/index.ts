// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A library for writing scripts that interact with the {@link https://rushjs.io/ | Rush} tool.
 * @packageDocumentation
 */

export { ApprovedPackagesPolicy } from './api/ApprovedPackagesPolicy';

export {
  RushConfiguration,
  ITryFindRushJsonLocationOptions,
  IPackageManagerOptionsJsonBase,
  IConfigurationEnvironment,
  IConfigurationEnvironmentVariable,
  INpmOptionsJson as _INpmOptionsJson,
  IPnpmOptionsJson as _IPnpmOptionsJson,
  IYarnOptionsJson as _IYarnOptionsJson,
  PnpmStoreOptions,
  PackageManagerOptionsConfigurationBase,
  PnpmOptionsConfiguration,
  NpmOptionsConfiguration,
  YarnOptionsConfiguration
} from './api/RushConfiguration';

export {
  EnvironmentConfiguration,
  EnvironmentVariableNames,
  IEnvironmentConfigurationInitializeOptions
} from './api/EnvironmentConfiguration';

export { RushConstants } from './logic/RushConstants';

export { PackageManagerName, PackageManager } from './api/packageManager/PackageManager';

export { RushConfigurationProject } from './api/RushConfigurationProject';

export { RushUserConfiguration } from './api/RushUserConfiguration';

export { RushGlobalFolder as _RushGlobalFolder } from './api/RushGlobalFolder';

export { ApprovedPackagesItem, ApprovedPackagesConfiguration } from './api/ApprovedPackagesConfiguration';

export { CommonVersionsConfiguration } from './api/CommonVersionsConfiguration';

export { PackageJsonEditor, PackageJsonDependency, DependencyType } from './api/PackageJsonEditor';

export { RepoStateFile } from './logic/RepoStateFile';

export { LookupByPath } from './logic/LookupByPath';
export { EventHooks, Event } from './api/EventHooks';

export { ChangeManager } from './api/ChangeManager';

export { LastInstallFlag as _LastInstallFlag } from './api/LastInstallFlag';

export {
  VersionPolicyDefinitionName,
  BumpType,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  VersionPolicy
} from './api/VersionPolicy';

export { VersionPolicyConfiguration } from './api/VersionPolicyConfiguration';

export { ILaunchOptions, Rush } from './api/Rush';

export { ExperimentsConfiguration, IExperimentsJson } from './api/ExperimentsConfiguration';

export { ProjectChangeAnalyzer, IGetChangedProjectsOptions } from './logic/ProjectChangeAnalyzer';

export {
  RushSession,
  IRushSessionOptions,
  CloudBuildCacheProviderFactory
} from './pluginFramework/RushSession';

export { RushLifecycleHooks } from './pluginFramework/RushLifeCycle';

export { IRushPlugin } from './pluginFramework/IRushPlugin';
export { ILogger } from './pluginFramework/logging/Logger';

export { ICloudBuildCacheProvider } from './logic/buildCache/ICloudBuildCacheProvider';

export { ICredentialCacheOptions, ICredentialCacheEntry, CredentialCache } from './logic/CredentialCache';
