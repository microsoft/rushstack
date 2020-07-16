// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IInterface {
  element: string;
}

describe('Example Test', () => {
  it('Correctly tests stuff', () => {
    expect(true).toBeTruthy();
  });

  it('Correctly handles snapshots', () => {
    expect({ a: 1, b: 2, c: 3 }).toMatchSnapshot();
  });

  it('Correctly handles TypeScript constructs', () => {
    const interfaceInstance: IInterface = {
      element: 'a'
    };
    expect(interfaceInstance).toBeTruthy();
  });
});
