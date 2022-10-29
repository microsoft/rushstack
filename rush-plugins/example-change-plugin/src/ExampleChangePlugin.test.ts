// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ExampleChangeProvider } from './ExampleChangePlugin';

describe('ExampleChangeProvider', () => {
  describe('parseCommitMessage', () => {
    it('detects jira ticket with space', () => {
      expect(ExampleChangeProvider.parseCommitMessage(
        'GCX-123 Fix a bug'
      )).toEqual({ jiraTicket: 'GCX-123', message: 'Fix a bug' });
    });

    it('detects jira ticket in brackets', () => {
      expect(ExampleChangeProvider.parseCommitMessage(
        '[GCX-509] Fix a bug'
      )).toEqual({ jiraTicket: 'GCX-509', message: 'Fix a bug' });
    });

    it('detects type and jira ticket with dash', () => {
      expect(ExampleChangeProvider.parseCommitMessage(
        'feat: AOT-2311 - Add a feature'
      )).toEqual({ type: 'feat', jiraTicket: 'AOT-2311', message: 'Add a feature' });
    });

    it('detects type with no space and no jira ticket', () => {
      expect(ExampleChangeProvider.parseCommitMessage(
        'bubble:ADD my FIXES'
      )).toEqual({ type: 'bubble', message: 'ADD my FIXES' });
    });

    it('normalizes a breaking change message', () => {
      expect(ExampleChangeProvider.parseCommitMessage(
        'fix!: BREAKING CHANGE: Returns 3 bubbles instead of 4'
      )).toEqual({ type: 'fix!', message: 'Returns 3 bubbles instead of 4' });
    });
  });

  describe('filterCommits', () => {
    it('returns only commits that look interesting', () => {
      expect(ExampleChangeProvider.filterCommits([
        `Merge branch 'main' into enelson/plugin`,
        'Bump versions [skip ci]',
        'Update changelogs [skip ci]',
        'Merge pull request #3717 from csobj/replace-sass-implementation-for-heft-sass-plugin',
        'Bump versions [skip ci]',
        'Update changelogs [skip ci]',
        `Merge branch 'main' into replace-sass-implementation-for-heft-sass-plugin`,
        'Merge pull request #3711 from TheLarkInn/issue/3710',
        'test(heft-sass-test): add files to verify Sass use syntaxs',
        'Restore import syntax to verify them',
        'Bump versions [skip ci]',
        'Update changelogs [skip ci]',
        'Merge pull request #3719 from dmichon-msft/serve-cert-subjects',
        'Revise changelogs',
        '[webpack5-plugin] Set websocket port',
        '[webpack4-plugin] Set websocket port',
        '[rush-serve-plugin] Use hostnames from TLS cert',
        '[dev-cert-plugin] Use hostnames from TLS cert',
        '(chore) Add dev config for heft build test'
      ])).toEqual([
        'test(heft-sass-test): add files to verify Sass use syntaxs',
        'Restore import syntax to verify them',
        'Revise changelogs',
        '[webpack5-plugin] Set websocket port',
        '[webpack4-plugin] Set websocket port',
        '[rush-serve-plugin] Use hostnames from TLS cert',
        '[dev-cert-plugin] Use hostnames from TLS cert',
        '(chore) Add dev config for heft build test'
      ]);
    });
  });
});
