/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as os from 'os';
import { CommandLineAction } from '@microsoft/ts-command-line';

import RushCommandLineParser from './RushCommandLineParser';

import {
  RushConfiguration,
  VersionMismatchFinder
} from '@microsoft/rush-lib';

export default class CheckVersionsAction extends CommandLineAction {
  private _parser: RushCommandLineParser;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'check-versions',
      summary: 'Checks each project\'s package.json files and ensures that all dependencies are of the same ' +
        'version throughout the repository.',
      documentation: 'Checks each project\'s package.json files and ensures that all dependencies are of the ' +
        'same version throughout the repository.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    // abstract
  }

  protected onExecute(): void {
    console.log(`Starting "rush check-versions"${os.EOL}`);

    const config: RushConfiguration = RushConfiguration.loadFromDefaultLocation();

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(config.projects);

    // Iterate over the list. For any dependency with mismatching versions, print the projects
    mismatchFinder.getMismatches().forEach((dependency: string) => {
      console.log(colors.yellow(dependency));
      mismatchFinder.getVersionsOfMismatch(dependency).forEach((version: string) => {
        console.log(`  ${version}`);
        mismatchFinder.getConsumersOfMismatch(dependency, version).forEach((project: string) => {
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
  }
}
