// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { configureStore } from '@reduxjs/toolkit';
import type { EnhancedStore } from '@reduxjs/toolkit';

import parameterReducer, { type IParameterState } from './slices/parameter';
import uiReducer, { type IUIState } from './slices/ui';
import projectReducer, { type IProjectState } from './slices/project';

export interface IRootState {
  parameter: IParameterState;
  ui: IUIState;
  project: IProjectState;
}

export const store: EnhancedStore<IRootState> = configureStore({
  preloadedState: window.__DATA__,
  reducer: {
    parameter: parameterReducer,
    ui: uiReducer,
    project: projectReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['ui/setFormValidateAsync'],
        // Ignore these field paths in all actions
        // ignoredActionPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['ui.formValidateAsync']
      }
    })
});

store.subscribe(() => {
  // eslint-disable-next-line no-console
  console.log('store changes', store.getState());
});

export type AppDispatch = typeof store.dispatch;
