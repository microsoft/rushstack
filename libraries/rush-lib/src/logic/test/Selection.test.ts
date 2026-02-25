// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IPartialProject, Selection } from '../Selection.ts';

const { union, intersection, expandAllDependencies, expandAllConsumers } = Selection;

interface ISimpleGraphable extends IPartialProject<ISimpleGraphable> {
  consumingProjects: Set<ISimpleGraphable>;
  toString(): string;
}

const projectA: ISimpleGraphable = {
  dependencyProjects: new Set(),
  consumingProjects: new Set(),
  toString() {
    return 'A';
  }
};
const projectB: ISimpleGraphable = {
  dependencyProjects: new Set(),
  consumingProjects: new Set(),
  toString() {
    return 'B';
  }
};
const projectC: ISimpleGraphable = {
  dependencyProjects: new Set(),
  consumingProjects: new Set(),
  toString() {
    return 'C';
  }
};
const projectD: ISimpleGraphable = {
  dependencyProjects: new Set([projectA, projectB]),
  consumingProjects: new Set(),
  toString() {
    return 'D';
  }
};
const projectE: ISimpleGraphable = {
  dependencyProjects: new Set([projectC, projectD]),
  consumingProjects: new Set(),
  toString() {
    return 'E';
  }
};
const projectF: ISimpleGraphable = {
  dependencyProjects: new Set([projectE]),
  consumingProjects: new Set(),
  toString() {
    return 'F';
  }
};
const projectG: ISimpleGraphable = {
  dependencyProjects: new Set(),
  consumingProjects: new Set(),
  toString() {
    return 'G';
  }
};
const projectH: ISimpleGraphable = {
  dependencyProjects: new Set([projectF, projectG]),
  consumingProjects: new Set(),
  toString() {
    return 'H';
  }
};

const nodes: Set<ISimpleGraphable> = new Set([
  projectA,
  projectB,
  projectC,
  projectD,
  projectE,
  projectF,
  projectG,
  projectH
]);

// Populate the bidirectional graph
for (const node of nodes) {
  for (const dep of node.dependencyProjects) {
    dep.consumingProjects.add(node);
  }
}

expect.extend({
  toMatchSet<T>(received: ReadonlySet<T>, expected: ReadonlySet<T>): jest.CustomMatcherResult {
    for (const element of expected) {
      if (!received.has(element)) {
        return {
          pass: false,
          message: () => `Expected [${[...received].join(', ')}] to contain ${element}`
        };
      }
    }
    for (const element of received) {
      if (!expected.has(element)) {
        return {
          pass: false,
          message: () => `Expected [${[...received].join(', ')}] to not contain ${element}`
        };
      }
    }

    return {
      pass: true,
      message: () => `Expected [${[...received].join(', ')}] to not match [${[...expected].join(', ')}]`
    };
  }
});

declare global {
  // Disabling eslint here because it is needed for module augmentation
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface Matchers<R, T = {}> {
      toMatchSet(expected: T): R;
    }
  }
}

describe(union.name, () => {
  it('combines sets', () => {
    const result: ReadonlySet<ISimpleGraphable> = union(
      [projectA, projectB],
      [projectC],
      [projectA],
      [projectB]
    );

    expect(result).toMatchSet(new Set([projectA, projectB, projectC]));
  });
});

describe(intersection.name, () => {
  it('intersects sets', () => {
    const result: ReadonlySet<ISimpleGraphable> = intersection(
      [projectC, projectD],
      new Set([projectD, projectE, projectG, projectA]),
      new Set([projectD])
    );

    expect(result).toMatchSet(new Set([projectD]));
  });

  it('will produce the empty set in nothing matches', () => {
    const result: ReadonlySet<ISimpleGraphable> = intersection(
      [projectC, projectD],
      new Set([projectE, projectG, projectA]),
      new Set([projectD])
    );

    expect(result).toMatchSet(new Set());
  });

  it('handles identical inputs', () => {
    const result: ReadonlySet<ISimpleGraphable> = intersection(nodes, nodes, nodes);

    expect(result).toMatchSet(nodes);
  });
});

describe(expandAllDependencies.name, () => {
  it('expands at least one level of dependencies', () => {
    const result: ReadonlySet<ISimpleGraphable> = expandAllDependencies([projectD]);

    expect(result).toMatchSet(new Set([projectA, projectB, projectD]));
  });
  it('expands all levels of dependencies', () => {
    const result: ReadonlySet<ISimpleGraphable> = expandAllDependencies([projectF]);

    expect(result).toMatchSet(new Set([projectA, projectB, projectC, projectD, projectE, projectF]));
  });
  it('handles multiple inputs', () => {
    const result: ReadonlySet<ISimpleGraphable> = expandAllDependencies([projectC, projectD]);

    expect(result).toMatchSet(new Set([projectA, projectB, projectC, projectD]));
  });
});

describe(expandAllConsumers.name, () => {
  it('expands at least one level of dependents', () => {
    const result: ReadonlySet<ISimpleGraphable> = expandAllConsumers([projectF]);

    expect(result).toMatchSet(new Set([projectF, projectH]));
  });
  it('expands all levels of dependents', () => {
    const result: ReadonlySet<ISimpleGraphable> = expandAllConsumers([projectC]);

    expect(result).toMatchSet(new Set([projectC, projectE, projectF, projectH]));
  });
  it('handles multiple inputs', () => {
    const result: ReadonlySet<ISimpleGraphable> = expandAllConsumers([projectC, projectB]);

    expect(result).toMatchSet(new Set([projectB, projectC, projectD, projectE, projectF, projectH]));
  });
});
