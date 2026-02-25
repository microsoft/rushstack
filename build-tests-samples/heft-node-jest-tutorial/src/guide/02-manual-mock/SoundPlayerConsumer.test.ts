// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This example is adapted from the Jest guide here:
// https://jestjs.io/docs/en/es6-class-mocks#manual-mock

jest.mock('./SoundPlayer'); // SoundPlayer is now a mock constructor

import { SoundPlayer } from './SoundPlayer.ts';
import { mockPlaySoundFile } from './__mocks__/SoundPlayer.ts';
import { SoundPlayerConsumer } from './SoundPlayerConsumer.ts';

beforeEach(() => {
  // Clear all instances and calls to constructor and all methods:
  mocked(SoundPlayer).mockClear();
  mockPlaySoundFile.mockClear();
});

it('We can check if the consumer called the class constructor', () => {
  new SoundPlayerConsumer();
  expect(SoundPlayer).toHaveBeenCalledTimes(1);
});

it('We can check if the consumer called a method on the class instance', () => {
  const soundPlayerConsumer: SoundPlayerConsumer = new SoundPlayerConsumer();
  const coolSoundFileName: string = 'song.mp3';
  soundPlayerConsumer.playSomethingCool();
  expect(mockPlaySoundFile).toHaveBeenCalledWith(coolSoundFileName);
});

// The test below validates that jest-improved-resolver.js is working correctly
import { SoundPlayer as MockSoundPlayer } from './__mocks__/SoundPlayer.ts';

it('Importing ./__mocks__/SoundPlayer returns the same object as importing ./SoundPlayer', () => {
  expect(SoundPlayer).toBe(MockSoundPlayer);
});
