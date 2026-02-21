// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DisjointSet } from '../DisjointSet.ts';

describe(DisjointSet.name, () => {
  it('can disjoint two sets', () => {
    const disjointSet = new DisjointSet<{ id: number }>();
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    disjointSet.add(obj1);
    disjointSet.add(obj2);

    expect(disjointSet.isConnected(obj1, obj2)).toBe(false);
  });

  it('can disjoint multiple sets', () => {
    const disjointSet = new DisjointSet<{ id: number }>();
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };
    const obj4 = { id: 4 };
    disjointSet.add(obj1);
    disjointSet.add(obj2);
    disjointSet.add(obj3);
    disjointSet.add(obj4);

    expect(disjointSet.isConnected(obj1, obj2)).toBe(false);
    expect(disjointSet.isConnected(obj1, obj3)).toBe(false);
    expect(disjointSet.isConnected(obj1, obj4)).toBe(false);
  });

  it('can union two sets', () => {
    const disjointSet = new DisjointSet<{ id: number }>();
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    disjointSet.add(obj1);
    disjointSet.add(obj2);
    expect(disjointSet.isConnected(obj1, obj2)).toBe(false);

    disjointSet.union(obj1, obj2);
    expect(disjointSet.isConnected(obj1, obj2)).toBe(true);
  });

  it('can union two sets transitively', () => {
    const disjointSet = new DisjointSet<{ id: number }>();
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };
    disjointSet.add(obj1);
    disjointSet.add(obj2);
    disjointSet.add(obj3);

    disjointSet.union(obj1, obj2);
    expect(disjointSet.isConnected(obj1, obj2)).toBe(true);
    expect(disjointSet.isConnected(obj1, obj3)).toBe(false);
    expect(disjointSet.isConnected(obj2, obj3)).toBe(false);

    disjointSet.union(obj1, obj3);
    expect(disjointSet.isConnected(obj1, obj2)).toBe(true);
    expect(disjointSet.isConnected(obj2, obj3)).toBe(true);
    expect(disjointSet.isConnected(obj1, obj3)).toBe(true);
  });

  it('can union and disjoint sets', () => {
    const disjointSet = new DisjointSet<{ id: number }>();
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };
    const obj4 = { id: 4 };
    disjointSet.add(obj1);
    disjointSet.add(obj2);
    disjointSet.add(obj3);
    disjointSet.add(obj4);

    expect(disjointSet.isConnected(obj1, obj2)).toBe(false);
    expect(disjointSet.isConnected(obj1, obj3)).toBe(false);
    expect(disjointSet.isConnected(obj1, obj4)).toBe(false);

    disjointSet.union(obj1, obj2);
    expect(disjointSet.isConnected(obj1, obj2)).toBe(true);
    expect(disjointSet.isConnected(obj1, obj3)).toBe(false);
    expect(disjointSet.isConnected(obj1, obj4)).toBe(false);
  });

  it('can get all sets', () => {
    const disjointSet = new DisjointSet<{ id: number }>();
    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };
    disjointSet.add(obj1);
    disjointSet.add(obj2);
    disjointSet.add(obj3);

    disjointSet.union(obj1, obj2);

    const allSets: Iterable<Set<{ id: number }>> = disjointSet.getAllSets();

    const allSetList: Array<Set<{ id: number }>> = [];
    for (const set of allSets) {
      allSetList.push(set);
    }

    expect(allSetList.length).toBe(2);
    expect(Array.from(allSetList[0]).map((x) => x.id)).toEqual(expect.arrayContaining([1, 2]));
    expect(Array.from(allSetList[1]).map((x) => x.id)).toEqual(expect.arrayContaining([3]));
  });
});
