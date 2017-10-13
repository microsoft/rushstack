enum ClearStyleOptions {
  // (undocumented)
  all = 3,
  // (undocumented)
  onlyNonThemable = 2,
  // (undocumented)
  onlyThemable = 1
}

export function clearStyles(option: ClearStyleOptions = ClearStyleOptions.all): void;

export function configureLoadStyles(loadStylesFn: ((processedStyles: string, rawStyles?: string | ThemableArray) => void) | undefined): void;

export function configureRunMode(mode: Mode): void;

export function detokenize(styles: string | undefined): string | undefined;

export function flush(): void;

// (undocumented)
interface ITheme {
  // (undocumented)
  [ key: string ]: string;
}

// (undocumented)
interface IThemingInstruction {
  // (undocumented)
  defaultValue?: string;
  // (undocumented)
  rawString?: string;
  // (undocumented)
  theme?: string;
}

export function loadStyles(styles: string | ThemableArray, loadAsync: boolean = false): void;

export function loadTheme(theme: ITheme | undefined): void;

enum Mode {
  // (undocumented)
  async,
  // (undocumented)
  sync
}

export function splitStyles(styles: string): ThemableArray;

// WARNING: Unsupported export: ThemableArray
// (No packageDescription for this package)
