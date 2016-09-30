declare module NodeJS {
  interface Global {
    dontWatchExit: boolean;
  }
}