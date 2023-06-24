// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfiguration } from '../../api/RushConfiguration';
import * as GitEmailPolicy from './GitEmailPolicy';
import * as ShrinkwrapFilePolicy from './ShrinkwrapFilePolicy';
import * as EnvironmentPolicy from './EnvironmentPolicy';

export interface IPolicyValidatorOptions {
  bypassPolicyAllowed?: boolean;
  bypassPolicy?: boolean;
  allowShrinkwrapUpdates?: boolean;
  shrinkwrapVariant?: string;
}

export async function validatePolicyAsync(
  rushConfiguration: RushConfiguration,
  options: IPolicyValidatorOptions
): Promise<void> {
  if (!options.bypassPolicy) {
    GitEmailPolicy.validate(rushConfiguration, options);
    await EnvironmentPolicy.validateAsync(rushConfiguration, options);
    if (!options.allowShrinkwrapUpdates) {
      // Don't validate the shrinkwrap if updates are allowed, as it's likely to change
      // It also may have merge conflict markers, which PNPM can gracefully handle, but the validator cannot
      ShrinkwrapFilePolicy.validate(rushConfiguration, options);
    }
  }
}
