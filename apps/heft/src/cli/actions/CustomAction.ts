// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';

import { HeftActionBase, IHeftActionBaseOptions } from './HeftActionBase';
import { CustomParameterType, ICustomParameter } from './CustomParameters';

/** @beta */
export interface ICustomActionOptions<TParameters> {
  actionName: string;
  documentation: string;
  summary?: string;

  parameters?: { [K in keyof TParameters]: ICustomParameter<TParameters[K]> };

  callback: (parameters: TParameters) => void | Promise<void>;
}

export class CustomAction<TParameters> extends HeftActionBase {
  private _customActionOptions: ICustomActionOptions<TParameters>;
  private _parameterValues!: Map<string, () => CustomParameterType>;

  public constructor(
    customActionOptions: ICustomActionOptions<TParameters>,
    options: IHeftActionBaseOptions
  ) {
    super(
      {
        actionName: customActionOptions.actionName,
        documentation: customActionOptions.documentation,
        summary: customActionOptions.summary || ''
      },
      options
    );

    this._customActionOptions = customActionOptions;
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._parameterValues = new Map<string, () => CustomParameterType>();
    for (const [callbackValueName, untypedParameterOption] of Object.entries(
      this._customActionOptions.parameters || {}
    )) {
      if (this._parameterValues.has(callbackValueName)) {
        throw new Error(`Duplicate callbackValueName: ${callbackValueName}`);
      }

      let getParameterValue: () => CustomParameterType;

      const parameterOption: ICustomParameter<CustomParameterType> =
        untypedParameterOption as ICustomParameter<CustomParameterType>;
      switch (parameterOption.kind) {
        case 'flag': {
          const parameter: CommandLineFlagParameter = this.defineFlagParameter({
            parameterLongName: parameterOption.parameterLongName,
            description: parameterOption.description
          });
          getParameterValue = () => parameter.value;
          break;
        }

        case 'string': {
          const parameter: CommandLineStringParameter = this.defineStringParameter({
            parameterLongName: parameterOption.parameterLongName,
            description: parameterOption.description,
            argumentName: 'VALUE'
          });
          getParameterValue = () => parameter.value;
          break;
        }

        case 'integer': {
          const parameter: CommandLineIntegerParameter = this.defineIntegerParameter({
            parameterLongName: parameterOption.parameterLongName,
            description: parameterOption.description,
            argumentName: 'VALUE'
          });
          getParameterValue = () => parameter.value;
          break;
        }

        case 'stringList': {
          const parameter: CommandLineStringListParameter = this.defineStringListParameter({
            parameterLongName: parameterOption.parameterLongName,
            description: parameterOption.description,
            argumentName: 'VALUE'
          });
          getParameterValue = () => parameter.values;
          break;
        }

        default: {
          throw new Error(
            // @ts-expect-error All cases are handled above, therefore parameterOption is of type `never`
            `Unrecognized parameter kind "${parameterOption.kind}" for parameter "${parameterOption.parameterLongName}`
          );
        }
      }

      this._parameterValues.set(callbackValueName, getParameterValue);
    }
  }

  protected async actionExecuteAsync(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parameterValues: Record<string, any> = {};

    for (const [callbackName, getParameterValue] of this._parameterValues.entries()) {
      parameterValues[callbackName] = getParameterValue();
    }

    await this._customActionOptions.callback(parameterValues as TParameters);
  }
}
