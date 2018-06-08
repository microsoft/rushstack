// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';
import { RushConfiguration } from '../api/RushConfiguration';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';
import { Utilities } from '../utilities/Utilities';

// Refuses to run at all if the PNPM version is older than this, because there
// are known bugs or missing features in earlier releases.
const MINIMUM_SUPPORTED_NPM_VERSION: string = '4.5.0';

// Refuses to run at all if the PNPM version is older than this, because there
// are known bugs or missing features in earlier releases.
const MINIMUM_SUPPORTED_PNPM_VERSION: string = '2.1.0';

/**
 * Validate that the developer's setup is good.
 */
export class SetupChecks {
  public static validate(rushConfiguration: RushConfiguration): void {
    // NOTE: The Node.js version is also checked in rush/src/start.ts
    const errorMessage: string | undefined = SetupChecks._validate(rushConfiguration);

    if (errorMessage) {
      console.error(colors.red(Utilities.wrapWords(errorMessage)));
      throw new AlreadyReportedError();
    }
  }

  private static _validate(rushConfiguration: RushConfiguration): string | undefined {
    if (rushConfiguration.packageManager === 'pnpm') {
      if (semver.lt(rushConfiguration.packageManagerToolVersion, MINIMUM_SUPPORTED_PNPM_VERSION)) {
        return `The rush.json file requests PNPM version `
          + rushConfiguration.packageManagerToolVersion
          + `, but PNPM ${MINIMUM_SUPPORTED_PNPM_VERSION} is the minimum supported by Rush.`;
      }
    } else if (rushConfiguration.packageManager === 'npm') {
      if (semver.lt(rushConfiguration.packageManagerToolVersion, MINIMUM_SUPPORTED_NPM_VERSION)) {
        return `The rush.json file requests NPM version `
          + rushConfiguration.packageManagerToolVersion
          + `, but NPM ${MINIMUM_SUPPORTED_NPM_VERSION} is the minimum supported by Rush.`;
      }
    }
  }
}
