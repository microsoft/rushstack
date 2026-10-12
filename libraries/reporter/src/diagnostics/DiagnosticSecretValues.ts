// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export function createSecretValueMatcher(
  values: Iterable<{ readonly value: unknown; readonly privacy: string }>
): (text: string) => boolean {
  const secrets: string[] = [];
  for (const classified of values) {
    if (
      classified.privacy === 'secret' &&
      typeof classified.value === 'string' &&
      classified.value.length > 0
    ) {
      secrets.push(classified.value);
    }
  }
  return (text: string): boolean => secrets.some((secret: string) => text.includes(secret));
}
