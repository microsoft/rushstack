// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This namespace contains functions for manipulating sets of projects
 */
export class Selection {
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
   * Computes a set that contains the input projects and all the direct and indirect dependencies thereof.
   */
  public static expandAllDependencies<T>(
    input: Iterable<T>,
    getDependencies: (target: T) => ReadonlySet<T>
  ): Set<T> {
    return expandAll(input, getExpandDependenciesStep(getDependencies));
  }

  /**
   * Computes a set that contains the input projects and all projects that directly or indirectly depend on them.
   */
  public static expandAllConsumers<T>(
    input: Iterable<T>,
    getConsumers: (target: T) => ReadonlySet<T>
  ): Set<T> {
    return expandAll(input, getExpandConsumersStep(getConsumers));
  }

  /**
   * Iterates the direct dependencies of the listed projects. May contain duplicates.
   */
  public static *directDependenciesOf<T>(
    input: Iterable<T>,
    getDependencies: (input: T) => ReadonlySet<T>
  ): Iterable<T> {
    for (const item of input) {
      yield* getDependencies(item);
    }
  }

  /**
   * Iterates the projects that declare any of the listed projects as a dependency. May contain duplicates.
   */
  public static *directConsumersOf<T>(
    input: Iterable<T>,
    getConsumers: (input: T) => ReadonlySet<T>
  ): Iterable<T> {
    for (const item of input) {
      yield* getConsumers(item);
    }
  }
}

/**
 * Function used for incremental mutation of a set, e.g. when expanding dependencies or dependents
 */
interface IExpansionStepFunction<T> {
  (project: T, targetSet: Set<T>): void;
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

/**
 * Adds all dependencies of the specified project to the target set.
 */
function getExpandDependenciesStep<T>(
  getDependencies: (target: T) => ReadonlySet<T>
): IExpansionStepFunction<T> {
  function expandDependenciesStep(target: T, targetSet: Set<T>): void {
    for (const dep of getDependencies(target)) {
      targetSet.add(dep);
    }
  }
  return expandDependenciesStep;
}
/**
 * Adds all projects that declare the specified project as a dependency to the target set.
 */
function getExpandConsumersStep<T>(getConsumers: (target: T) => ReadonlySet<T>): IExpansionStepFunction<T> {
  function expandConsumersStep(target: T, targetSet: Set<T>): void {
    for (const dep of getConsumers(target)) {
      targetSet.add(dep);
    }
  }
  return expandConsumersStep;
}

/**
 * Computes a set derived from the input by cloning it, then iterating over every member of the new set and
 * calling a step function that may add more elements to the set.
 */
function expandAll<T>(input: Iterable<T>, expandStep: IExpansionStepFunction<T>): Set<T> {
  const result: Set<T> = new Set(input);
  for (const item of result) {
    expandStep(item, result);
  }
  return result;
}
