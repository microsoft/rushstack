// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ComboBox, type IComboBoxOption, type IComboBoxProps } from '@fluentui/react';
import * as React from 'react';
import { Controller, useFormState } from 'react-hook-form';

import { ErrorMessage } from './ErrorMessage';
import type { IHookFormProps } from './interface';

export type IControlledComboBoxProps = IComboBoxProps & IHookFormProps<string>;

export const ControlledComboBox = (props: IControlledComboBoxProps): React.ReactElement => {
  const { name, control, rules, defaultValue } = props;
  const { errors } = useFormState({
    name,
    control
  });
  return (
    <div>
      {<ErrorMessage message={props.multiSelect ? errors?.[name] : undefined} />}
      <Controller
        name={name}
        control={control}
        rules={rules}
        defaultValue={defaultValue}
        render={({ field: { onChange, value, onBlur, name: fieldName }, fieldState: { error } }) => {
          const onChangeComboBox: IComboBoxProps['onChange'] = (
            e: unknown,
            option: IComboBoxOption | undefined
          ) => {
            if (option) {
              onChange(option.key);
            }
          };
          return (
            <>
              <ComboBox
                {...props}
                onChange={onChangeComboBox}
                selectedKey={value}
                onBlur={onBlur}
                id={fieldName}
                errorMessage={error && error.message}
              />
            </>
          );
        }}
      />
    </div>
  );
};
