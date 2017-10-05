// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import { JsonFile } from '@microsoft/node-core-library';

/** @public */
export interface ICustomCommand {
  name: string;
  description: string;
}

/** @public */
export interface ICustomEnumValue {
  name: string;
  description: string;
}

/** @public */
export interface ICustomOption {
  optionType: 'enum' | 'flag';
  description: string;
  supportedCommands: Array<string>;
  shortName?: string;
}

/** @public */
export interface ICustomEnumOption extends ICustomOption {
  optionType: 'enum';
  enumValues: Array<ICustomEnumValue>;
}

interface ICommandLineConfigurationJson {
  customCommands?: Array<ICustomCommand>;
  customOptions?: { [optionName: string]: ICustomOption };
}

/**
 * Custom Commands and Options for the Rush Command Line
 * @public
 */
export class CommandLineConfiguration {
  public options: Map<string, ICustomOption>;
  public commands: Map<string, ICustomCommand>;

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
    this.options = new Map<string, ICustomOption>();
    this.commands = new Map<string, ICustomCommand>();

    if (commandLineJson) {
      if (commandLineJson.customCommands) {
        commandLineJson.customCommands.forEach((command: ICustomCommand) => {
          this.commands.set(command.name, command);
        });
      }

      if (commandLineJson.customOptions) {
        Object.keys(commandLineJson.customOptions).forEach((flagName: string) => {
          const customOption: ICustomOption = commandLineJson.customOptions![flagName];
          this.options.set(flagName, customOption);
        });
      }
    }
  }
}
