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
export {
  HeftSession,
  IHeftSessionHooks,
  RequestAccessToPluginByNameCallback,
  RegisterAction
} from './pluginFramework/HeftSession';
export {
  MetricsCollectorHooks,
  IMetricsData,
  IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector';
export { ScopedLogger, IScopedLogger } from './pluginFramework/logging/ScopedLogger';
export {
  CustomActionParameterType,
  ICustomActionOptions,
  ICustomActionParameter,
  ICustomActionParameterBase,
  ICustomActionParameterFlag,
  ICustomActionParameterInteger,
  ICustomActionParameterString,
  ICustomActionParameterStringList
} from './cli/actions/CustomAction';

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
  IPostBuildSubstage,
  IPreCompileSubstage,
  IWebpackConfiguration
} from './stages/BuildStage';
export { ICleanStageProperties, CleanStageHooks, ICleanStageContext } from './stages/CleanStage';
export { ITestStageProperties, TestStageHooks, ITestStageContext } from './stages/TestStage';
