/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as minimatch from 'minimatch';
import { EOL } from 'os';

import {
  CommandLineAction,
  CommandLineFlagParameter,
  CommandLineStringParameter
} from '@microsoft/ts-command-line';

import Utilities from '../utilities/Utilities';
import RushConfig from '../data/RushConfig';
import RushConfigProject from '../data/RushConfigProject';
import RushCommandLineParser from './RushCommandLineParser';

export default class PublishAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;
  private _registryUrl: CommandLineStringParameter;
  private _includes: CommandLineStringParameter;
  private _unpublish: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'publish',
      summary: 'Publishes a set of projects',
      documentation: 'Publishes the set of all projects, unless the --include command is specified. ' +
                     'Additionally, publishing to a specific registry is also supported.'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._registryUrl = this.defineStringParameter({
      parameterLongName: '--registry',
      parameterShortName: '-r',
      description: `Publishes a to the specified NPM registry. Note this will run 'npm unpublish --force' ` +
                   `before publishing, so it is best used with local NPM registries, such as a Sinopia instance.`
    });
    this._includes = this.defineStringParameter({
      parameterLongName: '--include',
      parameterShortName: '-i',
      description: `Only publish packages which match a pattern, specified as a comma seperated list, ` +
                   `using * as a wildcard. If not specified, all packages will be published. ` +
                   `Example: --include=@microsoft/* will match all packages in the @microsoft scope.`
    });
    this._unpublish = this.defineFlagParameter({
      parameterLongName: '--unpublish',
      parameterShortName: '-u',
      description: `If this flag is specified, we will attempt to unpublish the specific version before publishing.` +
                   ` If a registry is not defined, this flag will have no effect.`
    });
  }

  protected onExecute(): void {
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    console.log(`Starting "rush publish" ${EOL}`);

    const skippedProjects: RushConfigProject[] = [];
    const failedProjects: RushConfigProject[] = [];
    const successfulProjects: RushConfigProject[] = [];

    // Publish each package
    for (const project of this._rushConfig.projects) {
      if (!this._includes.value || minimatch(project.packageName, this._includes.value)) {
        try {
          this.publishProject(project);
          successfulProjects.push(project);
        } catch (error) {
          console.log(colors.red(`Failed to publish ${project.packageName}!`));
          console.log(error);
          failedProjects.push(project);
        }
      } else {
        skippedProjects.push(project);
      }
    }

    if (this._includes.value) {
      console.log(colors.yellow(`${EOL}Skipped packages (did not match pattern from --include):`));
      for (const project of skippedProjects) {
        console.warn(colors.yellow(` - ${project.packageName}`));
      }
    }

    if (failedProjects.length === 0) {
      console.log(colors.green(`${EOL}Successfully published:`));
      for (const project of successfulProjects) {
        console.log(colors.green(` - ${project.packageName}`));
      }
    } else {
      console.log(colors.red(`${EOL}Failed to publish:`));
      for (const project of failedProjects) {
        console.log(colors.red(` - ${project.packageName}`));
      }
      process.exit(1);
    }
  }

  protected publishProject(rushProject: RushConfigProject): void {
      console.log(`${EOL}Publishing ${rushProject.packageName}`);
      const projectFolder: string = rushProject.projectFolder;

      const env: { [key: string]: string } = {};
      // Copy existing process.env values (for nodist)
      Object.keys(process.env).forEach((key: string) => {
        env[key] = process.env[key];
      });

      if (this._registryUrl.value) {
        env['npm_config_registry'] = this._registryUrl.value; // tslint:disable-line:no-string-literal
      }

      // Unpublish existing versions, since using publish --force causes lots of
      // things to be written to stderr. This is cleaner.
      if (this._unpublish) {
        const packageFullName: string = `${rushProject.packageName}@${rushProject.packageJson.version}`;

        console.log(`npm unpublish ${packageFullName}`);
        Utilities.executeCommand(
          this._rushConfig.npmToolFilename,
          ['unpublish', packageFullName],
          projectFolder,
          false /* suppress output */,
          env);
      }

      console.log('npm publish');
      Utilities.executeCommand(
        this._rushConfig.npmToolFilename,
        ['publish'],
        projectFolder,
        false /* suppress output */,
        env);

      console.log(colors.green(`Published ${rushProject.packageName}!${EOL}`));
  }
}
