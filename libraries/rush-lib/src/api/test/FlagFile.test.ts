// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { FileSystem } from '@rushstack/node-core-library';

import { FlagFile } from '../FlagFile.ts';
import { RushConstants } from '../../logic/RushConstants.ts';

const TEMP_DIR_PATH: string = `${__dirname}/temp`;

describe(FlagFile.name, () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_DIR_PATH);
  });

  afterEach(() => {
    FileSystem.ensureEmptyFolder(TEMP_DIR_PATH);
  });

  it('can get correct path', () => {
    const flag: FlagFile = new FlagFile(TEMP_DIR_PATH, RushConstants.lastLinkFlagFilename, {});
    expect(path.basename(flag.path)).toEqual(RushConstants.lastLinkFlagFilename + '.flag');
  });
});
