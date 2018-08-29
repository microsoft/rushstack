// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { add } from '../test';

describe('foo test', () => {
  it('can assert using chai', () => {
    expect(add(1, 2) === 3);
  });

  it('can assert using jest', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('can test snapshot', () => {
    expect(add(2 / 3, 9 / 11)).toMatchSnapshot();
  });
});
