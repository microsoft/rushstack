import React from 'react';
import styles from './styles.scss';

interface IButtonProps {
  children: JSX.Element | string;
  disabled?: boolean;
  onClick: () => void;
}

export const Button = ({ children, disabled = false, onClick }: IButtonProps): JSX.Element => {
  return (
    <button disabled={disabled} className={styles.ButtonWrapper} onClick={onClick}>
      {children}
    </button>
  );
};
