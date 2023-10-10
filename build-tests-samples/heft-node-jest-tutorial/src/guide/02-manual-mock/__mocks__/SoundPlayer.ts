// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Import this named export into your test file:
export const mockPlaySoundFile = jest.fn();

const SoundPlayer = jest.fn().mockImplementation(() => {
  return { playSoundFile: mockPlaySoundFile };
});

export { SoundPlayer };
