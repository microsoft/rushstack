// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import process from 'node:process';

import { EnvironmentMap } from '../EnvironmentMap';

describe(EnvironmentMap.name, () => {
  test('_sanityCheck() throws', () => {
    const map = new EnvironmentMap();
    const environmentObject = { A: '123' };
    expect(() => {
      // eslint-disable-next-line
      const combined = { ...environmentObject, ...map };
    }).toThrow();
  });

  test('Case-insensitive on windows', () => {
    const map = new EnvironmentMap();
    map.set('A', '1');
    map.set('a', '2');

    if (process.platform === 'win32') {
      expect([...map.entries()]).toMatchInlineSnapshot(`
        Array [
          Object {
            "name": "a",
            "value": "2",
          },
        ]
      `);
    } else {
      expect([...map.entries()]).toMatchInlineSnapshot(`
        Array [
          Object {
            "name": "A",
            "value": "1",
          },
          Object {
            "name": "a",
            "value": "2",
          },
        ]
      `);
    }
  });
});
