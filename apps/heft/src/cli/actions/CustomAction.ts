// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  CommandLineStringListParameter
} from '@rushstack/ts-command-line';

import { HeftActionBase, IHeftActionBaseOptions } from './HeftActionBase';

/** @beta */
export interface ICustomActionParameterFlag extends ICustomActionParameterBase<boolean> {
  kind: 'flag';
}

/** @beta */
export interface ICustomActionParameterInteger extends ICustomActionParameterBase<number> {
  kind: 'integer';
}

/** @beta */
export interface ICustomActionParameterString extends ICustomActionParameterBase<string> {
  kind: 'string';
}

/** @beta */
export interface ICustomActionParameterStringList extends ICustomActionParameterBase<ReadonlyArray<string>> {
  kind: 'stringList';
}

/** @beta */
export interface ICustomActionParameterBase<TParameter extends CustomActionParameterType> {
  kind: 'flag' | 'integer' | 'string' | 'stringList'; // TODO: Add "choice"

  paramterLongName: string;
  description: string;
}

/** @beta */
export type ICustomActionParameter<TParameter> = TParameter extends boolean
  ? ICustomActionParameterFlag
  : TParameter extends number
  ? ICustomActionParameterInteger
  : TParameter extends string
  ? ICustomActionParameterString
  : TParameter extends ReadonlyArray<string>
  ? ICustomActionParameterStringList
  : never;

/** @beta */
export type CustomActionParameterType = string | boolean | number | ReadonlyArray<string> | undefined;

/** @beta */
export interface ICustomActionOptions<TParameters> {
  actionName: string;
  documentation: string;
  summary?: string;

  parameters?: { [K in keyof TParameters]: ICustomActionParameter<TParameters[K]> };

  callback: (parameters: TParameters) => void | Promise<void>;
}

export class CustomAction<TParameters> extends HeftActionBase {
  private _customActionOptions: ICustomActionOptions<TParameters>;
  private _parameterValues: Map<string, () => CustomActionParameterType>;

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

    this._parameterValues = new Map<string, () => CustomActionParameterType>();
    for (const [callbackValueName, untypedParameterOption] of Object.entries(
      this._customActionOptions.parameters || {}
    )) {
      if (this._parameterValues.has(callbackValueName)) {
        throw new Error(`Duplicate callbackValueName: ${callbackValueName}`);
      }

      let getParameterValue: () => CustomActionParameterType;

      const parameterOption: ICustomActionParameterBase<CustomActionParameterType> = untypedParameterOption as ICustomActionParameterBase<
        CustomActionParameterType
      >;
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

      this._parameterValues.set(callbackValueName, getParameterValue);
    }
  }

  protected async actionExecuteAsync(): Promise<void> {
    const parameterValues: {} = {};

    for (const [callbackName, getParameterValue] of this._parameterValues.entries()) {
      parameterValues[callbackName] = getParameterValue();
    }

    await this._customActionOptions.callback(parameterValues as TParameters);
  }
}
