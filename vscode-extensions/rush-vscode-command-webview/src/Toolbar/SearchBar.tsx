// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SearchBox } from '@fluentui/react';
import * as React from 'react';
import type { AnyAction, Dispatch } from '@reduxjs/toolkit';

import { useAppDispatch, useAppSelector } from '../store/hooks';
import { onChangeSearchText } from '../store/slices/parameter';

export const SearchBar = (): React.ReactElement => {
  const searchText: string = useAppSelector((state) => state.parameter.searchText);
  const dispatch: Dispatch<AnyAction> = useAppDispatch();
  return (
    <SearchBox
      placeholder="Search Parameter"
      value={searchText}
      onChange={(e, newValue) => {
        dispatch(onChangeSearchText(newValue));
      }}
    />
  );
};
