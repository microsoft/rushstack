// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import React from 'react';
import styles from './styles.scss';

interface IFilterBarOption {
  text: string;
  active: boolean;
  onClick: () => void;
}

export const FilterBar = ({ options }: { options: IFilterBarOption[] }): JSX.Element => {
  return (
    <div className={styles.FilterBar}>
      {options.map((opt: IFilterBarOption) => (
        <div
          key={opt.text}
          className={`${styles.FilterItem} ${opt.active ? styles.FilterItemActive : ''}`}
          onClick={opt.onClick}
        >
          {opt.text}
        </div>
      ))}
    </div>
  );
};
