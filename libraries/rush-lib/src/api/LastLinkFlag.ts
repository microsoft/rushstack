// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { BaseFlag } from './base/BaseFlag';

import type { RushConfiguration } from './RushConfiguration';

export const LAST_LINK_FLAG_FILE_NAME: string = 'last-link.flag';

/**
 * A helper class for managing the last-link flag, which is persistent and
 * indicates that linking was completed successfully.
 * @internal
 */
export class LastLinkFlag extends BaseFlag {
  protected get flagName(): string {
    return LAST_LINK_FLAG_FILE_NAME;
  }
}

/**
 * A helper class for LastLinkFlag
 *
 * @internal
 */
export class LastLinkFlagFactory {
  /**
   * Gets the LastLink flag and sets the current state. This state is used to compare
   * against the last-known-good state tracked by the LastLink flag.
   * @param rushConfiguration - the configuration of the Rush repo to get the install
   * state from
   *
   * @internal
   */
  public static getCommonTempFlag(rushConfiguration: RushConfiguration): LastLinkFlag {
    return new LastLinkFlag(rushConfiguration.commonTempFolder, {});
  }

  // FIXME: It seems Link won't happen in split workspace, ignore for now
}
