// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ILaunchOptions, IRushSessionReporterOptions } from '@microsoft/rush-lib';

/**
 * The cross-version launch contract owned by the Rush frontend.
 *
 * @remarks
 * Reporter selection remains in `@microsoft/rush`. The selected `rush-lib`
 * receives only the typed producer sink in addition to its existing launch
 * options, so an older engine can safely ignore the new property.
 */
export interface IRushFrontendLaunchOptions extends ILaunchOptions {
  readonly reporter: IRushSessionReporterOptions;
  readonly reporterCloseAsync: () => Promise<void>;
  readonly reporterEnabled: boolean;
  readonly reporterStdoutIsMachineReadable?: boolean;
  readonly reporterSelectionReason:
    | 'explicit --reporter'
    | 'repository experiment'
    | 'RUSH_REPORTER=legacy'
    | 'pre-major legacy default'
    | 'bootstrap compatibility fallback';
}
