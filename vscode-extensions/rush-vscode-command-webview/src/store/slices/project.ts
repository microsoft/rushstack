import { PayloadAction, Slice, SliceCaseReducers, createSlice } from '@reduxjs/toolkit';

export interface IProjectState {
  projectName: string;
}

const initialState: IProjectState = {
  projectName: ''
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
      state.projectName = action.payload;
    }
  }
});

export const { initializeProjectInfo, onChangeProject } = projectSlide.actions;

export default projectSlide.reducer;
