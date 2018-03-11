// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

import RushConfigurationProject from '../../data/RushConfigurationProject';
import { RushConstants } from '../../RushConstants';
import { VersionMismatchFinder } from '../../data/VersionMismatchFinder';
import RushCommandLineParser from './RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';

export default class CheckAction extends BaseRushAction {
  private _parser: RushCommandLineParser;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'check',
      summary: 'Checks each project\'s package.json files and ensures that all dependencies are of the same ' +
        'version throughout the repository.',
      documentation: 'Checks each project\'s package.json files and ensures that all dependencies are of the ' +
        'same version throughout the repository.',
      safeForSimultaneousRushProcesses: true
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected run(): Promise<void> {
    const pinnedVersions: { [dependency: string]: string } = {};
    this.rushConfiguration.pinnedVersions.forEach((version: string, dependency: string) => {
      pinnedVersions[dependency] = version;
    });

    this.rushConfiguration.projects.push({
      packageName: RushConstants.pinnedVersionsFilename,
      packageJson: { dependencies: pinnedVersions }
    } as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(this.rushConfiguration.projects);

    // Iterate over the list. For any dependency with mismatching versions, print the projects
    mismatchFinder.getMismatches().forEach((dependency: string) => {
      console.log(colors.yellow(dependency));
      mismatchFinder.getVersionsOfMismatch(dependency)!.forEach((version: string) => {
        console.log(`  ${version}`);
        mismatchFinder.getConsumersOfMismatch(dependency, version)!.forEach((project: string) => {
          console.log(`   - ${project}`);
        });
      });
      console.log();
    });

    if (mismatchFinder.numberOfMismatches) {
      console.log(colors.red(`Found ${mismatchFinder.numberOfMismatches} mis-matching dependencies!`));
      process.exit(1);
    } else {
      console.log(colors.green(`Found no mis-matching dependencies!`));
    }
    return Promise.resolve();
  }
}
