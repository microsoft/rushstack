// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '../configuration/HeftConfiguration.ts';
import type { IHeftTaskSession } from './HeftTaskSession.ts';
import type { IHeftLifecycleSession } from './HeftLifecycleSession.ts';

/**
 * The interface used for all Heft plugins.
 *
 * @public
 */
export interface IHeftPlugin<
  TSession extends IHeftLifecycleSession | IHeftTaskSession = IHeftLifecycleSession | IHeftTaskSession,
  TOptions = void
> {
  /**
   * The accessor provided by the plugin. This accessor can be obtained by other plugins within the same
   * phase by calling `session.requestAccessToPlugin(...)`, and is used by other plugins to interact with
   * hooks or properties provided by the host plugin.
   */
  readonly accessor?: object;

  /**
   * Apply the plugin to the session. Plugins are expected to hook into session hooks to provide plugin
   * implementation. The `apply(...)` method is called once per phase.
   *
   * @param session - The session to apply the plugin to.
   * @param heftConfiguration - The Heft configuration.
   * @param pluginOptions - Options for the plugin, specified in heft.json.
   */
  apply(session: TSession, heftConfiguration: HeftConfiguration, pluginOptions?: TOptions): void;
}

/**
 * The interface that Heft lifecycle plugins must implement. Lifecycle plugins are used to provide
 * functionality that affects the lifecycle of the Heft run. As such, they do not belong to any particular
 * Heft phase.
 *
 * @public
 */
export interface IHeftLifecyclePlugin<TOptions = void> extends IHeftPlugin<IHeftLifecycleSession, TOptions> {}

/**
 * The interface that Heft task plugins must implement. Task plugins are used to provide the implementation
 * of a specific task.
 *
 * @public
 */
export interface IHeftTaskPlugin<TOptions = void> extends IHeftPlugin<IHeftTaskSession, TOptions> {}
