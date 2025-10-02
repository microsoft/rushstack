declare module 'xtend' {
  function extend<T, U>(a: T, b: U): T & U;
  function extend<T, U, V>(a: T, b: U, c: V): T & U & V;
  function extend(...args: any[]): any;
  export = extend;
}
