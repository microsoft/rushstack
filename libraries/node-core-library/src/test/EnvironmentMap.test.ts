// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import process from 'node:process';

import { EnvironmentMap } from '../EnvironmentMap';

describe(EnvironmentMap.name, () => {
  describe(EnvironmentMap.prototype.equals.name, () => {
    it('compares values and names independently of insertion order', () => {
      const map = new EnvironmentMap({ A: '1', B: '' });
      expect(map.equals(new EnvironmentMap({ B: '', A: '1' }))).toBe(true);
      expect(map.equals(new EnvironmentMap({ A: '2', B: '' }))).toBe(false);
      expect(map.equals(new EnvironmentMap({ A: '1', C: '' }))).toBe(false);
      expect(map.equals(new EnvironmentMap({ A: '1' }))).toBe(false);
      expect(map.equals(new EnvironmentMap({ A: '1', B: '', C: '3' }))).toBe(false);
    });

    it('distinguishes empty values from missing variables', () => {
      const missing = new EnvironmentMap();
      expect(missing.equals(new EnvironmentMap({ A: undefined }))).toBe(true);
      expect(missing.equals(new EnvironmentMap({ A: '' }))).toBe(false);
      expect(new EnvironmentMap({ A: '' }).equals(missing)).toBe(false);
    });

    it.each(['win32', 'linux'])('respects %s variable-name semantics', (platform) => {
      const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
      try {
        const upper = new EnvironmentMap({ A: '1' });
        const lower = new EnvironmentMap({ a: '1' });
        expect(upper.equals(lower)).toBe(platform === 'win32');
        expect(lower.equals(upper)).toBe(platform === 'win32');
        expect(upper.equals(new EnvironmentMap({ a: '2' }))).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', descriptor);
      }
    });

    it('does not equate maps with different lookup semantics', () => {
      const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
      try {
        Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' });
        const insensitive = new EnvironmentMap({ A: '1' });
        Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' });
        const sensitive = new EnvironmentMap({ A: '1' });
        expect(insensitive.equals(sensitive)).toBe(false);
        expect(sensitive.equals(insensitive)).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', descriptor);
      }
    });
  });

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
