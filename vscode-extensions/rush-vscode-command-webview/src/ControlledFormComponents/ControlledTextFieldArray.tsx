// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IStackTokens, type ITextFieldProps, Stack, TextField } from '@fluentui/react';
import * as React from 'react';
import { Controller, useFieldArray, useFormContext } from 'react-hook-form';

import { IconButton } from '../components/IconButton.tsx';
import type { IHookFormProps } from './interface.ts';

export type IControlledTextFieldArrayProps = ITextFieldProps & IHookFormProps<string>;

const textFieldStyles: ITextFieldProps['styles'] = {
  root: {
    width: '100%'
  }
};

const stackTokens: IStackTokens = {
  childrenGap: 6
};

export const ControlledTextFieldArray = (props: IControlledTextFieldArrayProps): React.ReactElement => {
  const { name, control, rules, defaultValue } = props;
  const { fields, remove, append } = useFieldArray({
    name,
    control
  });
  const { getValues } = useFormContext();
  const arrayValues: { value: string | number }[] = getValues(name);
  return (
    <div>
      <Stack tokens={stackTokens}>
        {fields.map((field, index) => {
          return (
            <div key={field.id}>
              <Stack horizontal>
                <Controller
                  name={`${name}.${index}.value`}
                  control={control}
                  rules={rules}
                  defaultValue={defaultValue}
                  render={({
                    field: { onChange, value, onBlur, name: fieldName },
                    fieldState: { error }
                  }) => {
                    return (
                      <TextField
                        styles={textFieldStyles}
                        {...props}
                        onChange={(e, v) => {
                          // eslint-disable-next-line no-console
                          console.log('-------newValue', `${name}.${index}.value`, v);
                          onChange(v);
                        }}
                        value={value}
                        onBlur={onBlur}
                        name={fieldName}
                        errorMessage={error && error.message}
                      />
                    );
                  }}
                />
                {arrayValues.length > 1 ? (
                  <IconButton
                    iconProps={{
                      iconName: 'Delete'
                    }}
                    title="delete"
                    ariaLabel="delete"
                    onClick={() => remove(index)}
                  />
                ) : null}
              </Stack>
            </div>
          );
        })}
        <IconButton
          iconProps={{
            iconName: 'Add'
          }}
          title="Add"
          ariaLabel="Add"
          onClick={() => {
            append({
              value: ''
            });
          }}
        />
      </Stack>
    </div>
  );
};
