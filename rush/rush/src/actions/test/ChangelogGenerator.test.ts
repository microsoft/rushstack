import { expect } from 'chai';
import ChangelogGenerator, {
  IChangelog
} from '../ChangelogGenerator';
import {
  ChangeType
} from '@microsoft/rush-lib';
import * as path from 'path';

describe('updateIndividualChangelog', () => {

  it('can translate a single change request into a new changelog object', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '1.0.0',
        changeType: ChangeType.major,
        changes: [{
          packageName: 'a',
          type: 'major',
          changeType: ChangeType.major,
          comment: 'Patching a'
        }]
      },
      'rootMajorChange',
      false);

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

    expect(actualResult).eql(expectedResult);
  });

  it('can merge a new change request into an existing changelog', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '1.0.0',
        changeType: ChangeType.major,
        changes: [{
          packageName: 'a',
          type: 'major',
          changeType: ChangeType.major,
          comment: 'Patching a'
        }]
      },
      path.resolve(__dirname, 'exampleChangelog'),
      false
    );

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

    expect(actualResult).eql(expectedResult);
  });

  it('can avoid adding duplicate entries', () => {
    const actualResult: IChangelog = ChangelogGenerator.updateIndividualChangelog(
      {
        packageName: 'a',
        newVersion: '0.0.1',
        changeType: ChangeType.patch,
        changes: [{
          packageName: 'a',
          type: 'patch',
          changeType: ChangeType.patch,
          comment: 'Patching a'
        }]
      },
      path.resolve(__dirname, 'exampleChangelog'),
      false
    );

    const expectedResult: IChangelog = {
      name: 'a',
      entries: [
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

    expect(actualResult).eql(expectedResult);
  });

});
