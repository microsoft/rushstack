// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { IHeftPlugin } from './pluginFramework/IHeftPlugin';
export {
  HeftConfiguration,
  IHeftActionConfiguration,
  IHeftActionConfigurationOptions,
  IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration';
export { ActionHooksBase, IActionDataBase } from './cli/actions/HeftActionBase';
export { HeftSession, IHeftSessionHooks } from './pluginFramework/HeftSession';
export { MetricsCollectorHooks, IMetricsData } from './metrics/MetricsCollector';

// Actions
export {
  IBuildActionData,
  BuildHooks,
  IBuildStage,
  BuildStageHooksBase,
  ICompileStage,
  ISharedCopyStaticAssetsConfiguration,
  ICopyStaticAssetsConfiguration,
  CompileStageHooks,
  IBundleStage
} from './cli/actions/BuildAction';
export { ICleanActionData, CleanHooks } from './cli/actions/CleanAction';
export { IDevDeployActionData, DevDeployHooks } from './cli/actions/DevDeployAction';
export { IStartActionData, StartHooks } from './cli/actions/StartAction';
export { ITestActionData, TestHooks } from './cli/actions/TestAction';
