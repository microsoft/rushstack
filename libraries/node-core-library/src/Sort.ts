// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Operations for sorting collections.
 *
 * @public
 */
export class Sort {
  /**
   * Compares `x` and `y` using the JavaScript `>` and `<` operators.  This function is suitable for usage as
   * the callback for `array.sort()`.
   *
   * @remarks
   *
   * The JavaScript ordering is generalized so that `undefined` \< `null` \< all other values.
   *
   * @returns -1 if `x` is smaller than `y`, 1 if `x` is greater than `y`, or 0 if the values are equal.
   *
   * @example
   *
   * ```ts
   * let array: number[] = [3, 6, 2];
   * array.sort(Sort.compareByValue);  // [2, 3, 6]
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static compareByValue(x: any, y: any): number {
    if (x === y) {
      return 0;
    }

    // Undefined is smaller than anything else
    if (x === undefined) {
      return -1;
    }
    if (y === undefined) {
      return 1;
    }

    // Null is smaller than anything except undefined
    if (x === null) {
      return -1;
    }
    if (y === null) {
      return 1;
    }

    // These comparisons always return false if either of the arguments is "undefined".
    // These comparisons return nonsense for "null" (true for "null > -1", but false for "null < 0" and "null > 0")
    if (x < y) {
      return -1;
    }
    if (x > y) {
      return 1;
    }

    return 0;
  }

  /**
   * Sorts the array according to a key which is obtained from the array elements.
   * The result is guaranteed to be a stable sort.
   *
   * @example
   *
   * ```ts
   * let array: string[] = [ 'aaa', 'bb', 'c' ];
   * Sort.sortBy(array, x => x.length);  // [ 'c', 'bb', 'aaa' ]
   * ```
   */
  public static sortBy<T>(
    array: T[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keySelector: (element: T) => any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comparer: (x: any, y: any) => number = Sort.compareByValue
  ): void {
    array.sort((x, y) => comparer(keySelector(x), keySelector(y)));
  }

  /**
   * Returns true if the collection is already sorted.
   */
  public static isSorted<T>(
    collection: Iterable<T>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comparer: (x: any, y: any) => number = Sort.compareByValue
  ): boolean {
    let isFirst: boolean = true;
    let previous: T | undefined = undefined;
    for (const element of collection) {
      if (isFirst) {
        // Don't start by comparing against undefined.
        isFirst = false;
      } else if (comparer(previous, element) > 0) {
        return false;
      }
      previous = element;
    }
    return true;
  }

  /**
   * Returns true if the collection is already sorted by the specified key.
   *
   * @example
   *
   * ```ts
   * let array: string[] = [ 'a', 'bb', 'ccc' ];
   * Sort.isSortedBy(array, x => x.length); // true
   * ```
   */
  public static isSortedBy<T>(
    collection: Iterable<T>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keySelector: (element: T) => any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    comparer: (x: any, y: any) => number = Sort.compareByValue
  ): boolean {
    let isFirst: boolean = true;
    let previousKey: T | undefined = undefined;
    for (const element of collection) {
      const key: T = keySelector(element);
      if (isFirst) {
        // Don't start by comparing against undefined.
        isFirst = false;
      } else if (comparer(previousKey, key) > 0) {
        return false;
      }
      previousKey = key;
    }
    return true;
  }

  /**
   * Sorts the entries in a Map object according to the map keys.
   * The result is guaranteed to be a stable sort.
   *
   * @example
   *
   * ```ts
   * let map: Map<string, number> = new Map<string, number>();
   * map.set('zebra', 1);
   * map.set('goose', 2);
   * map.set('aardvark', 3);
   * Sort.sortMapKeys(map);
   * console.log(JSON.stringify(Array.from(map.keys()))); // ["aardvark","goose","zebra"]
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static sortMapKeys<K, V>(
    map: Map<K, V>,
    keyComparer: (x: K, y: K) => number = Sort.compareByValue
  ): void {
    // Sorting a map is expensive, so first check whether it's already sorted.
    if (Sort.isSorted(map.keys(), keyComparer)) {
      return;
    }

    const pairs: [K, V][] = Array.from(map.entries());

    Sort.sortBy(pairs, (x) => x[0], keyComparer);
    map.clear();
    for (const pair of pairs) {
      map.set(pair[0], pair[1]);
    }
  }

  /**
   * Sorts the entries in a Set object according to the specified keys.
   * The result is guaranteed to be a stable sort.
   *
   * @example
   *
   * ```ts
   * let set: Set<string> = new Set<string>();
   * set.add('aaa');
   * set.add('bb');
   * set.add('c');
   * Sort.sortSetBy(set, x => x.length);
   * console.log(Array.from(set)); // ['c', 'bb', 'aaa']
   * ```
   */
  public static sortSetBy<T>(
    set: Set<T>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keySelector: (element: T) => any,
    keyComparer: (x: T, y: T) => number = Sort.compareByValue
  ): void {
    // Sorting a set is expensive, so first check whether it's already sorted.
    if (Sort.isSortedBy(set, keySelector, keyComparer)) {
      return;
    }

    const array: T[] = Array.from(set);
    array.sort((x, y) => keyComparer(keySelector(x), keySelector(y)));

    set.clear();
    for (const item of array) {
      set.add(item);
    }
  }

  /**
   * Sorts the entries in a Set object.  The result is guaranteed to be a stable sort.
   *
   * @example
   *
   * ```ts
   * let set: Set<string> = new Set<string>();
   * set.add('zebra');
   * set.add('goose');
   * set.add('aardvark');
   * Sort.sortSet(set);
   * console.log(Array.from(set)); // ['aardvark', 'goose', 'zebra']
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static sortSet<T>(set: Set<T>, comparer: (x: T, y: T) => number = Sort.compareByValue): void {
    // Sorting a set is expensive, so first check whether it's already sorted.
    if (Sort.isSorted(set, comparer)) {
      return;
    }

    const array: T[] = Array.from(set);
    array.sort((x, y) => comparer(x, y));

    set.clear();
    for (const item of array) {
      set.add(item);
    }
  }

  /**
   * Sort the keys given in an object
   *
   * @example
   *
   * ```ts
   * console.log(Sort.sortKeys({ c: 3, b: 2, a: 1 })); // { a: 1, b: 2, c: 3}
   * ```
   */
  public static sortKeys<T extends Partial<Record<string, unknown>> | unknown[]>(
    object: T,
    { deep, compare }: { deep?: boolean; compare?: (x: string, y: string) => number } = {
      deep: false,
      compare: Sort.compareByValue
    }
  ): T {
    function isPlainObject(obj: unknown): obj is object {
      return obj !== null && typeof obj === 'object';
    }
    if (!isPlainObject(object) && !Array.isArray(object)) {
      throw new TypeError(`Expected object or array`);
    }

    const cache: WeakMap<
      Partial<Record<string, unknown>> | unknown[],
      Partial<Record<string, unknown>> | unknown[]
    > = new WeakMap();

    function innerSortArray(arr: unknown[]): unknown[] {
      const resultFromCache: undefined | Partial<Record<string, unknown>> | unknown[] = cache.get(arr);
      if (resultFromCache !== undefined) {
        return resultFromCache as unknown[];
      }
      const result: unknown[] = [];
      cache.set(arr, result);
      if (deep) {
        result.push(
          ...arr.map((entry) => {
            if (Array.isArray(entry)) {
              return innerSortArray(entry);
            } else if (isPlainObject(entry)) {
              return innerSortKeys(entry);
            }
            return entry;
          })
        );
      } else {
        result.push(...arr);
      }

      return result;
    }
    function innerSortKeys(obj: Partial<Record<string, unknown>>): Partial<Record<string, unknown>> {
      const resultFromCache: undefined | Partial<Record<string, unknown>> | unknown[] = cache.get(obj);
      if (resultFromCache !== undefined) {
        return resultFromCache as Partial<Record<string, unknown>>;
      }
      const result: Partial<Record<string, unknown>> = {};
      const keys: string[] = Object.keys(obj).sort(compare);

      cache.set(obj, result);

      for (const key of keys) {
        const value: unknown = obj[key];
        let newValue: unknown;
        if (deep) {
          if (Array.isArray(value)) {
            newValue = innerSortArray(value);
          } else if (isPlainObject(value)) {
            newValue = innerSortKeys(value);
          } else {
            newValue = value;
          }
        } else {
          newValue = value;
        }
        Object.defineProperty(result, key, {
          ...Object.getOwnPropertyDescriptor(obj, key),
          value: newValue
        });
      }

      return result;
    }

    return Array.isArray(object) ? (innerSortArray(object) as T) : (innerSortKeys(object) as T);
  }
}
