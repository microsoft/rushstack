/**
 * An IThemingInstruction can specify a rawString to be preserved or a theme slot and a default value
 * to use if that slot is not specified by the theme.
 */

// Declaring a global here in case that the execution environment is Node.js (without importing the
// entire node.js d.ts for now)
declare var global: any; // tslint:disable-line:no-any

export interface IThemingInstruction {
  theme?: string;
  defaultValue?: string;
  rawString?: string;
}

export type ThemableArray = Array<IThemingInstruction>;

export interface ITheme {
  [key: string]: string;
}

interface IStyleSheet {
  cssText: string;
}

interface IExtendedHtmlStyleElement extends HTMLStyleElement {
  styleSheet: IStyleSheet;
}

/**
 * Performance Measurement of loading styles
 */
interface IMeasurement {
  /**
   * Count of style element injected, which is the slow operation in IE
   */
  count: number;
  /**
   * Total duration of all loadStyles exections
   */
  duration: number;
}

interface IRunState {
  mode: Mode;
  buffer: ThemableArray[];
  flushTimer: number;
}

interface IThemeState {
  theme: ITheme | undefined;
  lastStyleElement: IExtendedHtmlStyleElement;
  registeredStyles: IStyleRecord[];  // records of already registered non-themable styles
  registeredThemableStyles: IStyleRecord[];  // records of already registered themable styles
  loadStyles: ((processedStyles: string, rawStyles?: string | ThemableArray) => void) | undefined;
  perf: IMeasurement;
  runState: IRunState;
}

interface IStyleRecord {
  styleElement: Element;
  themableStyle: ThemableArray;
}

/**
 * object returned from resolveThemableArray function
 * @styleString:  this string is the processed styles in string
 * @themable:     this boolean indicates if this style array is themable
 */
interface IThemableArrayResolveResult {
  styleString: string;
  themable: boolean;
}

/**
 * In sync mode, styles are registered as style elements synchronously with loadStyles() call.
 * In async mode, styles are buffered and registered as batch in async timer for performance purpose.
 */
export const enum Mode {
  sync,
  async
}

/**
 * Themable styles and non-themable styles are tracked separately
 * Specify ClearStyleOptions when calling clearStyles API to specify which group of registered styles should be cleared.
 * @onlyThemable: only themable styles will be cleared
 * @onlyNonThemable: only non-themable styles will be cleared
 * @all: both themable and non-themable styles will be cleared
 */
export const enum ClearStyleOptions {
  onlyThemable = 1,
  onlyNonThemable = 2,
  all = 3
}

// IE needs to inject styles using cssText. However, we need to evaluate this lazily, so this
// value will initialize as undefined, and later will be set once on first loadStyles injection.
let _injectStylesWithCssText: boolean;

// Store the theming state in __themeState__ global scope for reuse in the case of duplicate
// load-themed-styles hosted on the page.
const _root: any = (typeof window === 'undefined') ? global : window; // tslint:disable-line:no-any

const _themeState: IThemeState = initializeThemeState();

/**
 * Matches theming tokens. For example, "[theme: themeSlotName, default: #FFF]" (including the quotes).
 */
// tslint:disable-next-line:max-line-length
const _themeTokenRegex: RegExp = /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g;

/** Maximum style text length, for supporting IE style restrictions. */
const MAX_STYLE_CONTENT_SIZE: number = 10000;

const now: () => number =
  () => (typeof performance !== 'undefined' && !!performance.now) ? performance.now() : Date.now();

function measure(func: () => void): void {
  const start: number = now();
  func();
  const end: number = now();
  _themeState.perf.duration += end - start;
}

/**
 * initialize global state object
 */
function initializeThemeState(): IThemeState {
  let state: IThemeState = _root.__themeState__ || {
    theme: undefined,
    lastStyleElement: undefined,
    registeredStyles: []
  };

  if (!state.runState) {
    state = {
      ...(state),
      perf: {
        count: 0,
        duration: 0
      },
      runState: {
        flushTimer: 0,
        mode: Mode.sync,
        buffer: []
      }
    };
  }
  if (!state.registeredThemableStyles) {
    state = {
      ...(state),
      registeredThemableStyles: []
    };
  }
  _root.__themeState__ = state;
  return state;
}

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load
 * event is fired.
 * @param {string | ThemableArray} styles Themable style text to register.
 * @param {boolean} loadAsync When true, always load styles in async mode, irrespective of current sync mode.
 */
export function loadStyles(styles: string | ThemableArray, loadAsync: boolean = false): void {
  if (typeof document === 'undefined') {
    return;
  }
  measure(() => {
    const styleParts: ThemableArray = Array.isArray(styles) ? styles : splitStyles(styles);
    if (_injectStylesWithCssText === undefined) {
      _injectStylesWithCssText = shouldUseCssText();
    }
    const {
      mode,
      buffer,
      flushTimer
    } = _themeState.runState;
    if (loadAsync || mode === Mode.async) {
      buffer.push(styleParts);
      if (!flushTimer) {
        _themeState.runState.flushTimer = asyncLoadStyles();
      }
    } else {
      applyThemableStyles(styleParts);
    }
  });
}

/**
 * Allows for customizable loadStyles logic. e.g. for server side rendering application
 * @param {(processedStyles: string, rawStyles?: string | ThemableArray) => void}
 * a loadStyles callback that gets called when styles are loaded or reloaded
 */
export function configureLoadStyles(
  loadStylesFn: ((processedStyles: string, rawStyles?: string | ThemableArray) => void) | undefined
): void {
  _themeState.loadStyles = loadStylesFn;
}

/**
 * Configure run mode of load-themable-styles
 * @param mode load-themable-styles run mode, async or sync
 */
export function configureRunMode(mode: Mode): void {
  _themeState.runState.mode = mode;
}

/**
 * external code can call flush to synchronously force processing of currently buffered styles
 */
export function flush(): void {
  measure(() => {
    const styleArrays: ThemableArray[] = _themeState.runState.buffer.slice();
    _themeState.runState.buffer = [];
    const mergedStyleArray: ThemableArray = [].concat.apply([], styleArrays);
    if (mergedStyleArray.length > 0) {
      applyThemableStyles(mergedStyleArray);
    }
  });
}

/**
 * register async loadStyles
 */
function asyncLoadStyles(): number {
  return setTimeout(() => {
    _themeState.runState.flushTimer = 0;
    flush();
  }, 0);
}

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load event
 * is fired.
 * @param {string} styleText Style to register.
 * @param {IStyleRecord} styleRecord Existing style record to re-apply.
 */
function applyThemableStyles(stylesArray: ThemableArray, styleRecord?: IStyleRecord): void {
  if (_themeState.loadStyles) {
    _themeState.loadStyles(resolveThemableArray(stylesArray).styleString, stylesArray);
  } else {
    _injectStylesWithCssText ?
      registerStylesIE(stylesArray, styleRecord) :
      registerStyles(stylesArray);
  }
}

/**
 * Registers a set theme tokens to find and replace. If styles were already registered, they will be
 * replaced.
 * @param {theme} theme JSON object of theme tokens to values.
 */
export function loadTheme(theme: ITheme | undefined): void {
  _themeState.theme = theme;

  // reload styles.
  reloadStyles();
}

/**
 * Clear already registered style elements and style records in theme_State object
 * @option: specify which group of registered styles should be cleared.
 * Default to be both themable and non-themable styles will be cleared
 */
export function clearStyles(option: ClearStyleOptions = ClearStyleOptions.all): void {
  if (option === ClearStyleOptions.all || option === ClearStyleOptions.onlyNonThemable) {
    clearStylesInternal(_themeState.registeredStyles);
    _themeState.registeredStyles = [];
  }
  if (option === ClearStyleOptions.all || option === ClearStyleOptions.onlyThemable) {
    clearStylesInternal(_themeState.registeredThemableStyles);
    _themeState.registeredThemableStyles = [];
  }
}

function clearStylesInternal(records: IStyleRecord[]): void {
  records.forEach((styleRecord: IStyleRecord) => {
    const styleElement: HTMLStyleElement = styleRecord && styleRecord.styleElement as HTMLStyleElement;
    if (styleElement && styleElement.parentElement) {
      styleElement.parentElement.removeChild(styleElement);
    }
  });
}

/**
 * Reloads styles.
 */
function reloadStyles(): void {
  if (_themeState.theme) {
    const themableStyles: ThemableArray[] = [];
    for (const styleRecord of _themeState.registeredThemableStyles) {
      themableStyles.push(styleRecord.themableStyle);
    }
    if (themableStyles.length > 0) {
      clearStyles(ClearStyleOptions.onlyThemable);
      applyThemableStyles([].concat.apply([], themableStyles));
    }
  }
}

/**
 * Find theme tokens and replaces them with provided theme values.
 * @param {string} styles Tokenized styles to fix.
 */
export function detokenize(styles: string | undefined): string | undefined {
  if (styles) {
    styles = resolveThemableArray(splitStyles(styles)).styleString;
  }

  return styles;
}

/**
 * Resolves ThemingInstruction objects in an array and joins the result into a string.
 * @param {ThemableArray} splitStyleArray ThemableArray to resolve and join.
 */
function resolveThemableArray(splitStyleArray: ThemableArray): IThemableArrayResolveResult {
  const { theme }: IThemeState = _themeState;
  let themable: boolean = false;
  // Resolve the array of theming instructions to an array of strings.
  // Then join the array to produce the final CSS string.
  const resolvedArray: (string | undefined)[] = (splitStyleArray || []).map((currentValue: IThemingInstruction) => {
    const themeSlot: string | undefined = currentValue.theme;
    if (themeSlot) {
      themable = true;
      // A theming annotation. Resolve it.
      const themedValue: string | undefined = theme ? theme[themeSlot] : undefined;
      const defaultValue: string = currentValue.defaultValue || 'inherit';

      // Warn to console if we hit an unthemed value even when themes are provided, but only if "DEBUG" is true.
      // Allow the themedValue to be undefined to explicitly request the default value.
      if (theme && !themedValue && console && !(themeSlot in theme) && typeof DEBUG !== 'undefined' && DEBUG) {
        console.warn(`Theming value not provided for "${themeSlot}". Falling back to "${defaultValue}".`);
      }

      return themedValue || defaultValue;
    } else {
      // A non-themable string. Preserve it.
      return currentValue.rawString;
    }
  });

  return {
    styleString: resolvedArray.join(''),
    themable: themable
  };
}

/**
 * Split tokenized CSS into an array of strings and theme specification objects
 * @param {string} styles Tokenized styles to split.
 */
export function splitStyles(styles: string): ThemableArray {
  const result: ThemableArray = [];
  if (styles) {
    let pos: number = 0; // Current position in styles.
    let tokenMatch: RegExpExecArray | null; // tslint:disable-line:no-null-keyword
    while (tokenMatch = _themeTokenRegex.exec(styles)) {
      const matchIndex: number = tokenMatch.index;
      if (matchIndex > pos) {
        result.push({
          rawString: styles.substring(pos, matchIndex)
        });
      }

      result.push({
        theme: tokenMatch[1],
        defaultValue: tokenMatch[2] // May be undefined
      });

      // index of the first character after the current match
      pos = _themeTokenRegex.lastIndex;
    }

    // Push the rest of the string after the last match.
    result.push({
      rawString: styles.substring(pos)
    });
  }

  return result;
}

/**
 * Registers a set of style text. If it is registered too early, we will register it when the
 * window.load event is fired.
 * @param {ThemableArray} styleArray Array of IThemingInstruction objects to register.
 * @param {IStyleRecord} styleRecord May specify a style Element to update.
 */
function registerStyles(styleArray: ThemableArray): void {
  const head: HTMLHeadElement = document.getElementsByTagName('head')[0];
  const styleElement: HTMLStyleElement = document.createElement('style');
  const {
    styleString,
    themable
  } = resolveThemableArray(styleArray);

  styleElement.type = 'text/css';
  styleElement.appendChild(document.createTextNode(styleString));
  _themeState.perf.count++;
  head.appendChild(styleElement);

  const record: IStyleRecord = {
    styleElement: styleElement,
    themableStyle: styleArray
  };

  if (themable) {
    _themeState.registeredThemableStyles.push(record);
  } else {
    _themeState.registeredStyles.push(record);
  }
}

/**
 * Registers a set of style text, for IE 9 and below, which has a ~30 style element limit so we need
 * to register slightly differently.
 * @param {ThemableArray} styleArray Array of IThemingInstruction objects to register.
 * @param {IStyleRecord} styleRecord May specify a style Element to update.
 */
function registerStylesIE(styleArray: ThemableArray, styleRecord?: IStyleRecord): void {
  const head: HTMLHeadElement = document.getElementsByTagName('head')[0];
  const registeredStyles: IStyleRecord[] = _themeState.registeredStyles;
  let lastStyleElement: IExtendedHtmlStyleElement = _themeState.lastStyleElement;

  const stylesheet: IStyleSheet | undefined = lastStyleElement ? lastStyleElement.styleSheet : undefined;
  const lastStyleContent: string = stylesheet ? stylesheet.cssText : '';
  let lastRegisteredStyle: IStyleRecord = registeredStyles[registeredStyles.length - 1];
  const resolvedStyleText: string = resolveThemableArray(styleArray).styleString;

  if (!lastStyleElement || (lastStyleContent.length + resolvedStyleText.length) > MAX_STYLE_CONTENT_SIZE) {
    lastStyleElement = document.createElement('style') as IExtendedHtmlStyleElement;
    lastStyleElement.type = 'text/css';

    if (styleRecord) {
      head.replaceChild(lastStyleElement, styleRecord.styleElement);
      styleRecord.styleElement = lastStyleElement;
    } else {
      head.appendChild(lastStyleElement);
    }

    if (!styleRecord) {
      lastRegisteredStyle = {
        styleElement: lastStyleElement,
        themableStyle: styleArray
      };
      registeredStyles.push(lastRegisteredStyle);
    }
  }

  lastStyleElement.styleSheet.cssText += detokenize(resolvedStyleText);
  Array.prototype.push.apply(lastRegisteredStyle.themableStyle, styleArray); // concat in-place

  // Preserve the theme state.
  _themeState.lastStyleElement = lastStyleElement;
}

/**
 * Checks to see if styleSheet exists as a property off of a style element.
 * This will determine if style registration should be done via cssText (<= IE9) or not
 */
function shouldUseCssText(): boolean {
  let useCSSText: boolean = false;

  if (typeof document !== 'undefined') {
    const emptyStyle: IExtendedHtmlStyleElement = document.createElement('style') as IExtendedHtmlStyleElement;

    emptyStyle.type = 'text/css';
    useCSSText = !!emptyStyle.styleSheet;
  }

  return useCSSText;
}
