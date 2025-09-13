// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type LockfileEntry, LockfileEntryFilter } from '../parsing/LfxGraph';

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

const PROJECT_FILTER_KEY: string = 'LOCKFILE_EXPLORER_PROJECT_FILTER';
const PACKAGE_FILTER_KEY: string = 'LOCKFILE_EXPLORER_PACKAGE_FILTER';
export const saveFilterToLocalStorage = (filter: string, type: LockfileEntryFilter): void => {
  if (type === LockfileEntryFilter.Project) {
    localStorage.setItem(PROJECT_FILTER_KEY, filter);
  } else {
    localStorage.setItem(PACKAGE_FILTER_KEY, filter);
  }
};

export const getFilterFromLocalStorage = (type: LockfileEntryFilter): string => {
  if (type === LockfileEntryFilter.Project) {
    return localStorage.getItem(PROJECT_FILTER_KEY) || '';
  } else {
    return localStorage.getItem(PACKAGE_FILTER_KEY) || '';
  }
};
