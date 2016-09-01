/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as colors from 'colors';
import * as minimatch from 'minimatch';
import { EOL } from 'os';

import CommandLineAction from '../commandLine/CommandLineAction';
import Utilities from '../utilities/Utilities';
import RushConfig from '../data/RushConfig';
import RushConfigProject from '../data/RushConfigProject';

import RushCommandLineParser from './RushCommandLineParser';
import { CommandLineStringParameter } from '../commandLine/CommandLineParameter';

export default class PublishAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;
  private _registryUrl: CommandLineStringParameter;
  private _includes: CommandLineStringParameter;

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
  }

  protected onExecute(): void {
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    console.log(`Starting "rush publish" ${EOL}`);

    // Publish each package
    for (const project of this._rushConfig.projects) {
      if (minimatch(project.packageName, this._includes.value)) {
        this.publishProject(project);
      } else {
        console.warn(colors.yellow(`Skipping project "${project.packageName}", ` +
          'which did not match pattern from "--include" parameter'));
      }
    }

    console.log(colors.green(`${EOL}Finished "rush publish" successfully!`));
  }

  protected publishProject(rushProject: RushConfigProject): void {
    try {
      console.log(`${EOL}Publishing ${rushProject.packageName}`);
      const projectFolder: string = rushProject.projectFolder;

      const env: { [key: string]: string } = {};

      if (this._registryUrl.value) {
        env['npm_config_registry'] = this._registryUrl.value; // tslint:disable-line:no-string-literal
      }

      // Unpublish existing versions, since using publish --force causes lots of
      // things to be written to stderr. This is cleaner.
      if (this._registryUrl.value) {
        console.log('npm unpublish --force');
        Utilities.executeCommand(
          this._rushConfig.npmToolFilename,
          ['unpublish', '--force'],
          projectFolder,
          true /* suppress output */,
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
    } catch (error) {
      console.log(error);
      process.exit(1);
    }
  }
}
