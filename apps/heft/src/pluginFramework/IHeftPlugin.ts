// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { HeftSession } from './HeftSession';

/**
 * @public
 */
export interface IHeftPlugin<TOptions = void> {
  pluginName: string;
  apply: (heftSession: HeftSession, heftConfiguration: HeftConfiguration, options?: TOptions) => void;
}
