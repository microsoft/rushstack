// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Control, RegisterOptions, UseFormSetValue, FieldValues } from 'react-hook-form';

export interface IHookFormProps<V extends any = any, FV extends FieldValues = FieldValues> {
  control: Control<FV>;
  name: string;
  rules?: RegisterOptions;
  defaultValue?: V;
  setValue?: UseFormSetValue<FV>;
}
