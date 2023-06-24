// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This namespace contains functions for manipulating sets of projects
 */
export class Selection {
  /**
   * Computes the set of projects that are not in the input set.
   */
  public static difference<T>(first: Iterable<T>, ...rest: ReadonlySet<T>[]): Set<T> {
    return new Set(generateDifference(first, ...rest));
  }

  /**
   * Computes the set of direct dependencies of the listed projects.
   */
  public static directDependenciesOf<T>(input: Iterable<T>, expandFn: (target: T) => ReadonlySet<T>): Set<T> {
    const result: Set<T> = new Set();
    for (const item of input) {
      expandInto(result, item, expandFn);
    }
    return result;
  }

  /**
   * Computes the intersection of two or more sets.
   */
  public static intersection<T>(first: Iterable<T>, ...rest: ReadonlySet<T>[]): Set<T> {
    return new Set(generateIntersection(first, ...rest));
  }

  /**
   * Computes the union of two or more sets.
   */
  public static union<T>(...sets: Iterable<T>[]): Set<T> {
    return new Set(generateConcatenation<T>(...sets));
  }

  /**
   * Computes a set that contains all inputs and recursively expanded inputs.
   */
  public static recursiveExpand<T>(input: Iterable<T>, expandFn: (target: T) => ReadonlySet<T>): Set<T> {
    return expandAll(input, expandFn);
  }
}

function* generateDifference<T>(first: Iterable<T>, ...rest: ReadonlySet<T>[]): Iterable<T> {
  for (const item of first) {
    if (rest.every((set: ReadonlySet<T>) => !set.has(item))) {
      yield item;
    }
  }
}

function* generateIntersection<T>(first: Iterable<T>, ...rest: ReadonlySet<T>[]): Iterable<T> {
  for (const item of first) {
    if (rest.every((set: ReadonlySet<T>) => set.has(item))) {
      yield item;
    }
  }
}

function* generateConcatenation<T>(...sets: Iterable<T>[]): Iterable<T> {
  for (const set of sets) {
    yield* set;
  }
}

function expandInto<T>(targetSet: Set<T>, input: T, expandFn: (target: T) => ReadonlySet<T>): void {
  for (const child of expandFn(input)) {
    targetSet.add(child);
  }
}

/**
 * Computes a set derived from the input by cloning it, then iterating over every member of the new set and
 * calling a step function that may add more elements to the set.
 */
function expandAll<T>(input: Iterable<T>, expandFn: (target: T) => ReadonlySet<T>): Set<T> {
  const result: Set<T> = new Set(input);
  for (const item of result) {
    expandInto(result, item, expandFn);
  }
  return result;
}
