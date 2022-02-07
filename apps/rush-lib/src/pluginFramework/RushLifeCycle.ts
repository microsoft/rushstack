// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesHook, HookMap } from 'tapable';
import { PhasedScriptActionHooks } from './PhasedScriptActionHooks';

/**
 * Information about the currently executing action provided to plugins.
 * @beta
 */
export interface IRushAction {
  /**
   * The name of this action, as seen on the command line
   */
  readonly actionName: string;
}

/**
 * Information about the currently executing global script action (as defined in command-line.json) provided to plugins.
 * @beta
 */
export interface IGlobalScriptAction extends IRushAction {
  // Nothing added.
}

/**
 * Information about the currently executing phased script action (as defined in command-line.json, or default "build" or "rebuild") provided to plugins.
 * @beta
 */
export interface IPhasedScriptAction extends IRushAction {
  /**
   * Hooks into the lifecyle of this action's execution
   */
  readonly hooks: PhasedScriptActionHooks;
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
  public initialize: AsyncSeriesHook<IRushAction> = new AsyncSeriesHook<IRushAction>(
    ['action'],
    'initialize'
  );

  /**
   * The hook to run before executing any global Rush CLI Command (as defined in command-line.json).
   */
  public anyGlobalScriptCommand: AsyncSeriesHook<IGlobalScriptAction> =
    new AsyncSeriesHook<IGlobalScriptAction>(['action'], 'anyGlobalScriptCommand');

  /**
   * A hook map to allow plugins to hook specific named global script commands before execution.
   */
  public globalScriptCommand: HookMap<AsyncSeriesHook<IGlobalScriptAction>> = new HookMap((key: string) => {
    return new AsyncSeriesHook<IGlobalScriptAction>(['action'], key);
  }, 'globalScriptCommand');

  /**
   * The hook to run before executing any phased Rush CLI Command (as defined in command-line.json, or the default "build" or "rebuild").
   */
  public anyPhasedScriptComamnd: AsyncSeriesHook<IPhasedScriptAction> =
    new AsyncSeriesHook<IPhasedScriptAction>(['action'], 'anyPhasedScriptCommand');

  /**
   * A hook map to allow plugins to hook specific named phased script commands before execution.
   */
  public phasedScriptCommand: HookMap<AsyncSeriesHook<IPhasedScriptAction>> = new HookMap((key: string) => {
    return new AsyncSeriesHook<IPhasedScriptAction>(['action'], key);
  }, 'phasedScriptCommand');
}
