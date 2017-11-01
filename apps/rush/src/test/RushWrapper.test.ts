// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { assert } from 'chai';

import RushWrapper from '../RushWrapper';

describe('RushWrapper', () => {
  it('correctly calls the passed-in function on invoke', () => {
    let called: boolean = false;
    const wrapper: RushWrapper = new RushWrapper(() => called = true);
    wrapper.invokeRush();
    assert.isTrue(called);
  });
});
