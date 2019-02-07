declare namespace jest {
  /**
   * Associate `requireActual` with the `jest` namespace so we can simply write `jest.requireActual`
   * without any typecasts.
   */
  function requireActual(moduleName: string): any;
}