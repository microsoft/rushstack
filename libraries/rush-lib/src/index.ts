// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

/**
 * A library for writing scripts that interact with the {@link https://rushjs.io/ | Rush} tool.
 * @packageDocumentation
 */

// #region Backwards compatibility
export { LookupByPath as LookupByPath, type IPrefixMatch } from '@rushstack/lookup-by-path';

export {
  type ICredentialCacheOptions,
  type ICredentialCacheEntry,
  CredentialCache
} from '@rushstack/credential-cache';
// #endregion

export { ApprovedPackagesPolicy } from './api/ApprovedPackagesPolicy';

export { RushConfiguration, type ITryFindRushJsonLocationOptions } from './api/RushConfiguration';

export { Subspace } from './api/Subspace';
export { SubspacesConfiguration } from './api/SubspacesConfiguration';

export {
  type IPackageManagerOptionsJsonBase,
  type IConfigurationEnvironment,
  type IConfigurationEnvironmentVariable,
  PackageManagerOptionsConfigurationBase
} from './logic/base/BasePackageManagerOptionsConfiguration';
export {
  type INpmOptionsJson as _INpmOptionsJson,
  NpmOptionsConfiguration
} from './logic/npm/NpmOptionsConfiguration';
export {
  type IYarnOptionsJson as _IYarnOptionsJson,
  YarnOptionsConfiguration
} from './logic/yarn/YarnOptionsConfiguration';
export {
  type IPnpmOptionsJson as _IPnpmOptionsJson,
  type PnpmStoreLocation,
  type IPnpmLockfilePolicies,
  type IPnpmPackageExtension,
  type IPnpmPeerDependencyRules,
  type IPnpmPeerDependenciesMeta,
  type PnpmStoreOptions,
  PnpmOptionsConfiguration,
  type PnpmResolutionMode
} from './logic/pnpm/PnpmOptionsConfiguration';

export { BuildCacheConfiguration } from './api/BuildCacheConfiguration';
export { CobuildConfiguration, type ICobuildJson } from './api/CobuildConfiguration';
export type { GetCacheEntryIdFunction, IGenerateCacheEntryIdOptions } from './logic/buildCache/CacheEntryId';
export {
  FileSystemBuildCacheProvider,
  type IFileSystemBuildCacheProviderOptions
} from './logic/buildCache/FileSystemBuildCacheProvider';

export type {
  IPhase,
  PhaseBehaviorForMissingScript as IPhaseBehaviorForMissingScript
} from './api/CommandLineConfiguration';

export {
  EnvironmentConfiguration,
  EnvironmentVariableNames,
  type IEnvironmentConfigurationInitializeOptions
} from './api/EnvironmentConfiguration';

export { RushConstants } from './logic/RushConstants';

export { type PackageManagerName, PackageManager } from './api/packageManager/PackageManager';

export { RushConfigurationProject } from './api/RushConfigurationProject';

export {
  type IRushProjectJson as _IRushProjectJson,
  type IOperationSettings,
  RushProjectConfiguration,
  type IRushPhaseSharding
} from './api/RushProjectConfiguration';

export { RushUserConfiguration } from './api/RushUserConfiguration';

export { RushGlobalFolder as _RushGlobalFolder } from './api/RushGlobalFolder';

export { ApprovedPackagesItem, ApprovedPackagesConfiguration } from './api/ApprovedPackagesConfiguration';

export { CommonVersionsConfiguration } from './api/CommonVersionsConfiguration';

export {
  PackageJsonEditor,
  PackageJsonDependency,
  DependencyType,
  PackageJsonDependencyMeta
} from './api/PackageJsonEditor';

export { RepoStateFile } from './logic/RepoStateFile';

export { EventHooks, Event } from './api/EventHooks';

export { ChangeManager } from './api/ChangeManager';

export { FlagFile as _FlagFile } from './api/FlagFile';

export {
  VersionPolicyDefinitionName,
  BumpType,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  VersionPolicy
} from './api/VersionPolicy';

export {
  VersionPolicyConfiguration,
  type ILockStepVersionJson,
  type IIndividualVersionJson,
  type IVersionPolicyJson
} from './api/VersionPolicyConfiguration';

export { type ILaunchOptions, Rush } from './api/Rush';
export { RushInternals as _RushInternals } from './api/RushInternals';

export { ExperimentsConfiguration, type IExperimentsJson } from './api/ExperimentsConfiguration';
export {
  CustomTipsConfiguration,
  CustomTipId,
  type ICustomTipsJson,
  type ICustomTipInfo,
  type ICustomTipItemJson,
  CustomTipSeverity,
  CustomTipType
} from './api/CustomTipsConfiguration';

export { ProjectChangeAnalyzer, type IGetChangedProjectsOptions } from './logic/ProjectChangeAnalyzer';
export type {
  IInputsSnapshot,
  GetInputsSnapshotAsyncFn as GetInputsSnapshotAsyncFn,
  IRushConfigurationProjectForSnapshot
} from './logic/incremental/InputsSnapshot';

export type { IOperationRunner, IOperationRunnerContext } from './logic/operations/IOperationRunner';
export type {
  IExecutionResult,
  IOperationExecutionResult
} from './logic/operations/IOperationExecutionResult';
export { type IOperationOptions, Operation } from './logic/operations/Operation';
export { OperationStatus } from './logic/operations/OperationStatus';
export type { ILogFilePaths } from './logic/operations/ProjectLogWritable';

export {
  RushSession,
  type IRushSessionOptions,
  type CloudBuildCacheProviderFactory,
  type CobuildLockProviderFactory
} from './pluginFramework/RushSession';

export {
  type IRushCommand,
  type IGlobalCommand,
  type IPhasedCommand,
  type IPublishCommand,
  RushLifecycleHooks
} from './pluginFramework/RushLifeCycle';

export {
  type ICreateOperationsContext,
  type IExecuteOperationsContext,
  PhasedCommandHooks
} from './pluginFramework/PhasedCommandHooks';

export type { IRushPlugin } from './pluginFramework/IRushPlugin';
export type { IBuiltInPluginConfiguration as _IBuiltInPluginConfiguration } from './pluginFramework/PluginLoader/BuiltInPluginLoader';
export type { IRushPluginConfigurationBase as _IRushPluginConfigurationBase } from './api/RushPluginsConfiguration';
export type { ILogger } from './pluginFramework/logging/Logger';

export type { ICloudBuildCacheProvider } from './logic/buildCache/ICloudBuildCacheProvider';
export type {
  ICobuildLockProvider,
  ICobuildContext,
  ICobuildCompletedState
} from './logic/cobuild/ICobuildLockProvider';

export type {
  IPublishProvider,
  IPublishProjectInfo,
  IPublishProviderPublishOptions,
  IPublishProviderCheckExistsOptions,
  PublishProviderFactory
} from './pluginFramework/IPublishProvider';

export type { ITelemetryData, ITelemetryMachineInfo, ITelemetryOperationResult } from './logic/Telemetry';

export type { IStopwatchResult } from './utilities/Stopwatch';
export {
  OperationStateFile as _OperationStateFile,
  type IOperationStateFileOptions as _IOperationStateFileOptions,
  type IOperationStateJson as _IOperationStateJson
} from './logic/operations/OperationStateFile';
export {
  OperationMetadataManager as _OperationMetadataManager,
  type IOperationMetadataManagerOptions as _IOperationMetadataManagerOptions,
  type IOperationMetaData as _IOperationMetadata
} from './logic/operations/OperationMetadataManager';

export {
  RushCommandLine,
  type IRushCommandLineSpec,
  type IRushCommandLineParameter,
  type IRushCommandLineAction
} from './api/RushCommandLine';

export { OperationBuildCache as _OperationBuildCache } from './logic/buildCache/OperationBuildCache';
export type {
  IOperationBuildCacheOptions as _IOperationBuildCacheOptions,
  IProjectBuildCacheOptions as _IProjectBuildCacheOptions
} from './logic/buildCache/OperationBuildCache';
