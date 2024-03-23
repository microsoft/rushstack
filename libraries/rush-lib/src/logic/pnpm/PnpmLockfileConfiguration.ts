// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { AlreadyReportedError, FileSystem } from '@rushstack/node-core-library';
import yaml from 'js-yaml';
import type { Lockfile } from '@pnpm/lockfile-types';
import type { ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../../api/RushConfiguration';
import { CustomTipId } from '../../api/CustomTipsConfiguration';

export class PnpmLockfileConfiguration {
  /**
   * Determine whether `pnpm-lock.yaml` complies with the rules specified in `common/config/rush/pnpm-config.schema.json`.
   * @internal
   */
  public static async validateLockfile(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    filename: string
  ): Promise<void> {
    const pnpmLockfilePolicies: [string, boolean][] = Object.entries(
      rushConfiguration.pnpmOptions.pnpmLockfilePolicies ?? {}
    );

    if (pnpmLockfilePolicies && pnpmLockfilePolicies.length > 0) {
      const lockfileRawContent: string = await FileSystem.readFileAsync(filename);
      const lockfile: Lockfile = yaml.load(lockfileRawContent);

      for (const [policy, enabled] of pnpmLockfilePolicies) {
        if (enabled) {
          switch (policy) {
            case 'disallowInsecureSha1': {
              PnpmLockfileConfiguration.disallowInsecureSha1(terminal, rushConfiguration, lockfile);
              break;
            }

            default: {
              throw new Error(`Unknown pnpm lockfile policy "${policy}"`);
            }
          }
        }
      }
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
      for (const { resolution } of Object.values(packages)) {
        if ((resolution as { integrity: string }).integrity.startsWith('sha1')) {
          rushConfiguration.customTipsConfiguration._showErrorTip(
            terminal,
            CustomTipId.TIP_PNPM_DISALLOW_INSECURE_SHA1
          );
          throw new AlreadyReportedError();
        }
      }
    }
  }
}