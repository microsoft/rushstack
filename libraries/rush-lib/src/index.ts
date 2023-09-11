// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * A library for writing scripts that interact with the {@link https://rushjs.io/ | Rush} tool.
 * @packageDocumentation
 */

export { ApprovedPackagesPolicy } from './api/ApprovedPackagesPolicy';

export { RushConfiguration, ITryFindRushJsonLocationOptions } from './api/RushConfiguration';

export {
  IPackageManagerOptionsJsonBase,
  IConfigurationEnvironment,
  IConfigurationEnvironmentVariable,
  PackageManagerOptionsConfigurationBase
} from './logic/base/BasePackageManagerOptionsConfiguration';
export {
  INpmOptionsJson as _INpmOptionsJson,
  NpmOptionsConfiguration
} from './logic/npm/NpmOptionsConfiguration';
export {
  IYarnOptionsJson as _IYarnOptionsJson,
  YarnOptionsConfiguration
} from './logic/yarn/YarnOptionsConfiguration';
export {
  IPnpmOptionsJson as _IPnpmOptionsJson,
  PnpmStoreLocation,
  PnpmStoreOptions,
  PnpmOptionsConfiguration
} from './logic/pnpm/PnpmOptionsConfiguration';

export { BuildCacheConfiguration } from './api/BuildCacheConfiguration';
export { CobuildConfiguration, ICobuildJson } from './api/CobuildConfiguration';
export { GetCacheEntryIdFunction, IGenerateCacheEntryIdOptions } from './logic/buildCache/CacheEntryId';
export {
  FileSystemBuildCacheProvider,
  IFileSystemBuildCacheProviderOptions
} from './logic/buildCache/FileSystemBuildCacheProvider';

export {
  IPhase,
  PhaseBehaviorForMissingScript as IPhaseBehaviorForMissingScript
} from './api/CommandLineConfiguration';

export {
  EnvironmentConfiguration,
  EnvironmentVariableNames,
  IEnvironmentConfigurationInitializeOptions
} from './api/EnvironmentConfiguration';

export { RushConstants } from './logic/RushConstants';

export { PackageManagerName, PackageManager } from './api/packageManager/PackageManager';

export { RushConfigurationProject } from './api/RushConfigurationProject';

export {
  IRushProjectJson as _IRushProjectJson,
  IOperationSettings,
  RushProjectConfiguration
} from './api/RushProjectConfiguration';

export { RushUserConfiguration } from './api/RushUserConfiguration';

export { RushGlobalFolder as _RushGlobalFolder } from './api/RushGlobalFolder';

export { ApprovedPackagesItem, ApprovedPackagesConfiguration } from './api/ApprovedPackagesConfiguration';

export { CommonVersionsConfiguration } from './api/CommonVersionsConfiguration';

export { PackageJsonEditor, PackageJsonDependency, DependencyType } from './api/PackageJsonEditor';

export { RepoStateFile } from './logic/RepoStateFile';

export { LookupByPath, IPrefixMatch } from './logic/LookupByPath';
export { EventHooks, Event } from './api/EventHooks';

export { ChangeManager } from './api/ChangeManager';

export {
  LastInstallFlag as _LastInstallFlag,
  ILockfileValidityCheckOptions as _ILockfileValidityCheckOptions
} from './api/LastInstallFlag';

export {
  VersionPolicyDefinitionName,
  BumpType,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  VersionPolicy
} from './api/VersionPolicy';

export { VersionPolicyConfiguration } from './api/VersionPolicyConfiguration';

export { ILaunchOptions, Rush } from './api/Rush';
export { RushInternals as _RushInternals } from './api/RushInternals';

export { ExperimentsConfiguration, IExperimentsJson } from './api/ExperimentsConfiguration';
export {
  CustomTipsConfiguration,
  CustomTipId,
  ICustomTipsJson,
  ICustomTipItemJson
} from './api/CustomTipsConfiguration';

export {
  ProjectChangeAnalyzer,
  IGetChangedProjectsOptions,
  IRawRepoState as _IRawRepoState
} from './logic/ProjectChangeAnalyzer';

export { IOperationRunner, IOperationRunnerContext } from './logic/operations/IOperationRunner';
export { IExecutionResult, IOperationExecutionResult } from './logic/operations/IOperationExecutionResult';
export { IOperationOptions, Operation } from './logic/operations/Operation';
export { OperationStatus } from './logic/operations/OperationStatus';

export {
  RushSession,
  IRushSessionOptions,
  CloudBuildCacheProviderFactory,
  CobuildLockProviderFactory
} from './pluginFramework/RushSession';

export {
  IRushCommand,
  IGlobalCommand,
  IPhasedCommand,
  RushLifecycleHooks
} from './pluginFramework/RushLifeCycle';

export { ICreateOperationsContext, PhasedCommandHooks } from './pluginFramework/PhasedCommandHooks';

export { IRushPlugin } from './pluginFramework/IRushPlugin';
export { IBuiltInPluginConfiguration as _IBuiltInPluginConfiguration } from './pluginFramework/PluginLoader/BuiltInPluginLoader';
export { IRushPluginConfigurationBase as _IRushPluginConfigurationBase } from './api/RushPluginsConfiguration';
export { ILogger } from './pluginFramework/logging/Logger';

export { ICloudBuildCacheProvider } from './logic/buildCache/ICloudBuildCacheProvider';
export {
  ICobuildLockProvider,
  ICobuildContext,
  ICobuildCompletedState
} from './logic/cobuild/ICobuildLockProvider';

export { ICredentialCacheOptions, ICredentialCacheEntry, CredentialCache } from './logic/CredentialCache';

export type { ITelemetryData, ITelemetryMachineInfo, ITelemetryOperationResult } from './logic/Telemetry';

export { IStopwatchResult } from './utilities/Stopwatch';
export {
  OperationStateFile as _OperationStateFile,
  IOperationStateFileOptions as _IOperationStateFileOptions,
  IOperationStateJson as _IOperationStateJson
} from './logic/operations/OperationStateFile';
export {
  OperationMetadataManager as _OperationMetadataManager,
  IOperationMetadataManagerOptions as _IOperationMetadataManagerOptions,
  IOperationMetaData as _IOperationMetadata
} from './logic/operations/OperationMetadataManager';
