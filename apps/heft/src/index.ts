// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export {
  HeftConfiguration,
  IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration';

export { IRigPackageResolver } from './configuration/RigPackageResolver';

export { IHeftPlugin, IHeftTaskPlugin, IHeftLifecyclePlugin } from './pluginFramework/IHeftPlugin';

export {
  CancellationTokenSource,
  CancellationToken,
  ICancellationTokenSourceOptions,
  ICancellationTokenOptions as _ICancellationTokenOptions
} from './pluginFramework/CancellationToken';

export { IHeftParameters, IHeftDefaultParameters } from './pluginFramework/HeftParameterManager';

export {
  IHeftLifecycleSession,
  IHeftLifecycleHooks,
  IHeftLifecycleCleanHookOptions,
  IHeftLifecycleToolStartHookOptions,
  IHeftLifecycleToolStopHookOptions
} from './pluginFramework/HeftLifecycleSession';

export {
  IHeftTaskSession,
  IHeftTaskHooks,
  IHeftTaskCleanHookOptions,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions,
  IChangedFileState
} from './pluginFramework/HeftTaskSession';

export { ICopyOperation } from './plugins/CopyFilesPlugin';

export { IDeleteOperation } from './plugins/DeleteFilesPlugin';

export { IRunScript, IRunScriptOptions } from './plugins/RunScriptPlugin';

export { IFileSelectionSpecifier } from './plugins/FileGlobSpecifier';

export {
  IHeftRecordMetricsHookOptions,
  IMetricsData,
  IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector';

export { IScopedLogger } from './pluginFramework/logging/ScopedLogger';

// Re-export types required to use custom command-line parameters
export type {
  CommandLineParameter,
  CommandLineChoiceListParameter,
  CommandLineChoiceParameter,
  CommandLineFlagParameter,
  CommandLineIntegerListParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';
