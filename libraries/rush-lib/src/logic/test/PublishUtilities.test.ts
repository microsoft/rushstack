// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IChangeInfo, ChangeType } from '../../api/ChangeManagement';
import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PublishUtilities, type IChangeRequests } from '../PublishUtilities';
import { ChangeFiles } from '../ChangeFiles';

function generateChangeSnapshot(
  allPackages: ReadonlyMap<string, RushConfigurationProject>,
  allChanges: IChangeRequests
): string {
  const unchangedLines: string[] = [];
  const changesLines: string[] = [];
  for (const project of allPackages.values()) {
    const projectName: string = project.packageName;
    const currentVersion: string = project.packageJson.version;
    const changeInfo: IChangeInfo | undefined = allChanges.packageChanges.get(projectName);
    if (changeInfo) {
      const changeType: ChangeType | undefined = changeInfo.changeType;
      const changeTypeText: string = ChangeType[changeType as number];
      let newVersion: string | undefined = changeInfo.newVersion;
      if (newVersion === currentVersion) {
        newVersion = '(same)';
      }

      changesLines.push(`${projectName} - ${currentVersion} -> ${newVersion} (${changeTypeText} change)`);
    } else {
      unchangedLines.push(`${projectName} - ${currentVersion}`);
    }
  }

  return [
    `== Changed Projects (${changesLines.length}) ==`,
    ...changesLines.sort(),
    '',
    `== Unchanged Projects (${unchangedLines.length}) ==`,
    ...unchangedLines.sort()
  ].join('\n');
}

function generateVersionPolicySnapshot(allChanges: IChangeRequests): string {
  const lines: string[] = [];
  for (const versionPolicy of allChanges.versionPolicyChanges.values()) {
    const versionPolicyName: string = versionPolicy.versionPolicyName;
    const changeType: ChangeType | undefined = versionPolicy.changeType;
    const changeTypeText: string = ChangeType[changeType as number];
    const newVersion: string = versionPolicy.newVersion;
    lines.push(`${versionPolicyName} - ${newVersion} (${changeTypeText} change)`);
  }

  return lines.join('\n');
}

describe(PublishUtilities.findChangeRequestsAsync.name, () => {
  let packagesRushConfiguration: RushConfiguration;
  let repoRushConfiguration: RushConfiguration;

  beforeEach(() => {
    // The "packages" repo has the following structure (except for the cyclics)
    //     a --------
    //   / | \      |
    //  /  |  \     |
    // b   h   e    g
    // |\  |
    // | \ |
    // c   f   i
    // |       |
    // |       |
    // d       j
    //
    // "h" and "i" are lockstepped

    packagesRushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${__dirname}/packages/rush.json`
    );

    repoRushConfiguration = RushConfiguration.loadFromConfigurationFile(`${__dirname}/repo/rush.json`);
  });

  it('returns no changes in an empty change folder', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/noChange`)
    );

    expect(allChanges.packageChanges.size).toEqual(0);
    expect(allChanges.versionPolicyChanges.size).toEqual(0);
  });

  it('returns 1 change when changing a leaf package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/leafChange`)
    );

    expect(allChanges.packageChanges.size).toEqual(1);
    expect(allChanges.versionPolicyChanges.size).toEqual(0);

    expect(allChanges.packageChanges.get('d')).not.toBeUndefined();
    expect(allChanges.packageChanges.get('d')!.changeType).toEqual(ChangeType.patch);
  });

  it('returns 6 changes when patching a root package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/rootPatchChange`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (6) ==
      a - 1.0.0 -> 1.0.1 (patch change)
      b - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> (same) (dependency change)
      h - 1.0.0 -> (same) (dependency change)
      i - 1.0.0 -> (same) (dependency change)

      == Unchanged Projects (8) ==
      c - 1.0.0
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0
      f - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.0 (dependency change)"`
    );
  });

  it('returns 8 changes when hotfixing a root package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/rootHotfixChange`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (8) ==
      a - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      b - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      c - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      d - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      e - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      f - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      g - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      h - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)

      == Unchanged Projects (6) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      i - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(`""`);
  });

  it('returns 9 changes when major bumping a root package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/rootMajorChange`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (9) ==
      a - 1.0.0 -> 2.0.0 (major change)
      b - 1.0.0 -> 1.0.1 (patch change)
      c - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> 1.0.1 (patch change)
      f - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> (same) (dependency change)
      h - 1.0.0 -> 1.0.1 (patch change)
      i - 1.0.0 -> 1.0.1 (patch change)
      j - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (5) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.1 (patch change)"`
    );
  });

  it('updates policy project dependencies when updating a lockstep version policy with no nextBump', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/lockstepWithoutNextBump`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (4) ==
      f - 1.0.0 -> (same) (dependency change)
      h - 1.0.0 -> 1.1.0 (minor change)
      i - 1.0.0 -> 1.1.0 (minor change)
      j - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (10) ==
      a - 1.0.0
      b - 1.0.0
      c - 1.0.0
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0
      e - 1.0.0
      g - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.1.0 (minor change)"`
    );
  });

  it('returns 2 changes when bumping cyclic dependencies', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/cyclicDeps`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (2) ==
      cyclic-dep-1 - 1.0.0 -> 2.0.0 (major change)
      cyclic-dep-2 - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (12) ==
      a - 1.0.0
      b - 1.0.0
      c - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0
      e - 1.0.0
      f - 1.0.0
      g - 1.0.0
      h - 1.0.0
      i - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(`""`);
  });

  it('returns error when mixing hotfix and non-hotfix changes', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    await expect(
      async () =>
        await PublishUtilities.findChangeRequestsAsync(
          allPackages,
          packagesRushConfiguration,
          new ChangeFiles(`${__dirname}/hotfixWithPatchChanges`)
        )
    ).rejects.toThrow('Cannot apply hotfix alongside patch change on same package');
  });

  it('returns error when adding hotfix with config disabled', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    // Overload hotfixChangeEnabled function
    (packagesRushConfiguration as unknown as Record<string, boolean>).hotfixChangeEnabled = false;

    await expect(
      async () =>
        await PublishUtilities.findChangeRequestsAsync(
          allPackages,
          packagesRushConfiguration,
          new ChangeFiles(`${__dirname}/rootHotfixChange`)
        )
    ).rejects.toThrow('Cannot add hotfix change; hotfixChangeEnabled is false in configuration.');
  });

  it('can resolve multiple changes requests on the same package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/multipleChanges`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (9) ==
      a - 1.0.0 -> 2.0.0 (major change)
      b - 1.0.0 -> 1.0.1 (patch change)
      c - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> 1.0.1 (patch change)
      f - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> (same) (dependency change)
      h - 1.0.0 -> 1.0.1 (patch change)
      i - 1.0.0 -> 1.0.1 (patch change)
      j - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (5) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.1 (patch change)"`
    );
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/orderedChanges`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (9) ==
      a - 1.0.0 -> 2.0.0 (major change)
      b - 1.0.0 -> 1.0.1 (patch change)
      c - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> 1.0.1 (patch change)
      f - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> (same) (dependency change)
      h - 1.0.0 -> 1.0.1 (patch change)
      i - 1.0.0 -> 1.0.1 (patch change)
      j - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (5) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.1 (patch change)"`
    );
  });

  it('can resolve multiple hotfix changes', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/multipleHotfixChanges`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (8) ==
      a - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      b - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      c - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      d - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      e - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      f - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      g - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      h - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)

      == Unchanged Projects (6) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      i - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(`""`);
  });

  it('can update an explicit dependency', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/explicitVersionChange`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (2) ==
      c - 1.0.0 -> 1.0.1 (patch change)
      d - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (12) ==
      a - 1.0.0
      b - 1.0.0
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      e - 1.0.0
      f - 1.0.0
      g - 1.0.0
      h - 1.0.0
      i - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(`""`);
  });

  it('can exclude lock step projects', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> = repoRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      repoRushConfiguration,
      new ChangeFiles(`${__dirname}/repo/changes`),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e'])
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (8) ==
      a - 1.0.0 -> (same) (none change)
      b - 2.0.0 -> (same) (none change)
      c - 3.1.1 -> 3.1.2 (patch change)
      d - 4.1.1 -> 4.1.2 (patch change)
      e - 10.10.0 -> (same) (none change)
      f - 1.0.0 -> (same) (none change)
      h - 1.2.3 -> 1.2.4 (patch change)
      i - 1.2.3 -> 1.2.4 (patch change)

      == Unchanged Projects (2) ==
      g - 0.0.1
      j - 1.2.3"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.2.4 (patch change)"`
    );
  });
});

describe(PublishUtilities.sortChangeRequests.name, () => {
  let rushConfiguration: RushConfiguration;

  beforeEach(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(`${__dirname}/packages/rush.json`);
  });

  it('can return a sorted array of the change requests to be published in the correct order', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> = rushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      rushConfiguration,
      new ChangeFiles(`${__dirname}/multipleChanges`)
    );
    const orderedChanges: IChangeInfo[] = PublishUtilities.sortChangeRequests(allChanges.packageChanges);

    expect(orderedChanges).toHaveLength(9);
    expect(orderedChanges[0].packageName).toEqual('a');
    expect(orderedChanges[1].packageName).toEqual('i');
    expect(orderedChanges[2].packageName).toEqual('b');
    expect(orderedChanges[3].packageName).toEqual('e');
    expect(orderedChanges[4].packageName).toEqual('g');
    expect(orderedChanges[5].packageName).toEqual('h');
    expect(orderedChanges[6].packageName).toEqual('j');
    expect(orderedChanges[7].packageName).toEqual('c');
    expect(orderedChanges[8].packageName).toEqual('f');
  });
});

describe(PublishUtilities.isRangeDependency.name, () => {
  it('can test ranges', () => {
    expect(PublishUtilities.isRangeDependency('>=1.0.0 <2.0.0')).toEqual(true);
    expect(PublishUtilities.isRangeDependency('>=1.0.0-pr.1 <2.0.0')).toEqual(true);
    expect(PublishUtilities.isRangeDependency('1.0.0')).toEqual(false);
    expect(PublishUtilities.isRangeDependency('^1.0.0')).toEqual(false);
    expect(PublishUtilities.isRangeDependency('~1.0.0')).toEqual(false);
  });
});

describe(PublishUtilities.getNewDependencyVersion.name, () => {
  it('can update dependency versions', () => {
    const dependencies: { [key: string]: string } = {
      a: '~1.0.0',
      b: '^1.0.0',
      c: '>=1.0.0 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0')).toEqual('~1.1.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0')).toEqual('^1.2.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0')).toEqual('>=1.3.0 <2.0.0');
  });

  it('can update dependency versions with prereleases', () => {
    const dependencies: { [key: string]: string } = {
      a: '~1.0.0-pr.1',
      b: '^1.0.0-pr.1',
      c: '>=1.0.0-pr.1 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0-pr.1')).toEqual('~1.1.0-pr.1');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0-pr.2')).toEqual('^1.2.0-pr.2');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0-pr.3')).toEqual(
      '>=1.3.0-pr.3 <2.0.0'
    );
  });

  it('can update to prerelease', () => {
    const dependencies: { [key: string]: string } = {
      a: '~1.0.0',
      b: '^1.0.0',
      c: '>=1.0.0 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.0.0-hotfix.0')).toEqual(
      '~1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.0.0-hotfix.0')).toEqual(
      '^1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.0.0-hotfix.0')).toEqual(
      '>=1.0.0-hotfix.0 <2.0.0'
    );
  });
});

describe(PublishUtilities.findChangeRequestsAsync.name, () => {
  let packagesRushConfiguration: RushConfiguration;
  let repoRushConfiguration: RushConfiguration;

  beforeEach(() => {
    packagesRushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${__dirname}/workspacePackages/rush.json`
    );
    repoRushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${__dirname}/workspaceRepo/rush.json`
    );
  });

  it('returns no changes in an empty change folder', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/noChange`)
    );

    expect(allChanges.packageChanges.size).toEqual(0);
    expect(allChanges.versionPolicyChanges.size).toEqual(0);
  });

  it('returns 1 change when changing a leaf package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/leafChange`)
    );

    expect(allChanges.packageChanges.size).toEqual(1);
    expect(allChanges.versionPolicyChanges.size).toEqual(0);

    expect(allChanges.packageChanges.get('d')).not.toBeUndefined();
    expect(allChanges.packageChanges.get('d')!.changeType).toEqual(ChangeType.patch);
  });

  it('returns 6 changes when patching a root package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/rootPatchChange`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (6) ==
      a - 1.0.0 -> 1.0.1 (patch change)
      b - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> 1.0.1 (patch change)
      h - 1.0.0 -> (same) (dependency change)
      i - 1.0.0 -> (same) (dependency change)

      == Unchanged Projects (8) ==
      c - 1.0.0
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0
      f - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.0 (dependency change)"`
    );
  });

  it('returns 8 changes when hotfixing a root package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/rootHotfixChange`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (8) ==
      a - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      b - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      c - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      d - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      e - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      f - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      g - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      h - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)

      == Unchanged Projects (6) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      i - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(`""`);
  });

  it('returns 9 changes when major bumping a root package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/rootMajorChange`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (9) ==
      a - 1.0.0 -> 2.0.0 (major change)
      b - 1.0.0 -> 1.0.1 (patch change)
      c - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> 1.0.1 (patch change)
      f - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> 1.0.1 (patch change)
      h - 1.0.0 -> 1.0.1 (patch change)
      i - 1.0.0 -> 1.0.1 (patch change)
      j - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (5) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.1 (patch change)"`
    );
  });

  it('returns 2 changes when bumping cyclic dependencies', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/cyclicDeps`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (2) ==
      cyclic-dep-1 - 1.0.0 -> 2.0.0 (major change)
      cyclic-dep-2 - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (12) ==
      a - 1.0.0
      b - 1.0.0
      c - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0
      e - 1.0.0
      f - 1.0.0
      g - 1.0.0
      h - 1.0.0
      i - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(`""`);
  });

  it('returns error when mixing hotfix and non-hotfix changes', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    await expect(
      async () =>
        await PublishUtilities.findChangeRequestsAsync(
          allPackages,
          packagesRushConfiguration,
          new ChangeFiles(`${__dirname}/hotfixWithPatchChanges`)
        )
    ).rejects.toThrow('Cannot apply hotfix alongside patch change on same package');
  });

  it('returns error when adding hotfix with config disabled', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    // Overload hotfixChangeEnabled function
    (packagesRushConfiguration as unknown as Record<string, boolean>).hotfixChangeEnabled = false;

    await expect(
      async () =>
        await PublishUtilities.findChangeRequestsAsync(
          allPackages,
          packagesRushConfiguration,
          new ChangeFiles(`${__dirname}/rootHotfixChange`)
        )
    ).rejects.toThrow('Cannot add hotfix change; hotfixChangeEnabled is false in configuration.');
  });

  it('can resolve multiple changes requests on the same package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/multipleChanges`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (9) ==
      a - 1.0.0 -> 2.0.0 (major change)
      b - 1.0.0 -> 1.0.1 (patch change)
      c - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> 1.0.1 (patch change)
      f - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> 1.0.1 (patch change)
      h - 1.0.0 -> 1.0.1 (patch change)
      i - 1.0.0 -> 1.0.1 (patch change)
      j - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (5) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.1 (patch change)"`
    );
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/orderedChanges`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (9) ==
      a - 1.0.0 -> 2.0.0 (major change)
      b - 1.0.0 -> 1.0.1 (patch change)
      c - 1.0.0 -> (same) (dependency change)
      e - 1.0.0 -> 1.0.1 (patch change)
      f - 1.0.0 -> (same) (dependency change)
      g - 1.0.0 -> 1.0.1 (patch change)
      h - 1.0.0 -> 1.0.1 (patch change)
      i - 1.0.0 -> 1.0.1 (patch change)
      j - 1.0.0 -> 1.0.1 (patch change)

      == Unchanged Projects (5) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      d - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.0.1 (patch change)"`
    );
  });

  it('can resolve multiple hotfix changes', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/multipleHotfixChanges`)
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (8) ==
      a - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      b - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      c - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      d - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      e - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      f - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      g - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)
      h - 1.0.0 -> 1.0.0-hotfix.0 (hotfix change)

      == Unchanged Projects (6) ==
      cyclic-dep-1 - 1.0.0
      cyclic-dep-2 - 1.0.0
      cyclic-dep-explicit-1 - 1.0.0
      cyclic-dep-explicit-2 - 1.0.0
      i - 1.0.0
      j - 1.0.0"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(`""`);
  });

  it('can update an explicit dependency', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> =
      packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(`${__dirname}/explicitVersionChange`)
    );

    expect(allChanges.packageChanges.size).toEqual(2);
    expect(allChanges.versionPolicyChanges.size).toEqual(0);

    expect(allChanges.packageChanges.get('c')).not.toBeUndefined();
    expect(allChanges.packageChanges.get('d')).not.toBeUndefined();

    expect(allChanges.packageChanges.get('c')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.packageChanges.get('d')!.changeType).toEqual(ChangeType.patch);
  });

  it('can exclude lock step projects', async () => {
    const allPackages: ReadonlyMap<string, RushConfigurationProject> = repoRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = await PublishUtilities.findChangeRequestsAsync(
      allPackages,
      repoRushConfiguration,
      new ChangeFiles(`${__dirname}/repo/changes`),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e'])
    );

    expect(generateChangeSnapshot(allPackages, allChanges)).toMatchInlineSnapshot(`
      "== Changed Projects (8) ==
      a - 1.0.0 -> (same) (none change)
      b - 2.0.0 -> (same) (none change)
      c - 3.1.1 -> 3.1.2 (patch change)
      d - 4.1.1 -> 4.1.2 (patch change)
      e - 10.10.0 -> (same) (none change)
      f - 1.0.0 -> (same) (none change)
      h - 1.2.3 -> 1.2.4 (patch change)
      i - 1.2.3 -> 1.2.4 (patch change)

      == Unchanged Projects (2) ==
      g - 0.0.1
      j - 1.2.3"
    `);

    expect(generateVersionPolicySnapshot(allChanges)).toMatchInlineSnapshot(
      `"lockStepWithoutNextBump - 1.2.4 (patch change)"`
    );
  });
});

describe(PublishUtilities.getNewDependencyVersion.name, () => {
  it('can update dependency versions', () => {
    const dependencies: { [key: string]: string } = {
      a: 'workspace:~1.0.0',
      b: 'workspace:^1.0.0',
      c: 'workspace:>=1.0.0 <2.0.0',
      d: 'workspace:*',
      e: 'workspace:~',
      f: 'workspace:^'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0')).toEqual('workspace:~1.1.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0')).toEqual('workspace:^1.2.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0')).toEqual(
      'workspace:>=1.3.0 <2.0.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'd', '1.4.0')).toEqual('workspace:*');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'e', '1.5.0')).toEqual('workspace:~');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'f', '1.6.0')).toEqual('workspace:^');
  });

  it('can update dependency versions with prereleases', () => {
    const dependencies: { [key: string]: string } = {
      a: 'workspace:~1.0.0-pr.1',
      b: 'workspace:^1.0.0-pr.1',
      c: 'workspace:>=1.0.0-pr.1 <2.0.0',
      d: 'workspace:*',
      e: 'workspace:~',
      f: 'workspace:^'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0-pr.1')).toEqual(
      'workspace:~1.1.0-pr.1'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0-pr.2')).toEqual(
      'workspace:^1.2.0-pr.2'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0-pr.3')).toEqual(
      'workspace:>=1.3.0-pr.3 <2.0.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'd', '1.3.0-pr.3')).toEqual('workspace:*');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'e', '1.5.0-pr.3')).toEqual('workspace:~');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'f', '1.6.0-pr.3')).toEqual('workspace:^');
  });

  it('can update to prerelease', () => {
    const dependencies: { [key: string]: string } = {
      a: 'workspace:~1.0.0',
      b: 'workspace:^1.0.0',
      c: 'workspace:>=1.0.0 <2.0.0',
      d: 'workspace:*',
      e: 'workspace:~',
      f: 'workspace:^'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.0.0-hotfix.0')).toEqual(
      'workspace:~1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.0.0-hotfix.0')).toEqual(
      'workspace:^1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.0.0-hotfix.0')).toEqual(
      'workspace:>=1.0.0-hotfix.0 <2.0.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'd', '1.0.0-hotfix.0')).toEqual(
      'workspace:*'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'e', '1.0.0-hotfix.0')).toEqual(
      'workspace:~'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'f', '1.0.0-hotfix.0')).toEqual(
      'workspace:^'
    );
  });
});
