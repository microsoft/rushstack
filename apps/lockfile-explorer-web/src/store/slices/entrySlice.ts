import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { LockfileEntry, LockfileEntryKind } from '../../parsing/LockfileEntry';
import { RootState } from '../index';

type EntryState = {
  projectEntries: LockfileEntry[];
  packageEntries: LockfileEntry[];
  selection: LockfileEntryKind;
  selectedEntryStack: LockfileEntry[];
};

const initialState: EntryState = {
  projectEntries: [],
  packageEntries: [],
  selection: LockfileEntryKind.Project,
  selectedEntryStack: []
};

const entrySlice = createSlice({
  name: 'entry',
  initialState,
  reducers: {
    loadEntries: (state, payload: PayloadAction<LockfileEntry[]>) => {
      state.projectEntries = payload.payload.filter((l) => l.kind === LockfileEntryKind.Project);
      state.packageEntries = payload.payload.filter((l) => l.kind === LockfileEntryKind.Package);
    },
    setSelection: (state, payload: PayloadAction<LockfileEntryKind>) => {
      state.selection = payload.payload;
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

export const { loadEntries, setSelection, clearStackAndPush, pushToStack, popStack } = entrySlice.actions;

export const entryReducer = entrySlice.reducer;
