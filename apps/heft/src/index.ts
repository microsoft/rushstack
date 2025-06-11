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

import type * as ConfigurationFile from './configuration/types';
export type { ConfigurationFile };

export {
  HeftConfiguration,
  type IHeftConfigurationInitializationOptions as _IHeftConfigurationInitializationOptions
} from './configuration/HeftConfiguration';

export type { IRigPackageResolver } from './configuration/RigPackageResolver';

export type { IHeftPlugin, IHeftTaskPlugin, IHeftLifecyclePlugin } from './pluginFramework/IHeftPlugin';

export type { IHeftParameters, IHeftDefaultParameters } from './pluginFramework/HeftParameterManager';

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
} from './pluginFramework/HeftLifecycleSession';

export type {
  IHeftParsedCommandLine,
  IHeftTaskSession,
  IHeftTaskHooks,
  IHeftTaskFileOperations,
  IHeftTaskRunHookOptions,
  IHeftTaskRunIncrementalHookOptions
} from './pluginFramework/HeftTaskSession';

export type { ICopyOperation, IIncrementalCopyOperation } from './plugins/CopyFilesPlugin';

export type { IDeleteOperation } from './plugins/DeleteFilesPlugin';

export type { IRunScript, IRunScriptOptions } from './plugins/RunScriptPlugin';

export type { IFileSelectionSpecifier, IGlobOptions, GlobFn, WatchGlobFn } from './plugins/FileGlobSpecifier';

export type {
  IWatchedFileState,
  IWatchFileSystem,
  ReaddirDirentCallback,
  ReaddirStringCallback,
  StatCallback,
  IReaddirOptions
} from './utilities/WatchFileSystemAdapter';

export {
  type IHeftRecordMetricsHookOptions,
  type IMetricsData,
  type IPerformanceData as _IPerformanceData,
  MetricsCollector as _MetricsCollector
} from './metrics/MetricsCollector';

export type { IScopedLogger } from './pluginFramework/logging/ScopedLogger';

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

export type { IHeftTaskOperationMetadata } from './cli/HeftActionRunner';
export type { IHeftPhaseOperationMetadata } from './cli/HeftActionRunner';

export type { IHeftTask } from './pluginFramework/HeftTask';
export type { IHeftPhase } from './pluginFramework/HeftPhase';
