// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import { GitEmailPolicy } from './GitEmailPolicy';
import { RushPolicy } from './RushPolicy';

export class PolicyValidator {
  public static validatePolicy(rushConfiguration: RushConfiguration, bypassPolicy: boolean): void {
    if (bypassPolicy) {
      return;
    }

    const policies: RushPolicy[] = [new GitEmailPolicy()];
    for (const policy of policies) {
      policy.validate(rushConfiguration);
    }
  }
}
