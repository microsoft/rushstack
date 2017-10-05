import {
  CommandLineConfiguration,
  ICustomCommand,
  ICustomOption,
  ICustomEnumOption,
  ICustomEnumValue
} from '@microsoft/rush-lib';

import { BaseRushAction } from './BaseRushAction';

export class CustomRushAction extends BaseRushAction {
  private customOptions: Array<ICustomOption> = [];

  public addCustomOption(option: ICustomOption): void {
    this.customOptions.push(option);
  }

  protected onDefineParameters(): void {
    this.customOptions.forEach((customOption: ICustomOption) => {
      if (customOption.optionType === 'flag') {
        this.defineFlagParameter({
          parameterShortName: customOption.shortName,
          parameterLongName: customOption.longName,
          description: customOption.description
        });
      } else if (customOption.optionType === 'enum') {
        this.defineOptionParameter({
          parameterShortName: customOption.shortName,
          parameterLongName: customOption.longName,
          description: customOption.description,
          options: (customOption as ICustomEnumOption).enumValues.map((enumValue: ICustomEnumValue) => {
            return enumValue.name;
          })
        });
      }
    });
  }

  protected run(): void {
    // const thingToExecute: string = this.options.actionVerb;
  }
}

export class CustomCommandFactory {
  public static createCommands(commandLineConfig: CommandLineConfiguration): Map<string, CustomRushAction> {
    const customActions: Map<string, CustomRushAction> = new Map<string, CustomRushAction>();

    commandLineConfig.commands.forEach((command: ICustomCommand) => {
      customActions.set(command.name, new CustomRushAction({
        actionVerb: command.name,
        summary: command.description,
        documentation: command.description
      }));
    });

    commandLineConfig.options.forEach((customOption: ICustomOption) => {
      customOption.supportedCommands.forEach((associatedCommand: string) => {
        if (associatedCommand !== 'build') {
          const customAction: CustomRushAction | undefined = customActions.get(associatedCommand);
          if (customAction) {
            customAction.addCustomOption(customOption);
          } else {
            throw new Error(`Cannot find custom command "${associatedCommand}" associated with`
              + ` custom option "${customOption.longName}".`);
          }
        }
      });
    });

    return customActions;
  }
}