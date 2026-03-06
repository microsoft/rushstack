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

export { ApprovedPackagesPolicy } from './api/ApprovedPackagesPolicy.ts';

export { RushConfiguration, type ITryFindRushJsonLocationOptions } from './api/RushConfiguration.ts';

export { Subspace } from './api/Subspace.ts';
export { SubspacesConfiguration } from './api/SubspacesConfiguration.ts';

export {
  type IPackageManagerOptionsJsonBase,
  type IConfigurationEnvironment,
  type IConfigurationEnvironmentVariable,
  PackageManagerOptionsConfigurationBase
} from './logic/base/BasePackageManagerOptionsConfiguration.ts';
export {
  type INpmOptionsJson as _INpmOptionsJson,
  NpmOptionsConfiguration
} from './logic/npm/NpmOptionsConfiguration.ts';
export {
  type IYarnOptionsJson as _IYarnOptionsJson,
  YarnOptionsConfiguration
} from './logic/yarn/YarnOptionsConfiguration.ts';
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
} from './logic/pnpm/PnpmOptionsConfiguration.ts';

export { BuildCacheConfiguration } from './api/BuildCacheConfiguration.ts';
export { CobuildConfiguration, type ICobuildJson } from './api/CobuildConfiguration.ts';
export type {
  GetCacheEntryIdFunction,
  IGenerateCacheEntryIdOptions
} from './logic/buildCache/CacheEntryId.ts';
export {
  FileSystemBuildCacheProvider,
  type IFileSystemBuildCacheProviderOptions
} from './logic/buildCache/FileSystemBuildCacheProvider.ts';

export type {
  IPhase,
  PhaseBehaviorForMissingScript as IPhaseBehaviorForMissingScript
} from './api/CommandLineConfiguration.ts';

export {
  EnvironmentConfiguration,
  EnvironmentVariableNames,
  type IEnvironmentConfigurationInitializeOptions
} from './api/EnvironmentConfiguration.ts';

export { RushConstants } from './logic/RushConstants.ts';

export { type PackageManagerName, PackageManager } from './api/packageManager/PackageManager.ts';

export { RushConfigurationProject } from './api/RushConfigurationProject.ts';

export {
  type IRushProjectJson as _IRushProjectJson,
  type IOperationSettings,
  type NodeVersionGranularity,
  RushProjectConfiguration,
  type IRushPhaseSharding
} from './api/RushProjectConfiguration.ts';

export { RushUserConfiguration } from './api/RushUserConfiguration.ts';

export { RushGlobalFolder as _RushGlobalFolder } from './api/RushGlobalFolder.ts';

export { ApprovedPackagesItem, ApprovedPackagesConfiguration } from './api/ApprovedPackagesConfiguration.ts';

export { CommonVersionsConfiguration } from './api/CommonVersionsConfiguration.ts';

export {
  PackageJsonEditor,
  PackageJsonDependency,
  DependencyType,
  PackageJsonDependencyMeta
} from './api/PackageJsonEditor.ts';

export { RepoStateFile } from './logic/RepoStateFile.ts';

export { EventHooks, Event } from './api/EventHooks.ts';

export { ChangeManager } from './api/ChangeManager.ts';

export { FlagFile as _FlagFile } from './api/FlagFile.ts';

export {
  VersionPolicyDefinitionName,
  BumpType,
  LockStepVersionPolicy,
  IndividualVersionPolicy,
  VersionPolicy
} from './api/VersionPolicy.ts';

export {
  VersionPolicyConfiguration,
  type ILockStepVersionJson,
  type IIndividualVersionJson,
  type IVersionPolicyJson
} from './api/VersionPolicyConfiguration.ts';

export { type ILaunchOptions, Rush } from './api/Rush.ts';
export { RushInternals as _RushInternals } from './api/RushInternals.ts';

export { ExperimentsConfiguration, type IExperimentsJson } from './api/ExperimentsConfiguration.ts';
export {
  CustomTipsConfiguration,
  CustomTipId,
  type ICustomTipsJson,
  type ICustomTipInfo,
  type ICustomTipItemJson,
  CustomTipSeverity,
  CustomTipType
} from './api/CustomTipsConfiguration.ts';

export { ProjectChangeAnalyzer, type IGetChangedProjectsOptions } from './logic/ProjectChangeAnalyzer.ts';
export type {
  IInputsSnapshot,
  GetInputsSnapshotAsyncFn as GetInputsSnapshotAsyncFn,
  IRushConfigurationProjectForSnapshot
} from './logic/incremental/InputsSnapshot.ts';

export type { IOperationRunner, IOperationRunnerContext } from './logic/operations/IOperationRunner.ts';
export type {
  IExecutionResult,
  IOperationExecutionResult
} from './logic/operations/IOperationExecutionResult.ts';
export { type IOperationOptions, Operation } from './logic/operations/Operation.ts';
export { OperationStatus } from './logic/operations/OperationStatus.ts';
export type { ILogFilePaths } from './logic/operations/ProjectLogWritable.ts';

export {
  RushSession,
  type IRushSessionOptions,
  type CloudBuildCacheProviderFactory,
  type CobuildLockProviderFactory
} from './pluginFramework/RushSession.ts';

export {
  type IRushCommand,
  type IGlobalCommand,
  type IPhasedCommand,
  RushLifecycleHooks
} from './pluginFramework/RushLifeCycle.ts';

export {
  type ICreateOperationsContext,
  type IExecuteOperationsContext,
  PhasedCommandHooks
} from './pluginFramework/PhasedCommandHooks.ts';

export type { IRushPlugin } from './pluginFramework/IRushPlugin.ts';
export type { IBuiltInPluginConfiguration as _IBuiltInPluginConfiguration } from './pluginFramework/PluginLoader/BuiltInPluginLoader.ts';
export type { IRushPluginConfigurationBase as _IRushPluginConfigurationBase } from './api/RushPluginsConfiguration.ts';
export type { ILogger } from './pluginFramework/logging/Logger.ts';

export type { ICloudBuildCacheProvider } from './logic/buildCache/ICloudBuildCacheProvider.ts';
export type {
  ICobuildLockProvider,
  ICobuildContext,
  ICobuildCompletedState
} from './logic/cobuild/ICobuildLockProvider.ts';

export type { ITelemetryData, ITelemetryMachineInfo, ITelemetryOperationResult } from './logic/Telemetry.ts';

export type { IStopwatchResult } from './utilities/Stopwatch.ts';
export {
  OperationStateFile as _OperationStateFile,
  type IOperationStateFileOptions as _IOperationStateFileOptions,
  type IOperationStateJson as _IOperationStateJson
} from './logic/operations/OperationStateFile.ts';
export {
  OperationMetadataManager as _OperationMetadataManager,
  type IOperationMetadataManagerOptions as _IOperationMetadataManagerOptions,
  type IOperationMetaData as _IOperationMetadata
} from './logic/operations/OperationMetadataManager.ts';

export {
  RushCommandLine,
  type IRushCommandLineSpec,
  type IRushCommandLineParameter,
  type IRushCommandLineAction
} from './api/RushCommandLine.ts';

export { OperationBuildCache as _OperationBuildCache } from './logic/buildCache/OperationBuildCache.ts';
export type {
  IOperationBuildCacheOptions as _IOperationBuildCacheOptions,
  IProjectBuildCacheOptions as _IProjectBuildCacheOptions
} from './logic/buildCache/OperationBuildCache.ts';
