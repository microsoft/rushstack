// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export { IPluginPackage } from './pluginFramework/IPluginPackage';
export {
  HeftConfiguration,
  IHeftActionConfiguration,
  IHeftActionConfigurationOptions,
  IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration';
export { ActionHooksBase, IActionDataBase } from './cli/actions/HeftActionBase';
export {
  HeftCompilation,
  IHeftCompilationHooks,
  Build,
  Clean,
  DevDeploy,
  Start,
  Test
} from './pluginFramework/HeftCompilation';

// Actions
export {
  IBuildActionData,
  BuildHooks,
  IBuildPhase,
  BuildPhaseHooksBase,
  ICompilePhase,
  IBundlePhase
} from './cli/actions/BuildAction';
export { ICleanActionData, CleanHooks } from './cli/actions/CleanAction';
export { IDevDeployActionData, DevDeployHooks } from './cli/actions/DevDeployAction';
export { IStartActionData, StartHooks } from './cli/actions/StartAction';
export { ITestActionData, TestHooks } from './cli/actions/TestAction';
