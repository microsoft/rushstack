// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as React from 'react';
import { useEffect } from 'react';
import type { FieldValues, UseFormWatch } from 'react-hook-form';
import type { AnyAction, Dispatch } from '@reduxjs/toolkit';
import type { Subscription } from 'react-hook-form/dist/utils/createSubject';

import { useAppDispatch } from '../../store/hooks';
import { onChangeFormValues } from '../../store/slices/parameter';

export interface IParameterFormWatcherProps {
  watch: UseFormWatch<FieldValues>;
}

export const ParameterFormWatcher = ({ watch }: IParameterFormWatcherProps): React.ReactElement => {
  const dispatch: Dispatch<AnyAction> = useAppDispatch();

  useEffect((): (() => void) => {
    const subscription: Subscription = watch((values) => {
      // eslint-disable-next-line no-console
      console.log('watch', values);
      dispatch(onChangeFormValues(values));
    });
    return () => subscription.unsubscribe;
  }, [watch]);

  return <div />;
};
