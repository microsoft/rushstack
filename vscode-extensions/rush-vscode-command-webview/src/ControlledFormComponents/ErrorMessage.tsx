// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import type { FieldErrors } from 'react-hook-form';

export interface IErrorMessageProps {
  message?: FieldErrors[string] | string;
}

export const ErrorMessage = ({ message }: IErrorMessageProps): React.ReactElement => {
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
