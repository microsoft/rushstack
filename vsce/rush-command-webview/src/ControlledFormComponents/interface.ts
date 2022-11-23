/* eslint-disable @typescript-eslint/no-explicit-any */
import { Control, RegisterOptions, UseFormSetValue, FieldValues } from 'react-hook-form';

export interface IHookFormProps<V extends any = any, FV extends FieldValues = FieldValues> {
  control: Control<FV>;
  name: string;
  rules?: RegisterOptions;
  defaultValue?: V;
  setValue?: UseFormSetValue<FV>;
}
