// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { LockfileEntry } from '../parsing/LockfileEntry';

const BOOKMARK_KEY: string = 'LOCKFILE_EXPLORER_BOOKMARKS';

export const getBookmarksFromStorage = (): Set<string> => {
  const currBookmarks = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '{}');
  const bookmarkSet = new Set<string>();
  for (const key of Object.keys(currBookmarks)) {
    bookmarkSet.add(key);
  }
  return bookmarkSet;
};

export const saveBookmarkToLocalStorage = (entry: LockfileEntry): void => {
  const key = entry.rawEntryId;
  const currBookmarks = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '{}');
  currBookmarks[key] = true;
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(currBookmarks));
};

export const removeBookmarkFromLocalStorage = (entry: LockfileEntry): void => {
  const key = entry.rawEntryId;
  const currBookmarks = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '{}');
  delete currBookmarks[key];
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(currBookmarks));
};

const FILTER_KEY: string = 'LOCKFILE_EXPLORER_FILTER';
export const saveFilterToLocalStorage = (filter: string): void => {
  localStorage.setItem(FILTER_KEY, filter);
};

export const getFilterFromLocalStorage = (): string => {
  return localStorage.getItem(FILTER_KEY) || '';
};
