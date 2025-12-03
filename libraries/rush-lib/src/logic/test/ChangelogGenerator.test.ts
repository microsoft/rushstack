// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IChangelog } from '../../api/Changelog';
import { ChangeType } from '../../api/ChangeManagement';
import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { ChangelogGenerator } from '../ChangelogGenerator';
import type { IChangeRequests } from '../PublishUtilities';

describe(ChangelogGenerator.updateIndividualChangelog.name, () => {
  const rushJsonFile: string = `${__dirname}/packages/rush.json`;
  let rushConfiguration: RushConfiguration;

  beforeEach(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  });

  it('can translate a single change request into a new changelog object', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '1.0.0',
        changeType: ChangeType.major,
        changes: [
          {
            packageName: 'a',
            type: 'major',
            changeType: ChangeType.major,
            comment: 'Patching a'
          }
        ]
      },
      'rootMajorChange',
      false,
      rushConfiguration
    )!;

    const expectedResult: IChangelog = {
      name: 'a',
      entries: [
        {
          version: '1.0.0',
          tag: 'a_v1.0.0',
          date: '',
          comments: {
            major: [
              {
                author: undefined,
                comment: 'Patching a',
                commit: undefined
              }
            ]
          }
        }
      ]
    };

    // Ignore comparing date.
    expectedResult.entries[0].date = actualResult.entries[0].date;

    expect(actualResult).toEqual(expectedResult);
  });

  it('can merge a new change request into an existing changelog', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '1.0.0',
        changeType: ChangeType.major,
        changes: [
          {
            packageName: 'a',
            type: 'major',
            changeType: ChangeType.major,
            comment: 'Patching a'
          }
        ]
      },
      `${__dirname}/exampleChangelog`,
      false,
      rushConfiguration
    )!;

    const expectedResult: IChangelog = {
      name: 'a',
      entries: [
        {
          version: '1.0.0',
          tag: 'a_v1.0.0',
          date: '',
          comments: {
            major: [
              {
                author: undefined,
                comment: 'Patching a',
                commit: undefined
              }
            ]
          }
        },
        {
          version: '0.0.1',
          tag: 'a_v0.0.1',
          date: 'Wed, 30 Nov 2016 18:37:45 GMT',
          comments: {
            patch: [
              {
                comment: 'Patching a'
              }
            ]
          }
        }
      ]
    };

    // Ignore comparing date.
    expectedResult.entries[0].date = actualResult.entries[0].date;

    expect(actualResult).toEqual(expectedResult);
  });

  it('translates custom fields from change files to change log', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '1.0.0',
        changeType: ChangeType.major,
        changes: [
          {
            packageName: 'a',
            type: 'major',
            changeType: ChangeType.major,
            comment: 'Patching a',
            customFields: {
              issueTicket: 'A-1053',
              vendorTag: 'AAAAA'
            }
          }
        ]
      },
      `${__dirname}/exampleChangelog`,
      false,
      rushConfiguration
    )!;

    const expectedResult: IChangelog = {
      name: 'a',
      entries: [
        {
          version: '1.0.0',
          tag: 'a_v1.0.0',
          date: '',
          comments: {
            major: [
              {
                author: undefined,
                comment: 'Patching a',
                commit: undefined,
                customFields: {
                  issueTicket: 'A-1053',
                  vendorTag: 'AAAAA'
                }
              }
            ]
          }
        },
        {
          version: '0.0.1',
          tag: 'a_v0.0.1',
          date: 'Wed, 30 Nov 2016 18:37:45 GMT',
          comments: {
            patch: [
              {
                comment: 'Patching a'
              }
            ]
          }
        }
      ]
    };

    // Ignore comparing date.
    expectedResult.entries[0].date = actualResult.entries[0].date;

    expect(actualResult).toEqual(expectedResult);
  });

  it('can avoid adding duplicate entries', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '0.0.1',
        changeType: ChangeType.patch,
        changes: [
          {
            packageName: 'a',
            type: 'patch',
            changeType: ChangeType.patch,
            comment: 'Patching a'
          }
        ]
      },
      `${__dirname}/exampleChangelog`,
      false,
      rushConfiguration
    )!;

    expect(actualResult).not.toBeDefined();
  });

  it('can handle dependency bumps', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '0.0.2',
        changeType: ChangeType.dependency,
        changes: [
          {
            packageName: 'a',
            type: 'dependency',
            changeType: ChangeType.dependency,
            comment: 'Updating a'
          }
        ]
      },
      `${__dirname}/exampleChangelog`,
      false,
      rushConfiguration
    )!;

    const expectedResult: IChangelog = {
      name: 'a',
      entries: [
        {
          version: '0.0.2',
          tag: 'a_v0.0.2',
          date: undefined,
          comments: {
            dependency: [
              {
                author: undefined,
                comment: 'Updating a',
                commit: undefined
              }
            ]
          }
        },
        {
          version: '0.0.1',
          tag: 'a_v0.0.1',
          date: 'Wed, 30 Nov 2016 18:37:45 GMT',
          comments: {
            patch: [
              {
                comment: 'Patching a'
              }
            ]
          }
        }
      ]
    };

    // Remove date.
    actualResult.entries[0].date = undefined;

    expect(actualResult).toEqual(expectedResult);
  });

  it('skip empty comment', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '0.0.2',
        changeType: ChangeType.none,
        changes: [
          {
            packageName: 'a',
            type: 'none',
            changeType: ChangeType.none,
            comment: ''
          }
        ]
      },
      `${__dirname}/exampleChangelog`,
      false,
      rushConfiguration
    )!;

    const expectedResult: IChangelog = {
      name: 'a',
      entries: [
        {
          version: '0.0.2',
          tag: 'a_v0.0.2',
          date: undefined,
          comments: {}
        },
        {
          version: '0.0.1',
          tag: 'a_v0.0.1',
          date: 'Wed, 30 Nov 2016 18:37:45 GMT',
          comments: {
            patch: [
              {
                comment: 'Patching a'
              }
            ]
          }
        }
      ]
    };

    // Remove date.
    actualResult.entries[0].date = undefined;

    expect(actualResult).toEqual(expectedResult);
  });

  it('can throw right error when given valid file', () => {
    const generateUpdateInvoke =
      (projectPath: string): (() => void) =>
      () => {
        ChangelogGenerator.updateIndividualChangelog(
          {
            packageName: 'a',
            newVersion: '0.0.2',
            changeType: ChangeType.none,
            changes: [
              {
                packageName: 'a',
                type: 'none',
                changeType: ChangeType.none,
                comment: ''
              }
            ]
          },
          projectPath,
          false,
          rushConfiguration
        );
      };

    const emptyFileInvoke = generateUpdateInvoke(`${__dirname}/exampleInvalidChangelog/emptyFile`);
    expect(emptyFileInvoke).toThrow(Error);
    expect(emptyFileInvoke).toThrow(/No data, empty input at 1:1/);

    const emptyObjectFileInvoke = generateUpdateInvoke(`${__dirname}/exampleInvalidChangelog/emptyObject`);
    expect(emptyObjectFileInvoke).toThrow(Error);
    expect(emptyObjectFileInvoke).toThrow(/must have required property 'name'/);
  });
});

describe(ChangelogGenerator.updateChangelogs.name, () => {
  const rushJsonFile: string = `${__dirname}/packages/rush.json`;
  let rushConfiguration: RushConfiguration;

  beforeEach(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  });

  it('skips changes logs if the project version is not changed.', () => {
    const allChanges: IChangeRequests = { packageChanges: new Map(), versionPolicyChanges: new Map() };
    // Package a does not have version change.
    allChanges.packageChanges.set('a', {
      packageName: 'a',
      changeType: ChangeType.dependency,
      newVersion: '1.0.0',
      changes: []
    });
    // Package b has version change.
    allChanges.packageChanges.set('b', {
      packageName: 'b',
      changeType: ChangeType.patch,
      newVersion: '1.0.1',
      changes: []
    });
    const updatedChangeLogs: IChangelog[] = ChangelogGenerator.updateChangelogs(
      allChanges,
      rushConfiguration.projectsByName,
      rushConfiguration,
      false
    );
    expect(updatedChangeLogs).toHaveLength(1);
    expect(updatedChangeLogs[0].name).toEqual('b');
  });

  it('skips changes logs if the project is in pre-release', () => {
    const allChanges: IChangeRequests = { packageChanges: new Map(), versionPolicyChanges: new Map() };
    // Package a is a prerelease
    allChanges.packageChanges.set('a', {
      packageName: 'a',
      changeType: ChangeType.dependency,
      newVersion: '1.0.1-pre.1',
      changes: []
    });
    // Package b is not a prerelease
    allChanges.packageChanges.set('b', {
      packageName: 'b',
      changeType: ChangeType.patch,
      newVersion: '1.0.1',
      changes: []
    });
    // Makes package 'a' prerelease package.
    const rushProjectA: RushConfigurationProject = rushConfiguration.projectsByName.get('a')!;
    rushProjectA.packageJson.version = '1.0.1-pre.1';

    const updatedChangeLogs: IChangelog[] = ChangelogGenerator.updateChangelogs(
      allChanges,
      rushConfiguration.projectsByName,
      rushConfiguration,
      false
    );
    expect(updatedChangeLogs).toHaveLength(1);
    expect(updatedChangeLogs[0].name).toEqual('b');
  });

  it('writes changelog for hotfix changes', () => {
    const allChanges: IChangeRequests = { packageChanges: new Map(), versionPolicyChanges: new Map() };
    // Package a is a hotfix
    allChanges.packageChanges.set('a', {
      packageName: 'a',
      changeType: ChangeType.hotfix,
      newVersion: '1.0.1-hotfix.1',
      changes: []
    });
    // Package b is not a hotfix
    allChanges.packageChanges.set('b', {
      packageName: 'b',
      changeType: ChangeType.patch,
      newVersion: '1.0.1',
      changes: []
    });
    // Makes package 'a' hotfix package.
    const rushProjectA: RushConfigurationProject = rushConfiguration.projectsByName.get('a')!;
    rushProjectA.packageJson.version = '1.0.1-hotfix.1';

    const updatedChangeLogs: IChangelog[] = ChangelogGenerator.updateChangelogs(
      allChanges,
      rushConfiguration.projectsByName,
      rushConfiguration,
      false
    );
    expect(updatedChangeLogs).toHaveLength(2);
    expect(updatedChangeLogs[0].name).toEqual('a');
    expect(updatedChangeLogs[1].name).toEqual('b');
  });
});
