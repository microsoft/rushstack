// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonObject } from '@rushstack/node-core-library';

import { BaseFlagFile } from './BaseFlagFile';

export const LAST_LINK_FLAG_FILE_NAME: string = 'last-link.flag';

/**
 * A helper class for managing the last-link flag, which is persistent and
 * indicates that linking was completed successfully.
 * @internal
 */
export class LastLinkFlag extends BaseFlagFile {
  /**
   * Creates a new LastLink flag
   * @param folderPath - the folder that this flag is managing
   */
  public constructor(folderPath: string) {
    super(path.join(folderPath, LAST_LINK_FLAG_FILE_NAME));
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   */
  public isValid(): boolean {
    const oldState: JsonObject | undefined = this.loadFromFile();
    return !!oldState;
  }
}
