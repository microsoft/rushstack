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
  ICustomActionOptions,
  ICustomActionParameterFlag,
  ICustomActionParameterInteger,
  ICustomActionParameterString,
  ICustomActionParameterStringList,
  ICustomActionParameterBase,
  ICustomActionParameter,
  CustomActionParameterType
} from './cli/actions/CustomAction';
export {
  HeftCommandLine,
  IHeftBaseParameter,
  IHeftChoiceParameter,
  IHeftChoiceListParameter,
  IHeftFlagParameter,
  IHeftIntegerParameter,
  IHeftStringParameter,
  IHeftStringListParameter,
  IParameterAssociatedActionNames,
  IHeftRegisterParameterOptions
} from './cli/HeftCommandLine';

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
