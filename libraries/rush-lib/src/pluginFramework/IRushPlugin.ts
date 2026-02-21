// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../api/RushConfiguration.ts';
import type { RushSession } from './RushSession.ts';

/**
 * @beta
 */
export interface IRushPlugin {
  apply(rushSession: RushSession, rushConfiguration: RushConfiguration): void;
}
