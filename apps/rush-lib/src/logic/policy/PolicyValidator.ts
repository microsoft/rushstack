// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import { GitEmailPolicy } from './GitEmailPolicy';

export class PolicyValidator {
  public static validatePolicy(rushConfiguration: RushConfiguration, bypassPolicy: boolean): void {
    if (bypassPolicy) {
      return;
    }

    GitEmailPolicy.validate(rushConfiguration);
  }
}
