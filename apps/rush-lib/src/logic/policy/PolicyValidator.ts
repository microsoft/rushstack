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
    ShrinkwrapFilePolicy.validate(rushConfiguration, options);
  }
}
