import React from 'react';
import styles from './styles.scss';

type ButtonProps = {
  children: JSX.Element | string;
  disabled?: boolean;
  onClick: () => void;
};

export const Button = ({ children, disabled = false, onClick }: ButtonProps) => {
  return (
    <button disabled={disabled} className={styles.ButtonWrapper} onClick={onClick}>
      {children}
    </button>
  );
};
