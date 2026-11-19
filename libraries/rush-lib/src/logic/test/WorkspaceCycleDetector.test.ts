// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { RushConfiguration } from '../../api/RushConfiguration';
import { _findWorkspaceCycle } from '../WorkspaceCycleDetector';

describe(_findWorkspaceCycle.name, () => {
  function loadProjectsFromRepo(repoName: string): RushConfiguration['projects'] {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, `workspaceCycleDetector/${repoName}/rush.json`)
    );
    return rushConfiguration.projects;
  }

  it('returns undefined when there are no cycles', () => {
    const projects: RushConfiguration['projects'] = loadProjectsFromRepo('no-cycle');
    const result: ReadonlyArray<string> | undefined = _findWorkspaceCycle(projects);
    expect(result).toBeUndefined();
  });

  it('returns the cycle path when an undeclared cycle is present', () => {
    const projects: RushConfiguration['projects'] = loadProjectsFromRepo('with-cycle');
    const result: ReadonlyArray<string> | undefined = _findWorkspaceCycle(projects);
    expect(result).toBeDefined();
    // The cycle should form a closed loop: [..., pkg-a] or [..., pkg-b] depending on
    // iteration order. Either way the first and last element must be the same package,
    // and both pkg-a and pkg-b must appear in the cycle.
    expect(result!.length).toBeGreaterThanOrEqual(2);
    expect(result![0]).toBe(result![result!.length - 1]);
    const uniqueNames: Set<string> = new Set(result);
    expect(uniqueNames.has('pkg-a')).toBe(true);
    expect(uniqueNames.has('pkg-b')).toBe(true);
  });

  it('returns undefined when the cycle is intentionally broken with decoupledLocalDependencies', () => {
    const projects: RushConfiguration['projects'] = loadProjectsFromRepo('decoupled-cycle');
    const result: ReadonlyArray<string> | undefined = _findWorkspaceCycle(projects);
    expect(result).toBeUndefined();
  });

  it('returns the cycle path when using the workspacePackages test repo (cyclic-dep-1 <-> cyclic-dep-2)', () => {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, 'workspacePackages/rush.json')
    );
    const result: ReadonlyArray<string> | undefined = _findWorkspaceCycle(rushConfiguration.projects);
    expect(result).toBeDefined();
    expect(result![0]).toBe(result![result!.length - 1]);
    const uniqueNames: Set<string> = new Set(result);
    expect(uniqueNames.has('cyclic-dep-1')).toBe(true);
    expect(uniqueNames.has('cyclic-dep-2')).toBe(true);
  });
});
