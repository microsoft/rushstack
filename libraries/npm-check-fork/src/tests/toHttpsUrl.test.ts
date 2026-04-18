// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { toHttpsUrl } from '../toHttpsUrl';

describe(toHttpsUrl.name, () => {
  it('returns empty string for empty input', () => {
    expect(toHttpsUrl('')).toBe('');
  });

  it('passes through an already-valid https URL unchanged', () => {
    expect(toHttpsUrl('https://github.com/user/repo')).toBe('https://github.com/user/repo');
  });

  it('strips .git suffix from an https URL', () => {
    expect(toHttpsUrl('https://github.com/user/repo.git')).toBe('https://github.com/user/repo');
  });

  it('converts SCP-style git@ URL to https', () => {
    expect(toHttpsUrl('git@github.com:user/repo.git')).toBe('https://github.com/user/repo');
  });

  it('converts git:// URL to https', () => {
    expect(toHttpsUrl('git://github.com/user/repo.git')).toBe('https://github.com/user/repo');
  });

  it('converts git+https:// URL to https', () => {
    expect(toHttpsUrl('git+https://github.com/user/repo.git')).toBe('https://github.com/user/repo');
  });

  it('converts git+http:// URL to http', () => {
    expect(toHttpsUrl('git+http://example.com/user/repo.git')).toBe('http://example.com/user/repo');
  });

  it('returns the original string for an unparseable input', () => {
    expect(toHttpsUrl('not-a-url-at-all')).toBe('not-a-url-at-all');
  });
});
