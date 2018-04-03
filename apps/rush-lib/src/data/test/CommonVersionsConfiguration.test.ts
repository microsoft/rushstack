// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// <reference types='mocha' />
import * as path from 'path';
import { assert } from 'chai';

import { CommonVersionsConfiguration } from '../CommonVersionsConfiguration';

describe('CommonVersionsConfiguration', () => {
  it('can load the file', () => {
    const filename: string = path.resolve(__dirname, 'jsonFiles', 'common-versions.json');
    const configuration: CommonVersionsConfiguration = CommonVersionsConfiguration.loadFromFile(filename);

    assert.equal(configuration.preferredVersions.get('@scope/library-1'), [ '~3.2.1' ]);
    assert.equal(configuration.xstitchPreferredVersions.get('library-2'), [ '1.2.3' ]);
    assert.deepEqual(configuration.allowedAlternativeVersions.get('library-3'), [ '^1.2.3' ]);
  });
});
