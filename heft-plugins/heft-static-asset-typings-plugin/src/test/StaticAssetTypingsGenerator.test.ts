// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { hasChanges } from '../StaticAssetTypingsGenerator.js';

describe('hasChanges', () => {
  it('returns false for two empty maps', () => {
    const current: Map<string, string> = new Map();
    const old: Map<string, string> = new Map();
    expect(hasChanges(current, old)).toBe(false);
  });

  it('returns false for identical maps', () => {
    const current: Map<string, string> = new Map([
      ['a.png', 'v1'],
      ['b.png', 'v2']
    ]);
    const old: Map<string, string> = new Map([
      ['a.png', 'v1'],
      ['b.png', 'v2']
    ]);
    expect(hasChanges(current, old)).toBe(false);
  });

  it('returns true when current has more entries', () => {
    const current: Map<string, string> = new Map([
      ['a.png', 'v1'],
      ['b.png', 'v2']
    ]);
    const old: Map<string, string> = new Map([['a.png', 'v1']]);
    expect(hasChanges(current, old)).toBe(true);
  });

  it('returns true when old has more entries', () => {
    const current: Map<string, string> = new Map([['a.png', 'v1']]);
    const old: Map<string, string> = new Map([
      ['a.png', 'v1'],
      ['b.png', 'v2']
    ]);
    expect(hasChanges(current, old)).toBe(true);
  });

  it('returns true when a value differs', () => {
    const current: Map<string, string> = new Map([
      ['a.png', 'v1'],
      ['b.png', 'v3']
    ]);
    const old: Map<string, string> = new Map([
      ['a.png', 'v1'],
      ['b.png', 'v2']
    ]);
    expect(hasChanges(current, old)).toBe(true);
  });

  it('returns true when a key differs', () => {
    const current: Map<string, string> = new Map([['a.png', 'v1']]);
    const old: Map<string, string> = new Map([['b.png', 'v1']]);
    expect(hasChanges(current, old)).toBe(true);
  });

  it('returns true when current is empty and old has entries', () => {
    const current: Map<string, string> = new Map();
    const old: Map<string, string> = new Map([['a.png', 'v1']]);
    expect(hasChanges(current, old)).toBe(true);
  });

  it('returns true when current has entries and old is empty', () => {
    const current: Map<string, string> = new Map([['a.png', 'v1']]);
    const old: Map<string, string> = new Map();
    expect(hasChanges(current, old)).toBe(true);
  });
});
