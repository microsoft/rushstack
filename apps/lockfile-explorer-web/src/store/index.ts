// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { configureStore } from '@reduxjs/toolkit';

import { entryReducer } from './slices/entrySlice.ts';
import { workspaceReducer } from './slices/workspaceSlice.ts';

/* eslint @rushstack/typedef-var: off */
export const store = configureStore({
  reducer: {
    entry: entryReducer,
    workspace: workspaceReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    })
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
