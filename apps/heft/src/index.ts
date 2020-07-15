// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { IHeftPlugin } from './pluginFramework/IHeftPlugin';
export {
  HeftConfiguration,
  IHeftActionConfiguration,
  IHeftActionConfigurationOptions,
  ICompilerPackage,
  IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration';
export { ActionHooksBase, IActionContext } from './cli/actions/HeftActionBase';
export { HeftSession, IHeftSessionHooks } from './pluginFramework/HeftSession';
export {
  MetricsCollectorHooks,
  IMetricsData,
  IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector';

// Actions
export {
  BuildHooks,
  BuildStageHooksBase,
  BundleStageHooks,
  CompileStageHooks,
  CopyFromCacheMode,
  IBuildActionContext,
  IBuildActionProperties,
  IBuildStage,
  IBundleStage,
  IBundleStageProperties,
  ICompileStage,
  ICompileStageProperties,
  ICopyStaticAssetsConfiguration,
  IEmitModuleKind,
  IEmitModuleKindBase,
  IPostBuildStage,
  IPreCompileStage,
  ISharedCopyStaticAssetsConfiguration,
  ISharedTypeScriptConfiguration,
  ITypeScriptConfiguration
} from './cli/actions/BuildAction';
export { ICleanActionProperties, CleanHooks, ICleanActionContext } from './cli/actions/CleanAction';
export {
  IDevDeployActionProperties,
  DevDeployHooks,
  IDevDeployActionContext
} from './cli/actions/DevDeployAction';
export { IStartActionProperties, StartHooks, IStartActionContext } from './cli/actions/StartAction';
export { ITestActionProperties, TestHooks, ITestActionContext } from './cli/actions/TestAction';
