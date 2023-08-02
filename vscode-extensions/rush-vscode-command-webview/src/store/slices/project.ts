// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PayloadAction, Slice, SliceCaseReducers, createSlice } from '@reduxjs/toolkit';

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
      console.log('action payload: ', action.payload);
      Object.assign(state, action.payload);
    },
    onChangeProject: (state, action: PayloadAction<string>) => {
      console.log('action payload: ', action.payload);
      Object.assign(state, action.payload);
    }
  }
});

export const { initializeProjectInfo, onChangeProject } = projectSlide.actions;

export default projectSlide.reducer;
