// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

/**
 * Heft is a config-driven toolchain that invokes other popular tools such
 * as TypeScript, ESLint, Jest, Webpack, and API Extractor. You can use it to build
 * web applications, Node.js services, command-line tools, libraries, and more.
 *
 * @packageDocumentation
 */

import type * as ConfigurationFile from './configuration/types.ts';
export type { ConfigurationFile };

export {
  HeftConfiguration,
  type IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration.ts';

export type { IRigPackageResolver } from './configuration/RigPackageResolver.ts';

export type { IHeftPlugin, IHeftTaskPlugin, IHeftLifecyclePlugin } from './pluginFramework/IHeftPlugin.ts';

export type { IHeftParameters, IHeftDefaultParameters } from './pluginFramework/HeftParameterManager.ts';

export type {
  IHeftLifecycleSession,
  IHeftLifecycleHooks,
  IHeftLifecycleCleanHookOptions,
  IHeftLifecycleToolStartHookOptions,
  IHeftLifecycleToolFinishHookOptions,
  IHeftTaskStartHookOptions,
  IHeftTaskFinishHookOptions,
  IHeftPhaseStartHookOptions,
  IHeftPhaseFinishHookOptions
} from './pluginFramework/HeftLifecycleSession.ts';

export type {
  IHeftParsedCommandLine,
  IHeftTaskSession,
  IHeftTaskHooks,
  IHeftTaskFileOperations,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions
} from './pluginFramework/HeftTaskSession.ts';

export type { ICopyOperation, IIncrementalCopyOperation } from './plugins/CopyFilesPlugin.ts';

export type { IDeleteOperation } from './plugins/DeleteFilesPlugin.ts';

export type { IRunScript, IRunScriptOptions } from './plugins/RunScriptPlugin.ts';

export type {
  IFileSelectionSpecifier,
  IGlobOptions,
  GlobFn,
  WatchGlobFn
} from './plugins/FileGlobSpecifier.ts';

export type {
  IWatchedFileState,
  IWatchFileSystem,
  ReaddirDirentCallback,
  ReaddirStringCallback,
  StatCallback,
  IReaddirOptions
} from './utilities/WatchFileSystemAdapter.ts';

export {
  type IHeftRecordMetricsHookOptions,
  type IMetricsData,
  type IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector.ts';

export type { IScopedLogger } from './pluginFramework/logging/ScopedLogger.ts';

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

export type { IHeftTaskOperationMetadata } from './cli/HeftActionRunner.ts';
export type { IHeftPhaseOperationMetadata } from './cli/HeftActionRunner.ts';

export type { IHeftTask } from './pluginFramework/HeftTask.ts';
export type { IHeftPhase } from './pluginFramework/HeftPhase.ts';
