// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ILaunchOptions, IRushSessionReporterOptions } from '@microsoft/rush-lib';

/**
 * The cross-version launch contract owned by the Rush frontend.
 *
 * @remarks
 * Reporter selection remains in `@microsoft/rush`. The selected `rush-lib`
 * receives a reporter channel containing the typed producer event sink and the
 * frontend-assigned `sessionId`, in addition to its existing launch options.
 * An older engine can safely ignore this additive reporter property.
 */
export interface IRushFrontendLaunchOptions extends ILaunchOptions {
  readonly reporter: IRushSessionReporterOptions;
  readonly reporterCloseAsync: () => Promise<void>;
}
