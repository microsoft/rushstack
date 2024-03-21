// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError, FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import fs from 'fs';
import yaml from 'js-yaml';
import type { Lockfile } from '@pnpm/lockfile-types';
import type { ITerminal } from '@rushstack/terminal';

import schemaJson from '../schemas/pnpm-lock-validation.schema.json';
import type { RushConfiguration } from './RushConfiguration';
import { CustomTipId } from './CustomTipsConfiguration';

export interface IPnpmValidationJson {
  pnpmLockValidationRules?: Array<{
    ruleName: 'validateIntegritySha1';
    description: string;
    pattern: string;
  }>;
}

/**
 * Used to access the `common/config/rush/pnpm-lock-validation.json` config file,
 * which used to validate `pnpm-lock.yaml` file.
 * @beta
 */
export class PnpmLockValidationConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  public readonly pnpmLockValidationRules: IPnpmValidationJson['pnpmLockValidationRules'];

  public constructor(configFilePath: string) {
    let configuration: IPnpmValidationJson | undefined;
    try {
      configuration = JsonFile.loadAndValidate(configFilePath, PnpmLockValidationConfiguration._jsonSchema);
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }

    this.pnpmLockValidationRules = configuration?.pnpmLockValidationRules ?? [];
  }

  /**
   * Determine whether `pnpm-lock.yaml` complies with the rules specified in `common/config/rush/pnpm-lock-validation.json`.
   * @internal
   */
  public _pnpmLockValidation(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    filename: string
  ): void {
    const lockfileRawContent: string = fs.readFileSync(filename, 'utf-8');
    const lockfile: Lockfile = yaml.load(lockfileRawContent);
    this.pnpmLockValidationRules?.forEach(({ ruleName, pattern }) =>
      this[`_${ruleName}`](terminal, rushConfiguration, lockfile, pattern)
    );
  }

  /**
   * Validate whether pnpm-lock.yaml integrity contains sha1.
   * @internal
   */
  public _validateIntegritySha1(
    terminal: ITerminal,
    rushConfiguration: RushConfiguration,
    lockfile: Lockfile,
    pattern: string
  ): void {
    const { packages } = lockfile;
    if (packages) {
      Object.entries(packages).forEach(([, { resolution }]) => {
        if (new RegExp(pattern).test((resolution as { integrity: string }).integrity)) {
          rushConfiguration.customTipsConfiguration._showErrorTip(
            terminal,
            CustomTipId.TIP_PNPM_FORBID_SHA1_INTEGRITY
          );
          throw new AlreadyReportedError();
        }
      });
    }
  }
}
