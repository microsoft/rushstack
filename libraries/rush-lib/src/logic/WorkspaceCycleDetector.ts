// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import { RushConstants } from './RushConstants';

/**
 * Detects cycles in the workspace package dependency graph (i.e., cycles that are not
 * broken by `decoupledLocalDependencies`) and reports them as errors.
 *
 * @remarks
 * A cycle means that pnpm would be unable to install the workspace, so it is better to
 * fail fast with a clear message rather than let pnpm produce a cryptic error.
 *
 * The fix is to refactor the code to eliminate the cycle, for example by extracting shared
 * code into a new package that both projects can depend on, or by moving code from one project
 * to another. `decoupledLocalDependencies` is intended only for the bootstrapping problem
 * (e.g. the version of a compiler used to compile itself) and should not be used as a
 * general escape hatch for cycles.
 */
export function detectAndReportWorkspaceCycles(
  rushConfiguration: RushConfiguration,
  terminal: ITerminal
): void {
  const cycle: ReadonlyArray<string> | undefined = _findWorkspaceCycle(rushConfiguration.projects);

  if (cycle !== undefined) {
    terminal.writeLine();
    terminal.writeLine(
      Colorize.red(
        'A cyclic dependency was detected among workspace packages:\n' +
          `  ${cycle.join(' -> ')}\n\n` +
          `To fix this, refactor the code to eliminate the cycle. For example, extract the shared ` +
          `code into a new package that both projects can depend on, or move code from one project ` +
          `to another so the dependency only goes in one direction.\n\n` +
          `NOTE: The "decoupledLocalDependencies" setting in ${RushConstants.rushJsonFilename} is ` +
          `intended only for the bootstrapping problem (for example, the version of a compiler used ` +
          `to compile itself). It is not a general solution for cyclic dependencies.`
      )
    );
    throw new AlreadyReportedError();
  }
}

/**
 * Finds one cycle in the workspace dependency graph, or returns `undefined` if there are none.
 *
 * Uses depth-first search with a "currently visiting" set for O(V + E) detection.
 * The `visiting` set doubles as the ordered path: ES6 Sets preserve insertion order,
 * so iterating it from the cycle-start node yields the cycle without a separate array.
 */
export function _findWorkspaceCycle(
  projects: ReadonlyArray<RushConfigurationProject>
): ReadonlyArray<string> | undefined {
  // Nodes that have been fully explored (no cycles reachable from them)
  const visited: Set<RushConfigurationProject> = new Set();
  // Nodes currently on the DFS recursion stack, in insertion order
  const visiting: Set<RushConfigurationProject> = new Set();

  function dfs(node: RushConfigurationProject): ReadonlyArray<string> | undefined {
    if (visited.has(node)) {
      return undefined;
    }
    if (visiting.has(node)) {
      // Back-edge found — iterate `visiting` (insertion order) and collect from
      // the cycle-start node onward, then close the loop.
      const cycleNames: string[] = [];
      let found: boolean = false;
      for (const n of visiting) {
        if (n === node) {
          found = true;
        }
        if (found) {
          cycleNames.push(n.packageName);
        }
      }
      cycleNames.push(node.packageName); // close the cycle
      return cycleNames;
    }

    visiting.add(node);

    for (const dep of node.dependencyProjects) {
      const cycle: ReadonlyArray<string> | undefined = dfs(dep);
      if (cycle !== undefined) {
        return cycle;
      }
    }

    visiting.delete(node);
    visited.add(node);
    return undefined;
  }

  for (const project of projects) {
    if (!visited.has(project)) {
      const cycle: ReadonlyArray<string> | undefined = dfs(project);
      if (cycle !== undefined) {
        return cycle;
      }
    }
  }

  return undefined;
}
