// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Converts a git-protocol URL into a browseable HTTPS URL, using the native URL class.
 *
 * Handles the common formats found in npm package metadata:
 *   git@github.com:user/repo.git  ->  https://github.com/user/repo
 *   git://github.com/user/repo    ->  https://github.com/user/repo
 *   git+https://github.com/...    ->  https://github.com/...
 *
 * Returns the original string unchanged if it cannot be parsed.
 */
export function toHttpsUrl(sourceUrl: string): string {
  if (!sourceUrl) {
    return '';
  }

  let url: string = sourceUrl;

  // Convert SCP-like syntax (git@host:path) to a standard URL
  url = url.replace(/^[^@]*@([^:]+):(.+)$/, 'https://$1/$2');

  // Strip the "git+" compound prefix and normalize git:// to https://
  url = url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://');

  try {
    const parsed: URL = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\.git$/i, '');
    return parsed.toString();
  } catch {
    return sourceUrl;
  }
}
