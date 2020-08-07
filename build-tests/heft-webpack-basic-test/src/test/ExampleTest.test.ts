// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MyClass } from '../MyClass';

describe('Example Test', () => {
  it('Correctly tests stuff', () => {
    const myClass: MyClass = new MyClass();
    expect(myClass.doSomething()).toBeTruthy();
  });
});
