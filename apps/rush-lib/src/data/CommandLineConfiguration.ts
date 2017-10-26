// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as path from 'path';

import {
  JsonFile,
  JsonSchema
} from '@microsoft/node-core-library';

import { RushConstants } from '../RushConstants';

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
  associatedCommands: Array<string>;
  shortName?: string;
}

/** @public */
export interface ICustomEnumOption extends ICustomOption {
  optionType: 'enum';
  enumValues: Array<ICustomEnumValue>;
  defaultValue?: string;
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
      const schemaFilename: string = path.join(__dirname, 'commandLineConfiguration.schema.json');
      commandLineJson = JsonFile.loadAndValidate(jsonFilename, JsonSchema.fromFile(schemaFilename));
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

          if (customOption.optionType === 'enum') {
            const customEnum: ICustomEnumOption = customOption as ICustomEnumOption;

            const enumValues: string[] = customEnum.enumValues.map(v => v.name);

            if (customEnum.defaultValue &&
               (enumValues.indexOf(customEnum.defaultValue) === -1)) {
              throw new Error(`In "${RushConstants.commandLineFilename}", custom option "${flagName}",`
                + ` uses a default value "${customEnum.defaultValue}"`
                + ` which is missing from list of options: "${enumValues.toString()}"`);
            }
          }

          this.options.set(flagName, customOption);
        });
      }
    }
  }
}
