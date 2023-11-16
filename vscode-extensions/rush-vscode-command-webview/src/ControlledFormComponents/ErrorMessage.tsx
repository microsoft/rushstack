// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';

export interface IErrorMessageProps {
  message?: string;
}

export const ErrorMessage = ({ message }: IErrorMessageProps): JSX.Element => {
  // eslint-disable-next-line no-console
  console.log('ErrorMessage...', message);
  return message ? (
    <div role={'alert'}>
      <p className="ms-TextField-errorMessage">{String(message)}</p>
    </div>
  ) : (
    <div />
  );
};
