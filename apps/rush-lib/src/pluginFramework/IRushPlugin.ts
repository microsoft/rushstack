// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonSchema } from '@rushstack/node-core-library';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushSession } from './RushSession';

/**
 * @public
 */
export interface IRushPlugin<TOptions = void> {
  readonly pluginName: string;
  readonly optionsSchema?: JsonSchema;
  apply(rushSession: RushSession, rushConfiguration: RushConfiguration, options: TOptions): void;
}
