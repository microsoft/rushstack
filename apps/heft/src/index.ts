// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// export { IHeftPlugin } from './pluginFramework/IHeftPlugin';

export {
  HeftConfiguration,
  IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration';

export { RigToolResolver } from './configuration/RigToolResolver';

export {
  IHeftLifecycleHooks,
  IHeftLifecycleHookOptions,
  IHeftLifecycleToolStartHookOptions,
  IHeftLifecycleToolStopHookOptions,
  HeftLifecycleSession
} from './pluginFramework/HeftLifecycleSession';

export {
  IHeftTaskHooks,
  IHeftTaskHookOptions,
  IHeftTaskCleanHookOptions as IIHeftTaskCleanHookOptions,
  IHeftTaskRunHookOptions,
  HeftTaskSession
} from './pluginFramework/HeftTaskSession';

export { IHeftPlugin, IHeftTaskPlugin, IHeftLifecyclePlugin } from './pluginFramework/IHeftPlugin';

export { ICopyOperation } from './plugins/CopyFilesPlugin';

export { IDeleteOperation } from './plugins/DeleteFilesPlugin';

export { IRunScript, IRunScriptOptions } from './plugins/RunScriptPlugin';

export { IFileGlobSpecifier } from './plugins/FileGlobSpecifier';

export { RequestAccessToPluginByNameCallback } from './pluginFramework/HeftPluginHost';

export {
  IHeftRecordMetricsHookOptions,
  IMetricsData,
  IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector';

export { ScopedLogger, IScopedLogger, IScopedLoggerOptions } from './pluginFramework/logging/ScopedLogger';

export type {
  CommandLineParameter,
  CommandLineChoiceParameter,
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

// Other hooks
// export {
//   IHeftLifecycle as _IHeftLifecycle,
//   HeftLifecycleHooks as _HeftLifecycleHooks
// } from './pluginFramework/HeftLifecycle';

// export { IRunScriptOptions } from './plugins/RunScriptPlugin';
