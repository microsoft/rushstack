// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';

import { Text } from '../Text';
import styles from './styles.scss';

/**
 * React props for {@link Button}
 * @public
 */
export interface IButtonProps {
  children: JSX.Element | string;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * A button UI component
 * @public
 */
export const Button = ({ children, disabled = false, onClick }: IButtonProps): JSX.Element => {
  return (
    <button disabled={disabled} className={styles.ButtonWrapper} onClick={onClick}>
      <Text type="span" size={14}>
        {children}
      </Text>
    </button>
  );
};
