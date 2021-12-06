// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

import * as path from 'path';
import { StringBuilder, Sort, FileSystem, Text } from '@rushstack/node-core-library';
import { RushConfiguration, RushConfigurationProject, LockStepVersionPolicy } from '@microsoft/rush-lib';
import { CommandLineAction, CommandLineFlagParameter } from '@rushstack/ts-command-line';

const GENERATED_PROJECT_SUMMARY_START_COMMENT_TEXT: string = '<!-- GENERATED PROJECT SUMMARY START -->';
const GENERATED_PROJECT_SUMMARY_END_COMMENT_TEXT: string = '<!-- GENERATED PROJECT SUMMARY END -->';

export class ReadmeAction extends CommandLineAction {
  private _verifyParameter!: CommandLineFlagParameter;

  public constructor() {
    super({
      actionName: 'readme',
      summary: 'Generates README.md project table based on rush.json inventory',
      documentation: "Use this to update the repo's README.md"
    });
  }

  private static _isPublished(project: RushConfigurationProject): boolean {
    return project.shouldPublish || !!project.versionPolicyName;
  }

  protected async onExecute(): Promise<void> {
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
    const readmeIsUpToDate: boolean = existingReadme === readmeString;

    if (!readmeIsUpToDate) {
      if (this._verifyParameter.value) {
        throw new Error(
          `The README.md needs to be updated. Please run 'repo-toolbox readme' to update the README.md.`
        );
      } else {
        console.log(`Writing ${repoReadmePath}`);
        await FileSystem.writeFileAsync(repoReadmePath, readmeString);
        console.log('\nSuccess.');
      }
    } else {
      console.log(`The README.md is up to date.`);
    }
  }

  protected onDefineParameters(): void {
    this._verifyParameter = this.defineFlagParameter({
      parameterLongName: '--verify',
      parameterShortName: '-v',
      description: 'Verify that the README.md file is up-to-date.'
    });
  }
}
