import React from 'react';
import styles from './styles.scss';

export interface IInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}

export const Input = ({ value, placeholder, onChange, type = 'text' }: IInputProps): JSX.Element => {
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
