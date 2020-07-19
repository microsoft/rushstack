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
export { HeftSession, IHeftSessionHooks } from './pluginFramework/HeftSession';
export {
  MetricsCollectorHooks,
  IMetricsData,
  IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector';

// Stages
export { StageHooksBase, IStageContext } from './stages/StageBase';
export {
  BuildStageHooks,
  BuildSubstageHooksBase,
  BundleSubstageHooks,
  CompileSubstageHooks,
  CopyFromCacheMode,
  IBuildStageContext,
  IBuildStageProperties,
  IBuildSubstage,
  IBundleSubstage,
  IBundleSubstageProperties,
  ICompileSubstage,
  ICompileSubstageProperties,
  ICopyStaticAssetsConfiguration,
  IEmitModuleKind,
  IEmitModuleKindBase,
  IPostBuildSubstage,
  IPreCompileSubstage,
  ISharedCopyStaticAssetsConfiguration,
  ISharedTypeScriptConfiguration,
  ITypeScriptConfiguration
} from './stages/BuildStage';
export { ICleanStageProperties, CleanStageHooks, ICleanStageContext } from './stages/CleanStage';
export {
  IDevDeployStageProperties,
  DevDeployStageHooks,
  IDevDeployStageContext
} from './stages/DevDeployStage';
export { ITestStageProperties, TestStageHooks, ITestStageContext } from './stages/TestStage';
