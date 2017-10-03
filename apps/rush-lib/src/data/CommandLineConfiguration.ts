// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as semver from 'semver';
import { JsonFile } from '@microsoft/node-core-library';

export interface ICustomCommand {
  name: string;
  description: string;
}

export interface ICustomEnumValue {
  name: string;
  description: string;
}

export interface ICustomEnumOption extends ICustomOption {
  optionType: 'enum';
  enumValues: Array<ICustomEnumValue>;
}

export interface ICustomOption {
  optionType: 'enum' | 'flag';
  description: string;
  supportedCommands: Array<string>;
  shortName?: string;
}

interface ICommandLineConfigurationJson {
  customCommands: Array<ICustomCommand>;
  customOptions: { [optionName: string]: ICustomOption };
}

/**
 * Custom Commands and Options for the Rush Command Line
 * @public
 */
export class CommandLineConfiguration {
  private _options: Map<string, ICustomOption>;
  private _commands: Map<string, ICustomCommand>;

  /** Attempts to load pinned versions configuration from a given file */
  public static tryLoadFromFile(jsonFilename: string): CommandLineConfiguration {
    let commandLineJson: ICommandLineConfigurationJson | undefined = undefined;
    if (fs.existsSync(jsonFilename)) {
      commandLineJson = JsonFile.load(jsonFilename);
    }

    return new CommandLineConfiguration(commandLineJson);
  }

  /**
   * Preferred to use CommandLineConfiguration.loadFromFile()
   */
  private constructor(commandLineJson: ICommandLineConfigurationJson | undefined) {
    this._options = new Map<string, ICustomOption>();
    this._commands = new Map<string, ICustomCommand>();

    if (commandLineJson) {
      commandLineJson.customCommands.forEach((command: ICustomCommand) => {
        this._commands.set(command.name, command);
      });

      Object.keys(commandLineJson.customOptions).forEach((flagName: string) => {
        this._options.set(flagName, commandLineJson.customOptions[flagName]);
      });
    }
  }
}
