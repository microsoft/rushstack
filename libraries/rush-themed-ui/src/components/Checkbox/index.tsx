// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { CheckIcon } from '@radix-ui/react-icons';

import styles from './styles.scss';

/**
 * React props for {@link Checkbox}
 * @public
 */
export interface ICheckboxProps {
  label: string;
  isChecked: boolean;
  onChecked: (checked: boolean) => void;
}

/**
 * A checkbox UI component
 * @public
 */
export const Checkbox = ({ label, isChecked, onChecked }: ICheckboxProps): JSX.Element => (
  <form>
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <RadixCheckbox.Root
        className={styles.CheckboxRoot}
        defaultChecked
        checked={isChecked}
        onCheckedChange={onChecked}
        id={label}
      >
        <RadixCheckbox.Indicator className={styles.CheckboxIndicator}>
          <CheckIcon />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <label className={styles.Label} htmlFor={label}>
        {label}
      </label>
    </div>
  </form>
);
