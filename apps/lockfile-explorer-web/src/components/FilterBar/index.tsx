import React from 'react';
import styles from './styles.scss';

interface IFilterBarOption {
  text: string;
  active: boolean;
  onClick: () => void;
}

export const FilterBar = ({ options }: { options: IFilterBarOption[] }) => {
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
