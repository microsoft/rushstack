// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as fsx from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { JsonFile, PackageJsonLookup } from '@microsoft/node-core-library';

import {
  CommandLineAction,
  CommandLineStringParameter,
  CommandLineFlagParameter
} from '@microsoft/ts-command-line';

import { Extractor } from '../extractor/Extractor';
import { IExtractorConfig } from '../extractor/IExtractorConfig';

import { ApiExtractorCommandLine } from './ApiExtractorCommandLine';

const AE_CONFIG_FILENAME: string = 'api-extractor.json';

export class RunAction extends CommandLineAction {
  private _parser: ApiExtractorCommandLine;
  private _configFileParameter: CommandLineStringParameter;
  private _localParameter: CommandLineFlagParameter;

  constructor(parser: ApiExtractorCommandLine) {
    super({
      actionVerb: 'run',
      summary: 'Invoke API Extractor on a project',
      documentation: 'Invoke API Extractor on a project'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void { // override
    this._configFileParameter = this.defineStringParameter({
      parameterLongName: '--config',
      parameterShortName: '-c',
      key: 'FILE',
      description: `Use the specified ${AE_CONFIG_FILENAME} file path, rather than guessing its location`
    });
    this._localParameter = this.defineFlagParameter({
      parameterLongName: '--local',
      parameterShortName: '-l',
      description: 'Indicates that API Extractor is running as part of a local build,'
        + ' e.g. on a developer\'s machine. This disables certain validation that would'
        + ' normally be performed for a ship/production build. For example, the *.api.ts'
        + ' review file is automatically copied in a local build.'
    });
  }

  protected onExecute(): Promise<void> { // override
    let configFilename: string;

    if (this._configFileParameter.value) {
      configFilename = path.normalize(this._configFileParameter.value);
      if (!fsx.existsSync(configFilename)) {
        throw new Error('Config file not found: ' + this._configFileParameter.value);
      }
    } else {
      // Otherwise, figure out which project we're in and look for the config file
      // at the project root
      const lookup: PackageJsonLookup = new PackageJsonLookup();
      const packageFolder: string|undefined = lookup.tryGetPackageFolder('.');

      if (packageFolder) {
        configFilename = path.join(packageFolder, AE_CONFIG_FILENAME);
      } else {
        // If there is no package, then try the current directory
        configFilename = path.join(process.cwd(), AE_CONFIG_FILENAME);
      }

      if (!fsx.existsSync(configFilename)) {
        throw new Error(`Unable to find an ${AE_CONFIG_FILENAME} file`);
      }

      console.log(`Using configuration from ${configFilename}` + os.EOL + os.EOL);
    }

    const config: IExtractorConfig = JsonFile.loadAndValidate(configFilename, Extractor.jsonSchema);
    const extractor: Extractor = new Extractor(config, {
      localBuild: this._localParameter.value
    });

    if (!extractor.processProject()) {
      console.log(os.EOL + colors.yellow('API Extractor completed with errors or warnings'));
      process.exitCode = 1;
    }
    return Promise.resolve();
  }
}
