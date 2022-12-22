import React from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { CheckIcon } from '@radix-ui/react-icons';
import styles from './styles.scss';

export const Checkbox = ({
  label,
  isChecked,
  onChecked
}: {
  label: string;
  isChecked: boolean;
  onChecked: (checked: boolean) => void;
}) => (
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
      <label className={styles.Label} htmlFor="c1">
        {label}
      </label>
    </div>
  </form>
);
