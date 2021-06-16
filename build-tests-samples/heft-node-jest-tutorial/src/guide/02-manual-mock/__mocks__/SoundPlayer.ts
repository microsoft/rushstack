// Import this named export into your test file:
export const mockPlaySoundFile = jest.fn();

const SoundPlayer = jest.fn().mockImplementation(() => {
  return { playSoundFile: mockPlaySoundFile };
});

export { SoundPlayer };
