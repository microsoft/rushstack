// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ILaunchOptions } from '@microsoft/rush-lib';
import type { IReporterEventSink } from '@rushstack/rush-reporter';

/**
 * The cross-version launch contract owned by the Rush frontend.
 *
 * @remarks
 * Reporter selection remains in `@microsoft/rush`. The selected `rush-lib`
 * receives only the typed producer sink in addition to its existing launch
 * options, so an older engine can safely ignore the new property.
 */
export interface IRushFrontendLaunchOptions extends ILaunchOptions {
  readonly reporterEventSink: IReporterEventSink;
  readonly reporterCloseAsync: () => Promise<void>;
}
