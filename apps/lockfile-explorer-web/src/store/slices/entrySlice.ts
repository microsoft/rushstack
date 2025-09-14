// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createSlice, type PayloadAction, type Reducer } from '@reduxjs/toolkit';
import { type LockfileEntry, LockfileEntryFilter } from '../../packlets/lfx-shared';
import type { RootState } from '../index';
import {
  getBookmarksFromStorage,
  removeBookmarkFromLocalStorage,
  saveBookmarkToLocalStorage
} from '../../helpers/localStorage';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EntryState = {
  allEntries: LockfileEntry[];
  filters: {
    [key in LockfileEntryFilter]: boolean;
  };
  selectedEntryStack: LockfileEntry[];
  selectedEntryForwardStack: LockfileEntry[];
  bookmarkedEntries: LockfileEntry[];
};

const initialState: EntryState = {
  allEntries: [],
  filters: {
    [LockfileEntryFilter.Project]: false,
    [LockfileEntryFilter.Package]: true,
    [LockfileEntryFilter.SideBySide]: false,
    [LockfileEntryFilter.Doppelganger]: false
  },
  selectedEntryStack: [],
  selectedEntryForwardStack: [],
  bookmarkedEntries: []
};

/* eslint @rushstack/typedef-var: off */
const entrySlice = createSlice({
  name: 'entry',
  initialState,
  reducers: {
    loadEntries: (state, payload: PayloadAction<LockfileEntry[]>) => {
      state.allEntries = payload.payload;
      // Hydrate the bookmarks state
      const bookmarkSet = getBookmarksFromStorage();
      for (const entry of payload.payload) {
        if (bookmarkSet.has(entry.rawEntryId)) {
          state.bookmarkedEntries.push(entry);
        }
      }
    },
    setFilter: (state, payload: PayloadAction<{ filter: LockfileEntryFilter; state: boolean }>) => {
      state.filters[payload.payload.filter] = payload.payload.state;
    },
    clearStackAndPush: (state, payload: PayloadAction<LockfileEntry>) => {
      state.selectedEntryStack = [payload.payload];
      state.selectedEntryForwardStack = [];
    },
    pushToStack: (state, payload: PayloadAction<LockfileEntry>) => {
      state.selectedEntryStack.push(payload.payload);
      state.selectedEntryForwardStack = [];
      if (payload.payload.kind === LockfileEntryFilter.Package) {
        state.filters[LockfileEntryFilter.Project] = false;
        state.filters[LockfileEntryFilter.Package] = true;
      } else {
        state.filters[LockfileEntryFilter.Project] = true;
        state.filters[LockfileEntryFilter.Package] = false;
      }
    },
    popStack: (state) => {
      if (state.selectedEntryStack.length > 1) {
        const poppedEntry = state.selectedEntryStack.pop() as LockfileEntry;
        state.selectedEntryForwardStack.push(poppedEntry);

        if (state.selectedEntryStack.length >= 1) {
          const currEntry = state.selectedEntryStack[state.selectedEntryStack.length - 1];
          if (currEntry.kind === LockfileEntryFilter.Package) {
            state.filters[LockfileEntryFilter.Project] = false;
            state.filters[LockfileEntryFilter.Package] = true;
          } else {
            state.filters[LockfileEntryFilter.Project] = true;
            state.filters[LockfileEntryFilter.Package] = false;
          }
        }
      }
    },
    forwardStack: (state) => {
      if (state.selectedEntryForwardStack.length > 0) {
        const poppedEntry = state.selectedEntryForwardStack.pop() as LockfileEntry;
        state.selectedEntryStack.push(poppedEntry);
        if (poppedEntry.kind === LockfileEntryFilter.Package) {
          state.filters[LockfileEntryFilter.Project] = false;
          state.filters[LockfileEntryFilter.Package] = true;
        } else {
          state.filters[LockfileEntryFilter.Project] = true;
          state.filters[LockfileEntryFilter.Package] = false;
        }
      }
    },
    addBookmark: (state, payload: PayloadAction<LockfileEntry>) => {
      if (!state.bookmarkedEntries.includes(payload.payload)) {
        state.bookmarkedEntries.push(payload.payload);
        saveBookmarkToLocalStorage(payload.payload);
      }
    },
    removeBookmark: (state, payload: PayloadAction<LockfileEntry>) => {
      state.bookmarkedEntries = state.bookmarkedEntries.filter(
        (entry: LockfileEntry) => entry.rawEntryId !== payload.payload.rawEntryId
      );
      removeBookmarkFromLocalStorage(payload.payload);
    }
  }
});

export const selectCurrentEntry = (state: RootState): LockfileEntry | undefined => {
  if (state.entry.selectedEntryStack.length) {
    return state.entry.selectedEntryStack[state.entry.selectedEntryStack.length - 1];
  } else {
    return undefined;
  }
};

export const selectFilteredEntries = (state: RootState): LockfileEntry[] => {
  const filteredEntries: LockfileEntry[] = [];
  if (state.entry.filters[LockfileEntryFilter.Package]) {
    filteredEntries.push(
      ...state.entry.allEntries.filter((entry) => entry.kind === LockfileEntryFilter.Package)
    );
  } else if (state.entry.filters[LockfileEntryFilter.Project]) {
    filteredEntries.push(
      ...state.entry.allEntries.filter((entry) => entry.kind === LockfileEntryFilter.Project)
    );
  }
  return filteredEntries;
};

export const {
  loadEntries,
  setFilter,
  clearStackAndPush,
  pushToStack,
  popStack,
  forwardStack,
  addBookmark,
  removeBookmark
} = entrySlice.actions;

export const entryReducer: Reducer<EntryState> = entrySlice.reducer;
