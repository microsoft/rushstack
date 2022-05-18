// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { HeftTaskSession } from './HeftTaskSession';
import type { HeftLifecycleSession } from './HeftLifecycleSession';

/**
 * @public
 */
export interface IHeftPlugin<
  TSession extends HeftLifecycleSession | HeftTaskSession = HeftLifecycleSession | HeftTaskSession,
  TOptions = void
> {
  readonly accessor?: object;
  apply(session: TSession, heftConfiguration: HeftConfiguration, pluginOptions?: TOptions): void;
}

/**
 * @public
 */
export interface IHeftLifecyclePlugin<TOptions = void> extends IHeftPlugin<HeftLifecycleSession, TOptions> {}

/**
 * @public
 */
export interface IHeftTaskPlugin<TOptions = void> extends IHeftPlugin<HeftTaskSession, TOptions> {
  apply(taskSession: HeftTaskSession, heftConfiguration: HeftConfiguration, pluginOptions?: TOptions): void;
}
