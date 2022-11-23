import { configureStore } from '@reduxjs/toolkit';
import type { EnhancedStore } from '@reduxjs/toolkit';
import parameterReducer, { IParameterState } from './slices/parameter';
import uiReducer, { IUIState } from './slices/ui';

export interface IRootState {
  parameter: IParameterState;
  ui: IUIState;
}

export const store: EnhancedStore<IRootState> = configureStore({
  preloadedState: window.__DATA__,
  reducer: {
    parameter: parameterReducer,
    ui: uiReducer
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
  console.log('store changes', store.getState());
});

export type AppDispatch = typeof store.dispatch;
