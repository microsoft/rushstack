// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';

import styles from './styles.scss';

/**
 * React props for {@link Input}
 * @public
 */
export interface IInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}

/**
 * A text input box UI component
 * @public
 */
export const Input = ({ value, placeholder, onChange, type = 'text' }: IInputProps): React.ReactElement => {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      className={styles.InputWrapper}
    />
  );
};
