// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import { GitEmailPolicy } from './GitEmailPolicy';
import { ShrinkwrapFilePolicy } from './ShrinkwrapFilePolicy';

export interface IPolicyValidatorOptions {
  bypassPolicy?: boolean;
  allowShrinkwrapUpdates?: boolean;
  shrinkwrapVariant?: string;
}

export class PolicyValidator {
  public static validatePolicy(rushConfiguration: RushConfiguration, options: IPolicyValidatorOptions): void {
    if (options.bypassPolicy) {
      return;
    }

    GitEmailPolicy.validate(rushConfiguration);
    if (!options.allowShrinkwrapUpdates) {
      // Don't validate the shrinkwrap if updates are allowed, as it's likely to change
      // It also may have merge conflict markers, which PNPM can gracefully handle, but the validator cannot
      ShrinkwrapFilePolicy.validate(rushConfiguration, options);
    }
  }
}
