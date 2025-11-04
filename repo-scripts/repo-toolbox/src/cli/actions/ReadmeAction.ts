// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as Diff from 'diff';

import { StringBuilder, Sort, FileSystem, Text, AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize, type ITerminal } from '@rushstack/terminal';
import { RushConfiguration, type RushConfigurationProject, LockStepVersionPolicy } from '@microsoft/rush-lib';
import { CommandLineAction, type CommandLineFlagParameter } from '@rushstack/ts-command-line';

const GENERATED_PROJECT_SUMMARY_START_COMMENT_TEXT: string = '<!-- GENERATED PROJECT SUMMARY START -->';
const GENERATED_PROJECT_SUMMARY_END_COMMENT_TEXT: string = '<!-- GENERATED PROJECT SUMMARY END -->';

export class ReadmeAction extends CommandLineAction {
  private readonly _verifyParameter: CommandLineFlagParameter;

  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      actionName: 'readme',
      summary: 'Generates README.md project table based on rush.json inventory',
      documentation: "Use this to update the repo's README.md"
    });

    this._terminal = terminal;

    this._verifyParameter = this.defineFlagParameter({
      parameterLongName: '--verify',
      parameterShortName: '-v',
      description: 'Verify that the README.md file is up-to-date.'
    });
  }

  private static _isPublished(project: RushConfigurationProject): boolean {
    return project.shouldPublish || !!project.versionPolicyName;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation();

    const repoReadmePath: string = path.resolve(rushConfiguration.rushJsonFolder, 'README.md');
    let existingReadme: string = await FileSystem.readFileAsync(repoReadmePath);
    existingReadme = Text.convertToLf(existingReadme);
    const generatedProjectSummaryStartIndex: number = existingReadme.indexOf(
      GENERATED_PROJECT_SUMMARY_START_COMMENT_TEXT
    );
    const generatedProjectSummaryEndIndex: number = existingReadme.indexOf(
      GENERATED_PROJECT_SUMMARY_END_COMMENT_TEXT
    );

    if (generatedProjectSummaryStartIndex === -1 || generatedProjectSummaryEndIndex === -1) {
      throw new Error(
        `Unable to find "${GENERATED_PROJECT_SUMMARY_START_COMMENT_TEXT}" or ` +
          `"${GENERATED_PROJECT_SUMMARY_END_COMMENT_TEXT}" comment in "${repoReadmePath}"`
      );
    }

    const readmePrefix: string = existingReadme.substr(
      0,
      generatedProjectSummaryStartIndex + GENERATED_PROJECT_SUMMARY_START_COMMENT_TEXT.length
    );

    const readmePostfix: string = existingReadme.substr(generatedProjectSummaryEndIndex);

    const builder: StringBuilder = new StringBuilder();
    const orderedProjects: RushConfigurationProject[] = [...rushConfiguration.projects];
    Sort.sortBy(orderedProjects, (x) => x.projectRelativeFolder);

    builder.append(readmePrefix);
    builder.append('\n');
    builder.append('\n');
    builder.append('## Published Packages\n\n');
    builder.append('<!-- the table below was generated using the ./repo-scripts/repo-toolbox script -->\n\n');
    builder.append('| Folder | Version | Changelog | Package |\n');
    builder.append('| ------ | ------- | --------- | ------- |\n');
    for (const project of orderedProjects) {
      if (!ReadmeAction._isPublished(project)) {
        continue;
      }

      // Example:
      //
      // | [/apps/api-extractor](./apps/api-extractor/)
      // | [![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg
      //     )](https://badge.fury.io/js/%40microsoft%2Fapi-extractor)
      // | [changelog](./apps/api-extractor/CHANGELOG.md)
      // | [@microsoft/api-extractor](https://www.npmjs.com/package/@microsoft/api-extractor)
      // |

      const scopedName: string = project.packageName; // "@microsoft/api-extractor"
      const folderPath: string = project.projectRelativeFolder; // "apps/api-extractor"
      const escapedScopedName: string = encodeURIComponent(scopedName); // "%40microsoft%2Fapi-extractor"

      // | [/apps/api-extractor](./apps/api-extractor/)
      builder.append(`| [/${folderPath}](./${folderPath}/) `);

      // | [![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg
      //     )](https://badge.fury.io/js/%40microsoft%2Fapi-extractor)
      builder.append(
        `| [![npm version](https://badge.fury.io/js/${escapedScopedName}.svg)]` +
          `(https://badge.fury.io/js/${escapedScopedName}) `
      );

      let hasChangeLog: boolean = true;
      if (project.versionPolicy instanceof LockStepVersionPolicy) {
        if (project.versionPolicy.mainProject) {
          if (project.versionPolicy.mainProject !== project.packageName) {
            hasChangeLog = false;
          }
        }
      }

      // | [changelog](./apps/api-extractor/CHANGELOG.md)
      if (hasChangeLog) {
        builder.append(`| [changelog](./${folderPath}/CHANGELOG.md) `);
      } else {
        builder.append(`| `);
      }

      // | [@microsoft/api-extractor](https://www.npmjs.com/package/@microsoft/api-extractor)
      builder.append(`| [${scopedName}](https://www.npmjs.com/package/${scopedName}) `);

      builder.append(`|\n`);
    }

    builder.append('\n\n## Unpublished Local Projects\n\n');
    builder.append('<!-- the table below was generated using the ./repo-scripts/repo-toolbox script -->\n\n');
    builder.append('| Folder | Description |\n');
    builder.append('| ------ | -----------|\n');
    for (const project of orderedProjects) {
      if (ReadmeAction._isPublished(project)) {
        continue;
      }

      const folderPath: string = project.projectRelativeFolder; // "apps/api-extractor"

      // | [/apps/api-extractor](./apps/api-extractor/)
      builder.append(`| [/${folderPath}](./${folderPath}/) `);

      const description: string = (project.packageJson.description || '').replace(/[\n\r|]+/g, '');

      builder.append(`| ${description} `);

      builder.append(`|\n`);
    }

    builder.append(readmePostfix);

    const readmeString: string = builder.toString();
    const diff: Diff.Change[] = Diff.diffLines(existingReadme, readmeString);
    const readmeIsUpToDate: boolean = diff.length === 1 && !diff[0].added && !diff[0].removed;

    const terminal: ITerminal = this._terminal;

    if (!readmeIsUpToDate) {
      if (this._verifyParameter.value) {
        for (const change of diff) {
          const lines: string[] = change.value.trimEnd().split('\n');
          let linePrefix: string;
          let colorizer: (text: string) => string;
          if (change.added) {
            linePrefix = '+ ';
            colorizer = Colorize.green;
          } else if (change.removed) {
            linePrefix = '- ';
            colorizer = Colorize.red;
          } else {
            linePrefix = '  ';
            colorizer = Colorize.gray;
          }

          for (const line of lines) {
            terminal.writeLine(colorizer(linePrefix + line));
          }
        }

        terminal.writeLine();
        terminal.writeLine();
        terminal.writeErrorLine(
          `The README.md needs to be updated. Please run 'repo-toolbox readme' to update the README.md.`
        );

        throw new AlreadyReportedError();
      } else {
        terminal.writeLine(`Writing ${repoReadmePath}`);
        await FileSystem.writeFileAsync(repoReadmePath, readmeString);
        terminal.writeLine();
        terminal.writeLine(Colorize.green('\nSuccess.'));
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(`The README.md is up to date.`);
    }
  }
}
