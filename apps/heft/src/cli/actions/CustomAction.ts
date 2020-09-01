// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';

import { HeftActionBase, IHeftActionBaseOptions } from './HeftActionBase';

/** @alpha */
export interface ICustomActionParameter {
  kind: 'flag' | 'integer' | 'string' | 'stringList'; // TODO: Add "choice"

  paramterLongName: string;
  description: string;
  callbackValueName: string;
}

/** @alpha */
export type CustomActionParameterType = string | boolean | number | ReadonlyArray<string> | undefined;

/** @alpha */
export interface ICustomActionOptions {
  actionName: string;
  documentation: string;
  summary?: string;

  parameters?: ICustomActionParameter[];

  callback: (parameters: { [callbackValueName: string]: CustomActionParameterType }) => void | Promise<void>;
}

export class CustomAction extends HeftActionBase {
  private _customActionOptions: ICustomActionOptions;
  private _parameterValues: Map<string, () => CustomActionParameterType>;

  public constructor(customActionOptions: ICustomActionOptions, options: IHeftActionBaseOptions) {
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

    this._parameterValues = new Map<string, () => CustomActionParameterType>();
    for (const parameterOption of this._customActionOptions.parameters || []) {
      if (this._parameterValues.has(parameterOption.callbackValueName)) {
        throw new Error(`Duplicate callbackValueName: ${parameterOption.callbackValueName}`);
      }

      let getParameterValue: () => CustomActionParameterType;

      switch (parameterOption.kind) {
        case 'flag': {
          const parameter: CommandLineFlagParameter = this.defineFlagParameter({
            parameterLongName: parameterOption.paramterLongName,
            description: parameterOption.description
          });
          getParameterValue = () => parameter.value;
          break;
        }

        case 'string': {
          const parameter: CommandLineStringParameter = this.defineStringParameter({
            parameterLongName: parameterOption.paramterLongName,
            description: parameterOption.description,
            argumentName: 'VALUE'
          });
          getParameterValue = () => parameter.value;
          break;
        }

        case 'integer': {
          const parameter: CommandLineIntegerParameter = this.defineIntegerParameter({
            parameterLongName: parameterOption.paramterLongName,
            description: parameterOption.description,
            argumentName: 'VALUE'
          });
          getParameterValue = () => parameter.value;
          break;
        }

        case 'stringList': {
          const parameter: CommandLineStringListParameter = this.defineStringListParameter({
            parameterLongName: parameterOption.paramterLongName,
            description: parameterOption.description,
            argumentName: 'VALUE'
          });
          getParameterValue = () => parameter.values;
          break;
        }

        default: {
          throw new Error(
            `Unrecognized parameter kind "${parameterOption.kind}" for parameter "${parameterOption.paramterLongName}`
          );
        }
      }

      this._parameterValues.set(parameterOption.callbackValueName, getParameterValue);
    }
  }

  protected async actionExecuteAsync(): Promise<void> {
    const parameterValues: {
      [callbackValueName: string]: CustomActionParameterType;
    } = {};

    for (const [callbackName, getParameterValue] of this._parameterValues.entries()) {
      parameterValues[callbackName] = getParameterValue();
    }

    await this._customActionOptions.callback(parameterValues);
  }
}
