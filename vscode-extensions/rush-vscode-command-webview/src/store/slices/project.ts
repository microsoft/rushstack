// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type PayloadAction, type Slice, type SliceCaseReducers, createSlice } from '@reduxjs/toolkit';

export interface IProjectState {
  projectName: string;
  projectVersion: string;
  dependencies?: { [key in string]: string };
  devDependencies?: { [key in string]: string };
}

const initialState: IProjectState = {
  projectName: '',
  projectVersion: ''
};

export const projectSlide: Slice<IProjectState, SliceCaseReducers<IProjectState>, string> = createSlice({
  name: 'project',
  initialState,
  reducers: {
    initializeProjectInfo: (state, action: PayloadAction<IProjectState>) => {
      // eslint-disable-next-line no-console
      console.log('action payload: ', action.payload);
      Object.assign(state, action.payload);
    },
    onChangeProject: (state, action: PayloadAction<string>) => {
      // eslint-disable-next-line no-console
      console.log('action payload: ', action.payload);
      Object.assign(state, action.payload);
    }
  }
});

export const { initializeProjectInfo, onChangeProject } = projectSlide.actions;

export default projectSlide.reducer;
