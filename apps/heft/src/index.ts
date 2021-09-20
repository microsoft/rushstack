// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { IHeftPlugin } from './pluginFramework/IHeftPlugin';
export {
  HeftConfiguration,
  IHeftActionConfiguration,
  IHeftActionConfigurationOptions,
  IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration';
export {
  HeftSession,
  IHeftSessionHooks,
  RequestAccessToPluginByNameCallback,
  RegisterAction,
  RegisterParameters
} from './pluginFramework/HeftSession';
export {
  MetricsCollectorHooks,
  IMetricsData,
  IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector';
export { ScopedLogger, IScopedLogger } from './pluginFramework/logging/ScopedLogger';
export { ICustomActionOptions } from './cli/actions/CustomAction';
export {
  CustomParameterType,
  ICustomParameter,
  ICustomParameterBase,
  ICustomParameterFlag,
  ICustomParameterInteger,
  ICustomParameterString,
  ICustomParameterStringList,
  ICustomParameterOptions
} from './cli/actions/CustomParameters';
export { Constants } from './utilities/Constants';

// Stages
export { StageHooksBase, IStageContext } from './stages/StageBase';
export {
  BuildStageHooks,
  BuildSubstageHooksBase,
  CompileSubstageHooks,
  BundleSubstageHooks,
  IBuildStageContext,
  IBuildStageProperties,
  IBuildSubstage,
  IBundleSubstage,
  IBundleSubstageProperties,
  ICompileSubstage,
  ICompileSubstageProperties,
  IPostBuildSubstage,
  IPreCompileSubstage
} from './stages/BuildStage';
export { ICleanStageProperties, CleanStageHooks, ICleanStageContext } from './stages/CleanStage';
export { ITestStageProperties, TestStageHooks, ITestStageContext } from './stages/TestStage';

// Other hooks
export {
  IHeftLifecycle as _IHeftLifecycle,
  HeftLifecycleHooks as _HeftLifecycleHooks
} from './pluginFramework/HeftLifecycle';

export { IRunScriptOptions } from './plugins/RunScriptPlugin';
