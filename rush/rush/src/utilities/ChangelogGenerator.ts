// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import PublishUtilities, {
  IChangeInfoHash
} from './PublishUtilities';
import {
  IChangeInfo,
  ChangeType,
  RushConfigurationProject
} from '@microsoft/rush-lib';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface respresenting a changelog json object for a package used to represent the parsed
 * content of CHANGELOG.json
 */
export interface IChangelog {
  /**
   * Name of the project
   */
  name: string;

  /**
   * Entries within the changelog corresponding to each published version.
   */
  entries: IChangeLogEntry[];
}

/**
 * Interface representing a single published entry in the changelog.
 */
export interface IChangeLogEntry {
  /**
   * Published version for the entry. (Example: 1.0.0)
   */
  version: string;

  /**
   * Git tag used to identify the published commit. (Example: b7f55611e54910327a206476b185265498c66acf)
   */
  tag: string;

  /**
   * The UTC date when the publish was applied. (Example: Fri, 02 Dec 2016 22:27:16 GMT)
   */
  date: string;

  /**
   * Comments for the entry, where key respresents the ChangeType string (Example: major)
   */
  comments: {
    [changeType: string]: IChangeLogComment[];
  };
}

/**
 * Interface representing a single changelog comment within an entry.
 */
export interface IChangeLogComment {
  /**
   * The given comment. (supports markdown.)
   */
  comment: string;

  /**
   * The author, if applicable, that created the change request.
   */
  author?: string;

  /**
   * The commit, if applicable, including the change request.
   */
  commit?: string;
}

const CHANGELOG_JSON: string = 'CHANGELOG.json';
const CHANGELOG_MD: string = 'CHANGELOG.md';
const EOL: string = '\n';

export default class ChangelogGenerator {

  /**
   * Updates the appropriate changelogs with the given changes.
   */
  public static updateChangelogs(
    allChanges: IChangeInfoHash,
    allProjects: Map<string, RushConfigurationProject>,
    shouldCommit: boolean
  ): void {
    for (const packageName in allChanges) {
      if (allChanges.hasOwnProperty(packageName)) {
        const project: RushConfigurationProject = allProjects.get(packageName);

        // Changelogs should only be generated for publishable projects.
        if (project.shouldPublish) {
          ChangelogGenerator.updateIndividualChangelog(
            allChanges[packageName],
            allProjects.get(packageName).projectFolder,
            shouldCommit);
        }
      }
    }
  }

  /**
   * Fully regenerate the markdown files based on the current json files.
   */
  public static regenerateChangelogs(
    allProjects: Map<string, RushConfigurationProject>
  ): void {
    allProjects.forEach(project => {
      const markdownPath: string = path.resolve(project.projectFolder, CHANGELOG_MD);
      const markdownJSONPath: string = path.resolve(project.projectFolder, CHANGELOG_JSON);

      if (fs.existsSync(markdownPath)) {
        console.log('Found: ' + markdownPath);
        if (!fs.existsSync(markdownJSONPath)) {
          throw new Error('A CHANGELOG.md without json: ' + markdownPath);
        }

        const changelog: IChangelog = ChangelogGenerator._getChangelog(project.packageName, project.projectFolder);

        fs.writeFileSync(
          path.join(project.projectFolder, CHANGELOG_MD),
          ChangelogGenerator._translateToMarkdown(changelog),
          'utf8');
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
    forceUpdate?: boolean
  ): IChangelog {
    const changelog: IChangelog = ChangelogGenerator._getChangelog(change.packageName, projectFolder);

    if (
      change.changeType > ChangeType.none &&
      !changelog.entries.some(entry => entry.version === change.newVersion)) {

      const changelogEntry: IChangeLogEntry = {
        version: change.newVersion,
        tag: PublishUtilities.createTagname(change.packageName, change.newVersion),
        date: new Date().toUTCString(),
        comments: {}
      };

      change.changes.forEach(individualChange => {
        if (individualChange.comment) {

          // Initialize the comments array only as necessary.
          const changeTypeString: string = ChangeType[individualChange.changeType];
          const comments: IChangeLogComment[] =
            changelogEntry.comments[changeTypeString] =
            changelogEntry.comments[changeTypeString] || [];

          comments.push({
            author: individualChange.author,
            commit: individualChange.commit,
            comment: individualChange.comment
          });
        }
      });

      // Add the changelog entry to the start of the list.
      changelog.entries.unshift(changelogEntry);

      const changelogFilename: string = path.join(projectFolder, CHANGELOG_JSON);

      console.log(
        `${EOL}* ${shouldCommit ? 'APPLYING' : 'DRYRUN'}: ` +
        `Changelog update for "${change.packageName}@${change.newVersion}".`
      );

      if (shouldCommit) {
        // Write markdown transform.
        fs.writeFileSync(changelogFilename, JSON.stringify(changelog, undefined, 2), 'utf8');

        fs.writeFileSync(
          path.join(projectFolder, CHANGELOG_MD),
          ChangelogGenerator._translateToMarkdown(changelog),
          'utf8');
      }
    }

    return changelog;
  }

  /**
   * Loads the changelog json from disk, or creates a new one if there isn't one.
   */
  private static _getChangelog(packageName: string, projectFolder: string): IChangelog {
    const changelogFilename: string = path.join(projectFolder, CHANGELOG_JSON);
    let changelog: IChangelog;

    // Try to read the existing changelog.
    if (fs.existsSync(changelogFilename)) {
      changelog = JSON.parse(fs.readFileSync(changelogFilename, 'utf8')) as IChangelog;
    }

    if (!changelog) {
      changelog = {
        name: packageName,
        entries: []
      };
    }

    return changelog;
  }

  /**
   * Translates the given changelog json object into a markdown string.
   */
  private static _translateToMarkdown(changelog: IChangelog): string {
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

      comments += ChangelogGenerator._getChangeComments(
        'Breaking changes',
        entry.comments[ChangeType[ChangeType.major]]);

      comments += ChangelogGenerator._getChangeComments(
        'Minor changes',
        entry.comments[ChangeType[ChangeType.minor]]);

      comments += ChangelogGenerator._getChangeComments(
        'Patches',
        entry.comments[ChangeType[ChangeType.patch]]);

      if (!comments) {
        markdown += ((changelog.entries.length === index + 1) ?
          '*Initial release*' :
          '*Changes not tracked*') +
          EOL + EOL;
      } else {
        markdown += comments;
      }

    });

    return markdown;
  }

  /**
   * Helper to return the comments string to be appends to the markdown content.
   */
  private static _getChangeComments(title: string, commentsArray: IChangeLogComment[]): string {
    let comments: string = '';

    if (commentsArray) {
      comments = `### ${title}${EOL + EOL}`;
      commentsArray.forEach(comment => {
        comments += `- ${comment.comment}${EOL}`;
      });
      comments += EOL;
    }

    return comments;
  }

}