// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The CLI client's presentation layer for the Rush daemon (`rushd`): hosts the
 * per-operation `StreamCollator` for faithful collation, applies per-client
 * verbosity at event delivery, and threads terminal capabilities
 * (`FORCE_COLOR`/`COLUMNS`) into child process environments.
 *
 * @remarks
 * The renderer interface mirrors `@rushstack/reporter`'s `IReporter` so the
 * reporter package's `default`/`ai`/`plaintext` reporters can be hosted here
 * unchanged once that package merges into main. This package has no
 * `rush-lib` dependency.
 *
 * @packageDocumentation
 */

export {
  applyDaemonChildEnvironment,
  getDaemonChildEnvironmentOverrides
} from './ChildEnvironment';
export type { IDaemonRenderer, IDaemonRendererContext } from './DaemonRenderer';
export { DaemonRendererHost } from './DaemonRendererHost';
export type { IDaemonRendererHostOptions } from './DaemonRendererHostOptions';
export type { DaemonRenderStream, IDaemonRendererTerminal } from './DaemonRendererTerminal';
export { LegacyCollatedRenderer } from './LegacyCollatedRenderer';
export {
  OperationStreamRegistry,
  type IOperationStreamRegistryOptions
} from './OperationStreamRegistry';
export { formatDaemonOperationHeader } from './RendererHeader';
export { TerminalSinkWritable } from './TerminalSinkWritable';
