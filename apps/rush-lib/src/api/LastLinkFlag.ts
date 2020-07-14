// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { FlagFileBase } from './FlagFileBase';

export const LAST_LINK_FLAG_FILE_NAME: string = 'last-link.flag';

/**
 * The interface for the LastLinkFlag JSON file.
 *
 * @internal
 */
export interface ILastLinkFlagJson {}

/**
 * A helper class for managing the last-link flag, which is persistent and
 * indicates that linking was completed successfully.
 * @internal
 */
export class LastLinkFlag extends FlagFileBase<ILastLinkFlagJson> {
  /**
   * Creates a new LastLink flag
   * @param folderPath - the folder that this flag is managing
   */
  public constructor(folderPath: string, state: ILastLinkFlagJson = {}) {
    super(path.join(folderPath, LAST_LINK_FLAG_FILE_NAME), state);
  }

  /**
   * Returns true if the file exists and the contents match the current state.
   */
  public isValid(): boolean {
    const oldState: ILastLinkFlagJson | undefined = this.loadFromFile();
    return !!oldState;
  }
}
