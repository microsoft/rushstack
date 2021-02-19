// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EnvironmentMap } from '../EnvironmentMap';

describe('EnvironmentMap', () => {
  test('_sanityCheck() throws', () => {
    const map = new EnvironmentMap();
    const environmentObject = { A: '123' };
    expect(() => {
      // eslint-disable-next-line
      const combined = { ...environmentObject, ...map };
    }).toThrow();
  });
});
