import * as React from 'react';

export interface IErrorMessageProps {
  message?: string;
}

export const ErrorMessage = ({ message }: IErrorMessageProps): JSX.Element => {
  console.log('ErrorMessage...', message);
  return message ? (
    <div role={'alert'}>
      <p className="ms-TextField-errorMessage">{String(message)}</p>
    </div>
  ) : (
    <div />
  );
};
