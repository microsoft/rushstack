// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createSlice, type PayloadAction, type Reducer } from '@reduxjs/toolkit';

import { type LfxGraphEntry, LfxGraphEntryKind } from '../../packlets/lfx-shared';
import type { RootState } from '../index';
import {
  getBookmarksFromStorage,
  removeBookmarkFromLocalStorage,
  saveBookmarkToLocalStorage
} from '../../helpers/localStorage';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EntryState = {
  allEntries: LfxGraphEntry[];
  filters: {
    [key in LfxGraphEntryKind]: boolean;
  };
  selectedEntryStack: LfxGraphEntry[];
  selectedEntryForwardStack: LfxGraphEntry[];
  bookmarkedEntries: LfxGraphEntry[];
};

const initialState: EntryState = {
  allEntries: [],
  filters: {
    [LfxGraphEntryKind.Project]: false,
    [LfxGraphEntryKind.Package]: true,
    [LfxGraphEntryKind.SideBySide]: false,
    [LfxGraphEntryKind.Doppelganger]: false
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
    loadEntries: (state, payload: PayloadAction<LfxGraphEntry[]>) => {
      state.allEntries = payload.payload;
      // Hydrate the bookmarks state
      const bookmarkSet = getBookmarksFromStorage();
      for (const entry of payload.payload) {
        if (bookmarkSet.has(entry.rawEntryId)) {
          state.bookmarkedEntries.push(entry);
        }
      }
    },
    setFilter: (state, payload: PayloadAction<{ filter: LfxGraphEntryKind; state: boolean }>) => {
      state.filters[payload.payload.filter] = payload.payload.state;
    },
    clearStackAndPush: (state, payload: PayloadAction<LfxGraphEntry>) => {
      state.selectedEntryStack = [payload.payload];
      state.selectedEntryForwardStack = [];
    },
    pushToStack: (state, payload: PayloadAction<LfxGraphEntry>) => {
      state.selectedEntryStack.push(payload.payload);
      state.selectedEntryForwardStack = [];
      if (payload.payload.kind === LfxGraphEntryKind.Package) {
        state.filters[LfxGraphEntryKind.Project] = false;
        state.filters[LfxGraphEntryKind.Package] = true;
      } else {
        state.filters[LfxGraphEntryKind.Project] = true;
        state.filters[LfxGraphEntryKind.Package] = false;
      }
    },
    popStack: (state) => {
      if (state.selectedEntryStack.length > 1) {
        const poppedEntry = state.selectedEntryStack.pop() as LfxGraphEntry;
        state.selectedEntryForwardStack.push(poppedEntry);

        if (state.selectedEntryStack.length >= 1) {
          const currEntry = state.selectedEntryStack[state.selectedEntryStack.length - 1];
          if (currEntry.kind === LfxGraphEntryKind.Package) {
            state.filters[LfxGraphEntryKind.Project] = false;
            state.filters[LfxGraphEntryKind.Package] = true;
          } else {
            state.filters[LfxGraphEntryKind.Project] = true;
            state.filters[LfxGraphEntryKind.Package] = false;
          }
        }
      }
    },
    forwardStack: (state) => {
      if (state.selectedEntryForwardStack.length > 0) {
        const poppedEntry = state.selectedEntryForwardStack.pop() as LfxGraphEntry;
        state.selectedEntryStack.push(poppedEntry);
        if (poppedEntry.kind === LfxGraphEntryKind.Package) {
          state.filters[LfxGraphEntryKind.Project] = false;
          state.filters[LfxGraphEntryKind.Package] = true;
        } else {
          state.filters[LfxGraphEntryKind.Project] = true;
          state.filters[LfxGraphEntryKind.Package] = false;
        }
      }
    },
    addBookmark: (state, payload: PayloadAction<LfxGraphEntry>) => {
      if (!state.bookmarkedEntries.includes(payload.payload)) {
        state.bookmarkedEntries.push(payload.payload);
        saveBookmarkToLocalStorage(payload.payload);
      }
    },
    removeBookmark: (state, payload: PayloadAction<LfxGraphEntry>) => {
      state.bookmarkedEntries = state.bookmarkedEntries.filter(
        (entry: LfxGraphEntry) => entry.rawEntryId !== payload.payload.rawEntryId
      );
      removeBookmarkFromLocalStorage(payload.payload);
    }
  }
});

export const selectCurrentEntry = (state: RootState): LfxGraphEntry | undefined => {
  if (state.entry.selectedEntryStack.length) {
    return state.entry.selectedEntryStack[state.entry.selectedEntryStack.length - 1];
  } else {
    return undefined;
  }
};

export const selectFilteredEntries = (state: RootState): LfxGraphEntry[] => {
  const filteredEntries: LfxGraphEntry[] = [];
  if (state.entry.filters[LfxGraphEntryKind.Package]) {
    filteredEntries.push(
      ...state.entry.allEntries.filter((entry) => entry.kind === LfxGraphEntryKind.Package)
    );
  } else if (state.entry.filters[LfxGraphEntryKind.Project]) {
    filteredEntries.push(
      ...state.entry.allEntries.filter((entry) => entry.kind === LfxGraphEntryKind.Project)
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
