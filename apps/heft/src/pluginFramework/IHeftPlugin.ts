// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { IHeftTaskSession } from './HeftTaskSession';
import type { IHeftLifecycleSession } from './HeftLifecycleSession';

/**
 * @public
 */
export interface IHeftPlugin<
  TSession extends IHeftLifecycleSession | IHeftTaskSession = IHeftLifecycleSession | IHeftTaskSession,
  TOptions = void
> {
  readonly accessor?: object;
  apply(session: TSession, heftConfiguration: HeftConfiguration, pluginOptions?: TOptions): void;
}

/**
 * @public
 */
export interface IHeftLifecyclePlugin<TOptions = void> extends IHeftPlugin<IHeftLifecycleSession, TOptions> {}

/**
 * @public
 */
export interface IHeftTaskPlugin<TOptions = void> extends IHeftPlugin<IHeftTaskSession, TOptions> {}
