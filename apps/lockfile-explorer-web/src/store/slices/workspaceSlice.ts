// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createSlice, type PayloadAction, type Reducer } from '@reduxjs/toolkit';

import type { ISpecChange } from '../../parsing/compareSpec';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WorkspaceState = {
  specChanges: Map<string, ISpecChange>;
};

const initialState: WorkspaceState = {
  specChanges: new Map()
};

/* eslint @rushstack/typedef-var: off */
const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    loadSpecChanges: (state, payload: PayloadAction<Map<string, ISpecChange>>) => {
      state.specChanges = payload.payload;
    }
  }
});

export const { loadSpecChanges } = workspaceSlice.actions;

export const workspaceReducer: Reducer<WorkspaceState> = workspaceSlice.reducer;
