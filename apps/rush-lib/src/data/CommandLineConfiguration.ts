// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as path from 'path';

import {
  JsonFile,
  JsonSchema
} from '@microsoft/node-core-library';

import { RushConstants } from '../RushConstants';

export interface ICustomCommand {
  name: string;
  summary: string;
  documentation: string | undefined;
  parallelized: boolean;
  optional: boolean;
}

export interface ICustomEnumValue {
  name: string;
  description: string;
}

export type CustomOption = ICustomEnumOption | ICustomFlagOption;

export interface IBaseCustomOption {
  description: string;
  associatedCommands: Array<string>;
  shortName?: string;
}

export interface ICustomFlagOption extends IBaseCustomOption {
  optionType: 'flag';
}

export interface ICustomEnumOption extends IBaseCustomOption {
  optionType: 'enum';
  enumValues: Array<ICustomEnumValue>;
  defaultValue?: string;
}

interface ICommandLineConfigurationJson {
  customCommands?: Array<ICustomCommand>;
  customOptions?: { [optionName: string]: CustomOption };
}

/**
 * Custom Commands and Options for the Rush Command Line
 * @public
 */
export class CommandLineConfiguration {
  private static _schema: JsonSchema | undefined = undefined;
  public options: Map<string, CustomOption>;
  public commands: Map<string, ICustomCommand>;

  /** Attempts to load pinned versions configuration from a given file */
  public static tryLoadFromFile(jsonFilename: string): CommandLineConfiguration {
    let commandLineJson: ICommandLineConfigurationJson | undefined = undefined;
    if (fs.existsSync(jsonFilename)) {
      commandLineJson = JsonFile.loadAndValidate(jsonFilename, CommandLineConfiguration.getSchema());
    }
    return new CommandLineConfiguration(commandLineJson);
  }

  private static getSchema(): JsonSchema {
    if (!CommandLineConfiguration._schema) {
      const schemaFilename: string = path.join(__dirname, '../schemas/command-line.schema.json');
      CommandLineConfiguration._schema = JsonSchema.fromFile(schemaFilename);
    }
    return CommandLineConfiguration._schema;
  }

  /**
   * Preferred to use CommandLineConfiguration.loadFromFile()
   */
  private constructor(commandLineJson: ICommandLineConfigurationJson | undefined) {
    this.options = new Map<string, CustomOption>();
    this.commands = new Map<string, ICustomCommand>();

    if (commandLineJson) {
      if (commandLineJson.customCommands) {
        commandLineJson.customCommands.forEach((command: ICustomCommand) => {
          this.commands.set(command.name, command);
        });
      }

      if (commandLineJson.customOptions) {
        for (const flagName of Object.keys(commandLineJson.customOptions)) {
          const customOption: CustomOption = commandLineJson.customOptions![flagName];

          if (customOption.optionType === 'enum') {

            const enumValues: string[] = customOption.enumValues.map(v => v.name);

            if (customOption.defaultValue &&
               (enumValues.indexOf(customOption.defaultValue) === -1)) {
              throw new Error(`In "${RushConstants.commandLineFilename}", custom option "${flagName}",`
                + ` uses a default value "${customOption.defaultValue}"`
                + ` which is missing from list of options: "${enumValues.toString()}"`);
            }
          }

          this.options.set(flagName, customOption);
        }
      }
    }
  }
}
