import React from 'react';
import styles from './styles.scss';

export const Input = ({
  value,
  placeholder,
  onChange,
  type = 'text'
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}): JSX.Element => {
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
