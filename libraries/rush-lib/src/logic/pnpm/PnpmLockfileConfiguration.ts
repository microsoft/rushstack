// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { AlreadyReportedError } from '@rushstack/node-core-library';
import fs from 'fs';
import yaml from 'js-yaml';
import type { Lockfile } from '@pnpm/lockfile-types';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import { CustomTipId } from '../../api/CustomTipsConfiguration';
import type { PnpmLockfilePolicy } from './PnpmOptionsConfiguration';

export class PnpmLockfileConfiguration {
  /**
   * Determine whether `pnpm-lock.yaml` complies with the rules specified in `common/config/rush/pnpm-config.schema.json`.
   * @internal
   */
  public static pnpmLockValidation(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    filename: string
  ): void {
    const pnpmLockfilePolicies: PnpmLockfilePolicy[] | undefined =
      rushConfiguration.pnpmOptions.pnpmLockfilePolicies;
    if (pnpmLockfilePolicies && pnpmLockfilePolicies.length > 0) {
      const lockfileRawContent: string = fs.readFileSync(filename, 'utf-8');
      const lockfile: Lockfile = yaml.load(lockfileRawContent);
      pnpmLockfilePolicies.forEach((policy) => this[policy](terminal, rushConfiguration, lockfile));
    }
  }

  /**
   * Determine whether `pnpm-lock.yaml` contains insecure sha1.
   * @internal
   */
  public static disallowInsecureSha1(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    lockfile: Lockfile
  ): void {
    const { packages } = lockfile;
    if (packages) {
      Object.entries(packages).forEach(([, { resolution }]) => {
        if ((resolution as { integrity: string }).integrity.startsWith('sha1')) {
          rushConfiguration.customTipsConfiguration._showErrorTip(
            terminal,
            CustomTipId.TIP_PNPM_DISALLOW_INSECURE_SHA1
          );
          throw new AlreadyReportedError();
        }
      });
    }
  }
}
