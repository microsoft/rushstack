// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ICustomParameterBase<CustomParameterType> {
  kind: 'flag' | 'integer' | 'string' | 'stringList'; // TODO: Add "choice"

  parameterLongName: string;
  description: string;
}

/** @beta */
export interface ICustomParameterFlag extends ICustomParameterBase<boolean> {
  kind: 'flag';
}

/** @beta */
export interface ICustomParameterInteger extends ICustomParameterBase<number> {
  kind: 'integer';
}

/** @beta */
export interface ICustomParameterString extends ICustomParameterBase<string> {
  kind: 'string';
}

/** @beta */
export interface ICustomParameterStringList extends ICustomParameterBase<ReadonlyArray<string>> {
  kind: 'stringList';
}

/** @beta */
export type CustomParameterType = string | boolean | number | ReadonlyArray<string> | undefined;

/** @beta */
export type ICustomParameter<TParameter> = TParameter extends boolean
  ? ICustomParameterFlag
  : TParameter extends number
  ? ICustomParameterInteger
  : TParameter extends string
  ? ICustomParameterString
  : TParameter extends ReadonlyArray<string>
  ? ICustomParameterStringList
  : never;

/** @beta */
export interface ICustomParameterOptions<TParameters> {
  actionName: string;
  parameters: { [K in keyof TParameters]: ICustomParameter<TParameters[K]> };
  callback: (parameters: Record<string, CustomParameterType>) => void | Promise<void>;
}
