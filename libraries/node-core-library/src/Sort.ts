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
   * @returns -1 if `x` is smaller than `y`, 1 if `x` is greater than `y`, or 0 if the values are equal.
   *
   * @example
   *
   * ```ts
   * let array: number[] = [3, 6, 2];
   * array.sort(Sort.compareByValue);  // [2, 3, 6]
   * ```
   */
  // tslint:disable-next-line:no-any
  public static compareByValue(x: any, y: any): number {
    if (x === y) {
      return 0;
    }
    if (x === undefined) {
      return -1;
    }
    if (x === null) {
      return -1;
    }
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
   *
   * @example
   *
   * ```ts
   * let array: string[] = [ 'aaa', 'bb', 'c' ];
   * Sort.sortBy(array, x => x.length);  // [ 'c', 'bb', 'aaa' ]
   * ```
   */
  // tslint:disable-next-line:no-any
  public static sortBy<T>(array: T[], keySelector: (element: T) => any, comparer: (x: any, y: any) => number
    = Sort.compareByValue): void {
    array.sort((x, y) => comparer(keySelector(x), keySelector(y)));
  }

  /**
   * Returns true if the array is already sorted.
   */
  // tslint:disable-next-line:no-any
  public static isSorted<T>(array: T[], comparer: (x: any, y: any) => number = Sort.compareByValue): boolean {
    let previous: T | undefined = undefined;
    for (const element of array) {
      if (comparer(previous, element) > 0) {
        return false;
      }
      previous = element;
    }
    return true;
  }

  /**
   * Returns true if the array is already sorted by the specified key.
   *
   * @example
   *
   * ```ts
   * let array: string[] = [ 'a', 'bb', 'ccc' ];
   * Sort.isSortedBy(array, x => x.length); // true
   * ```
   */
  // tslint:disable-next-line:no-any
  public static isSortedBy<T>(array: T[], keySelector: (element: T) => any, comparer: (x: any, y: any) => number
    = Sort.compareByValue): boolean {

    let previousKey: T | undefined = undefined;
    for (const element of array) {
      const key: T = keySelector(element);
      if (comparer(previousKey, key) > 0) {
        return false;
      }
      previousKey = key;
    }
    return true;
  }

  /**
   * Sorts the entries in a Map object according to the keys.
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
  // tslint:disable-next-line:no-any
  public static sortMapKeys<K, V>(map: Map<K, V>, keyComparer: (x: K, y: K) => number = Sort.compareByValue): void {
    const pairs: [K, V][] = Array.from(map.entries());

    // Sorting a map is expensive, so first check whether it's already sorted.
    if (Sort.isSortedBy(pairs, x => x[0], keyComparer)) {
      return;
    }

    Sort.sortBy(pairs, x => x[0], keyComparer);
    map.clear();
    for (const pair of pairs) {
      map.set(pair[0], pair[1]);
    }
  }

  /**
   * Sorts the entries in a Set object according to the keys.
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
  // tslint:disable-next-line:no-any
  public static sortSetBy<T>(set: Set<T>, keySelector: (element: T) => any,
    keyComparer: (x: T, y: T) => number = Sort.compareByValue): void {

    const array: T[] = Array.from(set);

    // Sorting a set is expensive, so first check whether it's already sorted.
    if (Sort.isSortedBy(array, keySelector, keyComparer)) {
      return;
    }

    array.sort((x, y) => keyComparer(keySelector(x), keySelector(y)));

    set.clear();
    for (const item of array) {
      set.add(item);
    }
  }

  /**
   * Sorts the entries in a Set object according to the keys.
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
  // tslint:disable-next-line:no-any
  public static sortSet<T>(set: Set<T>, comparer: (x: T, y: T) => number = Sort.compareByValue): void {
    const array: T[] = Array.from(set);

    // Sorting a set is expensive, so first check whether it's already sorted.
    if (Sort.isSorted(array, comparer)) {
      return;
    }

    array.sort((x, y) => comparer(x, y));

    set.clear();
    for (const item of array) {
      set.add(item);
    }
  }
}
