import { createSlice, PayloadAction, Reducer } from '@reduxjs/toolkit';
import { LockfileEntry, LockfileEntryFilter } from '../../parsing/LockfileEntry';
import { RootState } from '../index';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EntryState = {
  allEntries: LockfileEntry[];
  filters: {
    [key in LockfileEntryFilter]: boolean;
  };
  selectedEntryStack: LockfileEntry[];
  bookmarkedEntries: LockfileEntry[];
};

const initialState: EntryState = {
  allEntries: [],
  filters: {
    [LockfileEntryFilter.Project]: true,
    [LockfileEntryFilter.Package]: true,
    [LockfileEntryFilter.SideBySide]: false,
    [LockfileEntryFilter.Doppelganger]: false
  },
  selectedEntryStack: [],
  bookmarkedEntries: []
};

/* eslint @rushstack/typedef-var: off */
const entrySlice = createSlice({
  name: 'entry',
  initialState,
  reducers: {
    loadEntries: (state, payload: PayloadAction<LockfileEntry[]>) => {
      state.allEntries = payload.payload;
    },
    setFilter: (state, payload: PayloadAction<{ filter: LockfileEntryFilter; state: boolean }>) => {
      state.filters[payload.payload.filter] = payload.payload.state;
    },
    clearStackAndPush: (state, payload: PayloadAction<LockfileEntry>) => {
      state.selectedEntryStack = [payload.payload];
    },
    pushToStack: (state, payload: PayloadAction<LockfileEntry>) => {
      state.selectedEntryStack.push(payload.payload);
    },
    popStack: (state) => {
      if (state.selectedEntryStack.length > 1) {
        state.selectedEntryStack.pop();
      }
    },
    addBookmark: (state, payload: PayloadAction<LockfileEntry>) => {
      if (!state.bookmarkedEntries.includes(payload.payload)) {
        state.bookmarkedEntries.push(payload.payload);
      }
    },
    removeBookmark: (state, payload: PayloadAction<LockfileEntry>) => {
      state.bookmarkedEntries = state.bookmarkedEntries.filter(
        (entry: LockfileEntry) => entry.rawEntryId !== payload.payload.rawEntryId
      );
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
  addBookmark,
  removeBookmark
} = entrySlice.actions;

export const entryReducer: Reducer<EntryState> = entrySlice.reducer;
