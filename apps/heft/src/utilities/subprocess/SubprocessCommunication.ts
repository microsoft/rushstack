// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export enum SupportedSerializableArgType {
  Undefined,
  Null,
  Primitive,
  Error
}

export interface ISerializedErrorValue {
  errorMessage: string;
  errorStack: string | undefined;
}

export interface ISubprocessApiCallArg {
  type: SupportedSerializableArgType;
}

export interface ISubprocessApiCallArgWithValue<TValue = string | number | boolean | object>
  extends ISubprocessApiCallArg {
  type: SupportedSerializableArgType;
  value: TValue;
}

export interface ISubprocessMessageBase {
  type: string;
}
