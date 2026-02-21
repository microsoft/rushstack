// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TestClass } from '../index.ts';

describe('An example test', () => {
  it('Is able to import things', () => {
    expect(TestClass.getTrue()).toBe(true);
  });
});
