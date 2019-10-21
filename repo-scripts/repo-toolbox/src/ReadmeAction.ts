// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

import * as path from 'path';
import { StringBuilder, Text, Sort, FileSystem } from '@microsoft/node-core-library';
import { RushConfiguration, RushConfigurationProject } from '@microsoft/rush-lib';
import { CommandLineAction } from '@microsoft/ts-command-line';

export class ReadmeAction extends CommandLineAction {
  public constructor() {
    super({
      actionName: 'readme',
      summary: 'Generates README.md project table based on rush.json inventory',
      documentation: 'Use this to update the repo\'s README.md'
    });
  }

  private static _isPublished(project: RushConfigurationProject): boolean {
    return project.shouldPublish || !!project.versionPolicyName;
  }

  protected onExecute(): Promise<void> { // abstract

    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromDefaultLocation();

    const builder: StringBuilder = new StringBuilder();
    const orderedProjects: RushConfigurationProject[] = [...rushConfiguration.projects];
    Sort.sortBy(orderedProjects, x => x.projectRelativeFolder);

    builder.append('## Published Packages\n\n');
    builder.append('<!-- the table below was generated using the ./repo-scripts/repo-toolbox script -->\n\n');
    builder.append('| Folder | Version | Changelog | Package |\n');
    builder.append('| ------ | ------- | --------- | ------- |\n');
    for (const project of orderedProjects.filter(x => ReadmeAction._isPublished(x))) {

      // Example:
      //
      // | [/apps/api-extractor](./apps/api-extractor/)
      // | [![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg
      //     )](https://badge.fury.io/js/%40microsoft%2Fapi-extractor)
      // | [changelog](./apps/api-extractor/CHANGELOG.md)
      // | [@microsoft/api-extractor](https://www.npmjs.com/package/@microsoft/api-extractor)
      // |

      const scopedName: string = project.packageName; // "@microsoft/api-extractor"
      const folderPath: string = project.projectRelativeFolder;  // "apps/api-extractor"
      let escapedScopedName: string = scopedName;  // "%40microsoft%2Fapi-extractor"
      escapedScopedName = Text.replaceAll(escapedScopedName, '/', '%2F');
      escapedScopedName = Text.replaceAll(escapedScopedName, '@', '%40');

      // | [/apps/api-extractor](./apps/api-extractor/)
      builder.append(`| [/${folderPath}](./${folderPath}/) `);

      // | [![npm version](https://badge.fury.io/js/%40microsoft%2Fapi-extractor.svg
      //     )](https://badge.fury.io/js/%40microsoft%2Fapi-extractor)
      builder.append(`| [![npm version](https://badge.fury.io/js/${escapedScopedName}.svg)]`
        + `(https://badge.fury.io/js/${escapedScopedName}) `);

      // | [changelog](./apps/api-extractor/CHANGELOG.md)
      builder.append(`| [changelog](./${folderPath}/CHANGELOG.md) `);

      // | [@microsoft/api-extractor](https://www.npmjs.com/package/@microsoft/api-extractor)
      builder.append(`| [${scopedName}](https://www.npmjs.com/package/${scopedName}) `);

      builder.append(`|\n`);
    }

    builder.append('\n\n## Unpublished Local Projects\n\n');
    builder.append('<!-- the table below was generated using the ./repo-scripts/repo-toolbox script -->\n\n');
    builder.append('| Folder | Description |\n');
    builder.append('| ------ | -----------|\n');
    for (const project of orderedProjects.filter(x => !ReadmeAction._isPublished(x))) {
      const folderPath: string = project.projectRelativeFolder;  // "apps/api-extractor"

      // | [/apps/api-extractor](./apps/api-extractor/)
      builder.append(`| [/${folderPath}](./${folderPath}/) `);

      const description: string = (project.packageJson.description || '').replace(/[\n\r|]+/g, '');

      builder.append(`| ${description} `);

      builder.append(`|\n`);
    }

    const outputFilePath: string = path.resolve('./dist/README.md');

    console.log('Writing ' + outputFilePath);
    FileSystem.writeFile(outputFilePath, builder.toString(), { ensureFolderExists: true });

    console.log('\nSuccess.');

    return Promise.resolve();
  }

  protected onDefineParameters(): void { // abstract
  }
}
