// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import * as semver from 'semver';

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';

import { type IChangeRequests, PublishUtilities } from './PublishUtilities';
import { type IChangeInfo, ChangeType } from '../api/ChangeManagement';
import type {
  IChangelog,
  IChangeLogEntry,
  IChangeLogComment,
  IChangeLogEntryComments
} from '../api/Changelog';
import type { RushConfigurationProject } from '../api/RushConfigurationProject';
import type { RushConfiguration } from '../api/RushConfiguration';
import schemaJson from '../schemas/changelog.schema.json';

const CHANGELOG_JSON: string = 'CHANGELOG.json';
const CHANGELOG_MD: string = 'CHANGELOG.md';
const EOL: string = '\n';

export class ChangelogGenerator {
  /**
   * The JSON Schema for Changelog file (changelog.schema.json).
   */
  public static readonly jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  /**
   * Updates the appropriate changelogs with the given changes.
   */
  public static updateChangelogs(
    allChanges: IChangeRequests,
    allProjects: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration,
    shouldCommit: boolean
  ): IChangelog[] {
    const updatedChangeLogs: IChangelog[] = [];

    allChanges.packageChanges.forEach((change, packageName) => {
      const project: RushConfigurationProject | undefined = allProjects.get(packageName);

      if (project && ChangelogGenerator._shouldUpdateChangeLog(project, allChanges)) {
        const changeLog: IChangelog | undefined = ChangelogGenerator.updateIndividualChangelog(
          change,
          project.projectFolder,
          shouldCommit,
          rushConfiguration,
          project.versionPolicy && project.versionPolicy.isLockstepped,
          project.isMainProject
        );

        if (changeLog) {
          updatedChangeLogs.push(changeLog);
        }
      }
    });
    return updatedChangeLogs;
  }

  /**
   * Fully regenerate the markdown files based on the current json files.
   */
  public static regenerateChangelogs(
    allProjects: ReadonlyMap<string, RushConfigurationProject>,
    rushConfiguration: RushConfiguration
  ): void {
    allProjects.forEach((project) => {
      const markdownPath: string = path.resolve(project.projectFolder, CHANGELOG_MD);
      const markdownJSONPath: string = path.resolve(project.projectFolder, CHANGELOG_JSON);

      if (FileSystem.exists(markdownPath)) {
        // eslint-disable-next-line no-console
        console.log('Found: ' + markdownPath);
        if (!FileSystem.exists(markdownJSONPath)) {
          throw new Error('A CHANGELOG.md without json: ' + markdownPath);
        }

        const changelog: IChangelog = ChangelogGenerator._getChangelog(
          project.packageName,
          project.projectFolder
        );
        const isLockstepped: boolean = !!project.versionPolicy && project.versionPolicy.isLockstepped;

        FileSystem.writeFile(
          path.join(project.projectFolder, CHANGELOG_MD),
          ChangelogGenerator._translateToMarkdown(changelog, rushConfiguration, isLockstepped)
        );
      }
    });
  }

  /**
   * Updates an individual changelog for a single project.
   */
  public static updateIndividualChangelog(
    change: IChangeInfo,
    projectFolder: string,
    shouldCommit: boolean,
    rushConfiguration: RushConfiguration,
    isLockstepped: boolean = false,
    isMain: boolean = true
  ): IChangelog | undefined {
    if (isLockstepped && !isMain) {
      // Early return if the project is lockstepped and does not host change logs
      return undefined;
    }
    const changelog: IChangelog = ChangelogGenerator._getChangelog(change.packageName, projectFolder);

    if (!changelog.entries.some((entry) => entry.version === change.newVersion)) {
      const changelogEntry: IChangeLogEntry = {
        version: change.newVersion!,
        tag: PublishUtilities.createTagname(
          change.packageName,
          change.newVersion!,
          rushConfiguration.gitTagSeparator
        ),
        date: new Date().toUTCString(),
        comments: {}
      };

      change.changes!.forEach((individualChange) => {
        if (individualChange.comment) {
          // Initialize the comments array only as necessary.
          const changeTypeString: keyof IChangeLogEntryComments = ChangeType[
            individualChange.changeType!
          ] as keyof IChangeLogEntryComments;

          changelogEntry.comments[changeTypeString] = changelogEntry.comments[changeTypeString] || [];
          const comments: IChangeLogComment[] = changelogEntry.comments[changeTypeString]!;

          const changeLogComment: IChangeLogComment = {
            comment: individualChange.comment
          };
          if (individualChange.author) {
            changeLogComment.author = individualChange.author;
          }
          if (individualChange.commit) {
            changeLogComment.commit = individualChange.commit;
          }
          if (individualChange.customFields) {
            changeLogComment.customFields = individualChange.customFields;
          }
          comments.push(changeLogComment);
        }
      });

      // Add the changelog entry to the start of the list.
      changelog.entries.unshift(changelogEntry);

      const changelogFilename: string = path.join(projectFolder, CHANGELOG_JSON);

      // eslint-disable-next-line no-console
      console.log(
        `${EOL}* ${shouldCommit ? 'APPLYING' : 'DRYRUN'}: ` +
          `Changelog update for "${change.packageName}@${change.newVersion}".`
      );

      if (shouldCommit) {
        // Write markdown transform.
        JsonFile.save(changelog, changelogFilename);

        FileSystem.writeFile(
          path.join(projectFolder, CHANGELOG_MD),
          ChangelogGenerator._translateToMarkdown(changelog, rushConfiguration, isLockstepped)
        );
      }
      return changelog;
    }
    // change log not updated.
    return undefined;
  }

  /**
   * Loads the changelog json from disk, or creates a new one if there isn't one.
   */
  private static _getChangelog(packageName: string, projectFolder: string): IChangelog {
    const changelogFilename: string = path.join(projectFolder, CHANGELOG_JSON);
    let changelog: IChangelog | undefined = undefined;

    // Try to read the existing changelog.
    if (FileSystem.exists(changelogFilename)) {
      changelog = JsonFile.loadAndValidate(changelogFilename, ChangelogGenerator.jsonSchema);
    }

    if (!changelog) {
      changelog = {
        name: packageName,
        entries: []
      };
    } else {
      // Force the changelog name to be same as package name.
      // In case the package has been renamed but change log name is not updated.
      changelog.name = packageName;
    }

    return changelog;
  }

  /**
   * Translates the given changelog json object into a markdown string.
   */
  private static _translateToMarkdown(
    changelog: IChangelog,
    rushConfiguration: RushConfiguration,
    isLockstepped: boolean = false
  ): string {
    let markdown: string = [
      `# Change Log - ${changelog.name}`,
      '',
      `This log was last generated on ${new Date().toUTCString()} and should not be manually modified.`,
      '',
      ''
    ].join(EOL);

    changelog.entries.forEach((entry, index) => {
      markdown += `## ${entry.version}${EOL}`;

      if (entry.date) {
        markdown += `${entry.date}${EOL}`;
      }

      markdown += EOL;

      let comments: string = '';

      comments += ChangelogGenerator._getChangeComments('Breaking changes', entry.comments.major);

      comments += ChangelogGenerator._getChangeComments('Minor changes', entry.comments.minor);

      comments += ChangelogGenerator._getChangeComments('Patches', entry.comments.patch);

      if (isLockstepped) {
        // In lockstepped projects, all changes are of type ChangeType.none.
        comments += ChangelogGenerator._getChangeComments('Updates', entry.comments.none);
      }

      if (rushConfiguration.hotfixChangeEnabled) {
        comments += ChangelogGenerator._getChangeComments('Hotfixes', entry.comments.hotfix);
      }

      if (!comments) {
        markdown +=
          (changelog.entries.length === index + 1 ? '_Initial release_' : '_Version update only_') +
          EOL +
          EOL;
      } else {
        markdown += comments;
      }
    });

    return markdown;
  }

  /**
   * Helper to return the comments string to be appends to the markdown content.
   */
  private static _getChangeComments(title: string, commentsArray: IChangeLogComment[] | undefined): string {
    let comments: string = '';

    if (commentsArray) {
      comments = `### ${title}${EOL + EOL}`;
      commentsArray.forEach((comment) => {
        comments += `- ${comment.comment}${EOL}`;
      });
      comments += EOL;
    }

    return comments;
  }

  /**
   * Changelogs should only be generated for publishable projects.
   * Do not update changelog or delete the change files for prerelease. Save them for the official release.
   * Unless the package is a hotfix, in which case do delete the change files.
   *
   * @param project
   * @param allChanges
   */
  private static _shouldUpdateChangeLog(
    project: RushConfigurationProject,
    allChanges: IChangeRequests
  ): boolean {
    return (
      project.shouldPublish &&
      (!semver.prerelease(project.packageJson.version) ||
        allChanges.packageChanges.get(project.packageName)?.changeType === ChangeType.hotfix)
    );
  }
}
