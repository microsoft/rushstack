// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import * as path from 'path';

import ShrinkwapFile from '../ShrinkwrapFile';

describe('NPM ShrinkwrapFile', () => {
  const filename: string = path.resolve(path.join(__dirname, './shrinkwrapFile/npm-shrinkwrap.json'));
  const shrinkwrapFile: ShrinkwapFile = ShrinkwapFile.loadFromFile('npm', filename)!;

  it('verifies root-level dependency', () => {
    shrinkwrapFile.hasCompatibleDependency('q', '~1.5.0');
  });

  it('verifies temp project dependencies', () => {
    // Found locally
    shrinkwrapFile.hasCompatibleDependency('jquery', '>=2.2.4 <3.0.0', '@rush-temp/project2');
    // Found at root
    shrinkwrapFile.hasCompatibleDependency('q', '~1.5.0', '@rush-temp/project2');
  });

  it('extracts temp projects successfully', () => {
    const tempProjectNames: ReadonlyArray<string> = shrinkwrapFile.getTempProjectNames();

    assert.deepEqual(tempProjectNames, ['@rush-temp/project1', '@rush-temp/project2']);
  });
});
