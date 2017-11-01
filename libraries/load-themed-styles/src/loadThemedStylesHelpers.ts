// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Declaring a global here in case that the execution environment is Node.js (without importing the
// entire node.js d.ts for now)
declare var global: any; // tslint:disable-line:no-any

/**
 * An IThemingInstruction can specify a rawString to be preserved or a theme slot and a default value
 *  to use if that slot is not specified by the theme.
 *
 * For example, the simple stylesheet `.container { background-color: "[theme:themePrimary, default: #0078d7]" }`
 *  contains three theming instructions:
 * 1. { rawString: '.container { background-color: "' }
 * 2. { defaultValue: '#0078d7', theme: 'themePrimary' }
 * 3. { rawString: '" }' }
 *
 * @public
 */
export interface IThemingInstruction {
  /**
   * If this is a theme color token, the name of the theme color.
   */
  theme?: string;

  /**
   * If this is a theme color token, the default color value to be used if one is not provided by the theme.
   */
  defaultValue?: string;

  /**
   * A raw string value from the provided style text.
   */
  rawString?: string;
}

/**
 * A set of theming keys and their color values.
 *
 * @public
 */
export interface ITheme {
  /**
   * Keys are theming parameters like themePrimary, neutralDark, or blueMid.
   * Values are the colors the theme parameters should be replaced with like #0078d7, #212121, or #00188f.
   */
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
   * Total duration of all loadStyles executions
   */
  duration: number;
}

interface IRunState {
  buffer: IThemingInstruction[][];
  flushTimer: number;
}

interface IThemeState {
  theme: ITheme | undefined;
  lastStyleElement: IExtendedHtmlStyleElement;
  registeredStyles: IStyleRecord[];  // records of already registered non-themable styles
  registeredThemableStyles: IStyleRecord[];  // records of already registered themable styles
  loadStyles: ((processedStyles: string, rawStyles?: string | IThemingInstruction[]) => void) | undefined;
  perf: IMeasurement;
  runState: IRunState;
}

interface IStyleRecord {
  styleElement: Element;
  themableStyle: IThemingInstruction[];
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
 * Themable styles and non-themable styles are tracked separately
 * Specify ClearStylesOptions when calling clearStyles API to specify which group of registered styles should be
 *  cleared.
 */
const enum ClearStylesOptions {
  /**
   * Only themable styles will be cleared
   */
  onlyThemable = 1,

  /**
   * Only non-themable styles will be cleared
   */
  onlyNonThemable = 2,

  /**
   * Both themable and non-themable styles will be cleared
   */
  all = 3
}

// IE needs to inject styles using cssText. However, we need to evaluate this lazily, so this
// value will initialize as undefined, and later will be set once on first loadStyles injection.
let _injectStylesWithCssText: boolean;

// Store the theming state in __themeState__ global scope for reuse in the case of duplicate
// load-themed-styles hosted on the page.
const _root: any = (typeof window === 'undefined') ? global : window; // tslint:disable-line:no-any

const _themeState: IThemeState = _initializeThemeState();

/**
 * Matches theming tokens. For example, "[theme: themeSlotName, default: #FFF]" (including the quotes).
 */
// tslint:disable-next-line:max-line-length
const _themeTokenRegex: RegExp = /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g;

/** Maximum style text length, for supporting IE style restrictions. */
const MAX_STYLE_CONTENT_SIZE: number = 10000;

const _now: () => number =
  () => (typeof performance !== 'undefined' && !!performance.now) ? performance.now() : Date.now();

function _measure(func: () => void): void {
  const start: number = _now();
  func();
  const end: number = _now();
  _themeState.perf.duration += end - start;
}

/**
 * initialize global state object
 */
function _initializeThemeState(): IThemeState {
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
 * Synchronously loads a set of style text. If it is registered too early, we will register it when the window.load
 * event is fired.
 * @param styles - Themable style text to register.
 *
 * @public
 */
export function loadStyles(styles: string | IThemingInstruction[]): void {
  _loadStylesInternal(styles, false);
}

/**
 * Asynchronously loads a set of style text. If it is registered too early, we will register it when the window.load
 * event is fired.
 * @param styles - Themable style text to register.
 *
 * @public
 */
export function loadStylesAsync(styles: string | IThemingInstruction[]): void {
  _loadStylesInternal(styles, true);
}

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load
 * event is fired.
 * @param styles - Themable style text to register.
 * @param loadAsync - When true, always load styles in async mode, irrespective of current sync mode.
 *
 * @public
 */
function _loadStylesInternal(styles: string | IThemingInstruction[], loadAsync: boolean = false): void {
  _measure(() => {
    const styleParts: IThemingInstruction[] = Array.isArray(styles) ? styles : splitStyles(styles);
    if (_injectStylesWithCssText === undefined) {
      _injectStylesWithCssText = _shouldUseCssText();
    }
    const {
      buffer,
      flushTimer
    } = _themeState.runState;
    if (loadAsync) {
      buffer.push(styleParts);
      if (!flushTimer) {
        _themeState.runState.flushTimer = _asyncLoadStyles();
      }
    } else {
      _applyThemableStyles(styleParts);
    }
  });
}

/**
 * Allows for customizable loadStyles logic. e.g. for server side rendering application
 * @param processedStyles - a loadStyles callback that gets called when styles are loaded or reloaded
 *
 * @public
 */
export function configureLoadStyles(
  loadStylesFunction: ((processedStyles: string, rawStyles?: string | IThemingInstruction[]) => void) | undefined
): void {
  _themeState.loadStyles = loadStylesFunction;
}

/**
 * external code can call flush to synchronously force processing of currently buffered styles
 *
 * @public
 */
export function flush(): void {
  _measure(() => {
    const styleArrays: IThemingInstruction[][] = _themeState.runState.buffer.slice();
    _themeState.runState.buffer = [];
    const mergedStyleArray: IThemingInstruction[] = [].concat.apply([], styleArrays);
    if (mergedStyleArray.length > 0) {
      _applyThemableStyles(mergedStyleArray);
    }
  });
}

/**
 * register async loadStyles
 *
 * @public
 */
function _asyncLoadStyles(): number {
  return setTimeout(() => {
    _themeState.runState.flushTimer = 0;
    flush();
  }, 0);
}

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load event
 * is fired.
 * @param stylesArray - Styles to register.
 * @param styleRecord - Existing style record to re-apply.
 *
 * @public
 */
function _applyThemableStyles(stylesArray: IThemingInstruction[], styleRecord?: IStyleRecord): void {
  if (_themeState.loadStyles) {
    _themeState.loadStyles(_resolveThemableArray(stylesArray).styleString, stylesArray);
  } else {
    _injectStylesWithCssText ?
      _registerStylesIE(stylesArray, styleRecord) :
      _registerStyles(stylesArray);
  }
}

/**
 * Registers a set theme tokens to find and replace. If styles were already registered, they will be
 * replaced.
 * @param theme - JSON object of theme tokens to values.
 *
 * @public
 */
export function loadTheme(theme: ITheme | undefined): void {
  _themeState.theme = theme;

  // reload styles.
  _reloadStyles();
}

/**
 * Clear already registered style elements and style records in theme_State object
 * @param option - specify which group of registered styles should be cleared. Defaults to both themable and
 *  non-themable styles will be cleared
 */
function _clearStyles(option: ClearStylesOptions = ClearStylesOptions.all): void {
  if (option === ClearStylesOptions.all || option === ClearStylesOptions.onlyNonThemable) {
    _clearStylesInternal(_themeState.registeredStyles);
    _themeState.registeredStyles = [];
  }
  if (option === ClearStylesOptions.all || option === ClearStylesOptions.onlyThemable) {
    _clearStylesInternal(_themeState.registeredThemableStyles);
    _themeState.registeredThemableStyles = [];
  }
}

function _clearStylesInternal(records: IStyleRecord[]): void {
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
function _reloadStyles(): void {
  if (_themeState.theme) {
    const themableStyles: IThemingInstruction[][] = [];
    for (const styleRecord of _themeState.registeredThemableStyles) {
      themableStyles.push(styleRecord.themableStyle);
    }
    if (themableStyles.length > 0) {
      _clearStyles(ClearStylesOptions.onlyThemable);
      _applyThemableStyles([].concat.apply([], themableStyles));
    }
  }
}

/**
 * Find theme tokens and replaces them with provided theme values.
 * @param styles - Tokenized styles to fix.
 *
 * @internal
 */
export function _detokenize(styles: string): string {
  return _resolveThemableArray(splitStyles(styles)).styleString;
}

/**
 * Resolves ThemingInstruction objects in an array and joins the result into a string.
 * @param splitStyleArray - Theming instructions to resolve and join.
 */
function _resolveThemableArray(splitStyleArray: IThemingInstruction[]): IThemableArrayResolveResult {
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
 * @param styles - Tokenized styles to split.
 *
 * @public
 */
export function splitStyles(styles: string): IThemingInstruction[] {
  const result: IThemingInstruction[] = [];
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
 *  window.load event is fired.
 * @param styleArray - Array of IThemingInstruction objects to register.
 */
function _registerStyles(styleArray: IThemingInstruction[]): void {
  const head: HTMLHeadElement = document.getElementsByTagName('head')[0];
  const styleElement: HTMLStyleElement = document.createElement('style');
  const {
    styleString,
    themable
  } = _resolveThemableArray(styleArray);

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
 * @param styleArray - Array of IThemingInstruction objects to register.
 * @param styleRecord - May specify a style Element to update.
 */
function _registerStylesIE(styleArray: IThemingInstruction[], styleRecord?: IStyleRecord): void {
  const head: HTMLHeadElement = document.getElementsByTagName('head')[0];
  const registeredStyles: IStyleRecord[] = _themeState.registeredStyles;
  let lastStyleElement: IExtendedHtmlStyleElement = _themeState.lastStyleElement;

  const stylesheet: IStyleSheet | undefined = lastStyleElement ? lastStyleElement.styleSheet : undefined;
  const lastStyleContent: string = stylesheet ? stylesheet.cssText : '';
  let lastRegisteredStyle: IStyleRecord = registeredStyles[registeredStyles.length - 1];
  const resolvedStyleText: string = _resolveThemableArray(styleArray).styleString;

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

  lastStyleElement.styleSheet.cssText += _detokenize(resolvedStyleText);
  Array.prototype.push.apply(lastRegisteredStyle.themableStyle, styleArray); // concat in-place

  // Preserve the theme state.
  _themeState.lastStyleElement = lastStyleElement;
}

/**
 * Checks to see if styleSheet exists as a property off of a style element.
 * This will determine if style registration should be done via cssText (<= IE9) or not
 */
function _shouldUseCssText(): boolean {
  let useCSSText: boolean = false;

  if (typeof document !== 'undefined') {
    const emptyStyle: IExtendedHtmlStyleElement = document.createElement('style') as IExtendedHtmlStyleElement;

    emptyStyle.type = 'text/css';
    useCSSText = !!emptyStyle.styleSheet;
  }

  return useCSSText;
}
