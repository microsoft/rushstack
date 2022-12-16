// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import { LastLinkFlag, LAST_LINK_FLAG_FILE_NAME } from '../LastLinkFlag';

const TEMP_DIR_PATH: string = `${__dirname}/temp`;

describe(LastLinkFlag.name, () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_DIR_PATH);
  });

  afterEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_DIR_PATH);
  });

  it('can get correct path', () => {
    const flag: LastLinkFlag = new LastLinkFlag(TEMP_DIR_PATH);
    expect(path.basename(flag.path)).toEqual(LAST_LINK_FLAG_FILE_NAME);
  });
});
