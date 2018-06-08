// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';
import { SetWebpackPublicPathLoader } from './../SetWebpackPublicPathLoader';

describe('SetWebpackPublicPathLoader', () => {
  it('follows the Webpack loader interface', () => {
    assert.isDefined(SetWebpackPublicPathLoader);
    assert.isFunction(SetWebpackPublicPathLoader.pitch);

    assert.throws(() => new SetWebpackPublicPathLoader());
  });
});
