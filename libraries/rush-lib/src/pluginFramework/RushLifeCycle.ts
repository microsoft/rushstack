// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncParallelHook, AsyncSeriesHook, HookMap } from 'tapable';

import type { ITelemetryData } from '../logic/Telemetry';
import type { PhasedCommandHooks } from './PhasedCommandHooks';
import type { Subspace } from '../api/Subspace';

/**
 * Information about the currently executing command provided to plugins.
 * @beta
 */
export interface IRushCommand {
  /**
   * The name of this command, as seen on the command line
   */
  readonly actionName: string;
}

/**
 * Information about the currently executing global script command (as defined in command-line.json) provided to plugins.
 * @beta
 */
export interface IGlobalCommand extends IRushCommand {
  // Nothing added.
}

/**
 * Information about the currently executing phased script command (as defined in command-line.json, or default "build" or "rebuild") provided to plugins.
 * @beta
 */
export interface IPhasedCommand extends IRushCommand {
  /**
   * Hooks into the execution of the current phased command
   * @alpha
   */
  readonly hooks: PhasedCommandHooks;

  /**
   * An abort controller that can be used to abort the command.
   * Long-lived plugins should listen to the signal to handle any cleanup logic.
   * @alpha
   */
  readonly sessionAbortController: AbortController;
}

/**
 * Hooks into the lifecycle of the Rush process invocation that plugins may tap into.
 *
 * @beta
 */
export class RushLifecycleHooks {
  /**
   * The hook to run before executing any Rush CLI Command.
   */
  public readonly initialize: AsyncSeriesHook<IRushCommand> = new AsyncSeriesHook<IRushCommand>(
    ['command'],
    'initialize'
  );

  /**
   * The hook to run before executing any global Rush CLI Command (defined in command-line.json).
   */
  public readonly runAnyGlobalCustomCommand: AsyncSeriesHook<IGlobalCommand> =
    new AsyncSeriesHook<IGlobalCommand>(['command'], 'runAnyGlobalCustomCommand');

  /**
   * A hook map to allow plugins to hook specific named global commands (defined in command-line.json) before execution.
   */
  public readonly runGlobalCustomCommand: HookMap<AsyncSeriesHook<IGlobalCommand>> = new HookMap(
    (key: string) => {
      return new AsyncSeriesHook<IGlobalCommand>(['command'], key);
    },
    'runGlobalCustomCommand'
  );

  /**
   * The hook to run before executing any phased Rush CLI Command (defined in command-line.json, or the default "build" or "rebuild").
   */
  public readonly runAnyPhasedCommand: AsyncSeriesHook<IPhasedCommand> = new AsyncSeriesHook<IPhasedCommand>(
    ['command'],
    'runAnyPhasedCommand'
  );

  /**
   * A hook map to allow plugins to hook specific named phased commands (defined in command-line.json) before execution.
   */
  public readonly runPhasedCommand: HookMap<AsyncSeriesHook<IPhasedCommand>> = new HookMap((key: string) => {
    return new AsyncSeriesHook<IPhasedCommand>(['command'], key);
  }, 'runPhasedCommand');

  /**
   * The hook to run between preparing the common/temp folder and invoking the package manager during "rush install" or "rush update".
   */
  public readonly beforeInstall: AsyncSeriesHook<
    [command: IGlobalCommand, subspace: Subspace, variant: string | undefined]
  > = new AsyncSeriesHook(['command', 'subspace', 'variant'], 'beforeInstall');

  /**
   * The hook to run after a successful install.
   */
  public readonly afterInstall: AsyncSeriesHook<
    [command: IRushCommand, subspace: Subspace, variant: string | undefined]
  > = new AsyncSeriesHook(['command', 'subspace', 'variant'], 'afterInstall');

  /**
   * A hook to allow plugins to hook custom logic to process telemetry data.
   */
  public readonly flushTelemetry: AsyncParallelHook<[ReadonlyArray<ITelemetryData>]> = new AsyncParallelHook(
    ['telemetryData'],
    'flushTelemetry'
  );
}
