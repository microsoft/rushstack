// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ServeTask } from './ServeTask';
import { ReloadTask } from './ReloadTask';
import { TrustCertTask } from './TrustCertTask';
import { UntrustCertTask } from './UntrustCertTask';

/**
 * @public
 */
export const serve: ServeTask = new ServeTask();

/**
 * @public
 */
export const reload: ReloadTask = new ReloadTask();

/**
 * @public
 */
export const trustDevCert: TrustCertTask = new TrustCertTask();

/**
 * @public
 */
export const untrustDevCert: UntrustCertTask = new UntrustCertTask();

export default serve; // tslint:disable-line:export-name
