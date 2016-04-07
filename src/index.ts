/**
 * An IThemingInstruction can specify a rawString to be preserved or a theme slot and a default value
 * to use if that slot is not specified by the theme.
 */
export interface IThemingInstruction {
  theme?: string;
  defaultValue?: string;
  rawString?: string;
};

export type ThemableArray = Array<IThemingInstruction>;

interface IStyleRecord {
  styleElement: Element;
  themableStyle: ThemableArray;
};

let _lastStyleElement: any = null;
let _theme = null;
let _areUnlimitedStylesheetsSupported = null; // lazily intialize
let _registeredStyles: IStyleRecord[] = [] as IStyleRecord[];

/**
 * Matches theming tokens. For example, "[theme: themeSlotName, default: #FFF]" (including the quotes).
 */
/* tslint:disable: max-line-length */
const _themeTokenRegex = /[\'\"]\[theme:\s*(\w+)\s*(?:\,\s*default:\s*([\\"\']?[\.\,\(\)\#\-\s\w]*[\.\,\(\)\#\-\w][\"\']?))?\s*\][\'\"]/g;
/* tslint:enable: max-line-length */

/** Maximum style text length, for supporting IE style restrictions. */
const MAX_STYLE_CONTENT_SIZE = 10000;

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load
 * event is fired.
 * @param {string | ThemableArray} styles Themable style text to register.
 */
export function loadStyles(styles: string | ThemableArray) {
  if (_areUnlimitedStylesheetsSupported === null) {
    _areUnlimitedStylesheetsSupported = !shouldUseCssText();
  }

  let styleParts: ThemableArray = Array.isArray(styles) ? styles : splitStyles(styles);
  applyThemableStyles(styleParts);
}

/**
 * Loads a set of style text. If it is registered too early, we will register it when the window.load event
 * is fired.
 * @param {string} styleText Style to register.
 * @param {IStyleRecord} styleRecord Existing style record to re-apply.
 */
function applyThemableStyles(styles: ThemableArray, styleRecord?: IStyleRecord) {
  _areUnlimitedStylesheetsSupported ?
    registerStyles(styles, styleRecord) :
    registerStylesIE(styles, styleRecord);
}

/**
 * Registers a set theme tokens to find and replace. If styles were already registered, they will be
 * replaced.
 * @param {any} theme JSON object of theme tokens to values.
 */
export function loadTheme(theme: any) {
  _theme = theme;

  // reload styles.
  reloadStyles();
}

/**
 * Reloads styles.
 * @param {any} theme JSON object of theme tokens to values.
 */
function reloadStyles(): void {
  if (_theme) {
    for (let styleRecord of _registeredStyles) {
      applyThemableStyles(styleRecord.themableStyle, styleRecord);
    }
  }
}

/**
 * Find theme tokens and replaces them with provided theme values.
 * @param {string} styles Tokenized styles to fix.
 */
export function detokenize(styles: string): string {
  if (styles) {
    styles = resolveThemableArray(splitStyles(styles));
  }

  return styles;
}

/**
 * Resolves ThemingInstruction objects in an array and joins the result into a string.
 * @param {ThemableArray} splitStyleArray ThemableArray to resolve and join.
 */
function resolveThemableArray(splitStyleArray: ThemableArray): string {
  let resolvedCss: string;
  if (splitStyleArray) {
    // Resolve the array of theming instructions to an array of strings.
    // Then join the array to produce the final CSS string.
    let resolvedArray = splitStyleArray.map((currentValue: IThemingInstruction) => {
      let themeSlot = currentValue.theme;
      if (themeSlot != null) {
        // A theming annotation. Resolve it.
        let themedValue = _theme ? _theme[themeSlot] : null;
        let defaultValue = currentValue.defaultValue;

        // Warn to console if we hit an unthemed value even when themes are provided.
        // Allow the themedValue to be null to explicitly request the default value.
        if (_theme && !themedValue && console && !(themeSlot in _theme)) {
          /* tslint:disable: max-line-length */
          console.warn(`Theming value not provided for "${themeSlot}". Falling back to "${defaultValue || 'inherit'}".`);
          /* tslint:enable: max-line-length */
        }

        return themedValue || defaultValue || 'inherit';
      } else {
        // A non-themable string. Preserve it.
        return currentValue.rawString;
      }
    });

    resolvedCss = resolvedArray.join('');
  }

  return resolvedCss;
}

/**
 * Split tokenized CSS into an array of strings and theme specification objects
 * @param {string} styles Tokenized styles to split.
 */
export function splitStyles(styles: string): ThemableArray {
  let result: ThemableArray = [];
  if (styles) {
    let pos = 0; // Current position in styles.
    let tokenMatch;
    while (tokenMatch = _themeTokenRegex.exec(styles)) {
      let matchIndex: number = tokenMatch.index;
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
function registerStyles(styleArray: ThemableArray, styleRecord?: IStyleRecord): void {
  let head = document.getElementsByTagName('head')[0];
  let styleElement = document.createElement('style');

  styleElement.type = 'text/css';
  styleElement.appendChild(document.createTextNode(resolveThemableArray(styleArray)));

  if (styleRecord) {
    head.replaceChild(styleElement, styleRecord.styleElement);
    styleRecord.styleElement = styleElement;
  } else {
    head.appendChild(styleElement);
  }

  if (!styleRecord) {
    _registeredStyles.push({
      styleElement: styleElement,
      themableStyle: styleArray
    });
  }
}

/**
 * Registers a set of style text, for IE 9 and below, which has a ~30 style element limit so we need
 * to register slightly differently.
 * @param {ThemableArray} styleArray Array of IThemingInstruction objects to register.
 * @param {IStyleRecord} styleRecord May specify a style Element to update.
 */
function registerStylesIE(styleArray: ThemableArray, styleRecord?: IStyleRecord) {
  let head = document.getElementsByTagName('head')[0];
  let stylesheet = _lastStyleElement ? (_lastStyleElement as any).styleSheet : null;
  let lastStyleContent = stylesheet ? stylesheet.cssText : '';
  let lastRegisteredStyle = _registeredStyles[_registeredStyles.length - 1];
  let resolvedStyleText = resolveThemableArray(styleArray);

  if (!_lastStyleElement || (lastStyleContent.length + resolvedStyleText.length) > MAX_STYLE_CONTENT_SIZE) {
    _lastStyleElement = document.createElement('style');
    _lastStyleElement.type = 'text/css';

    if (styleRecord) {
      head.replaceChild(_lastStyleElement, styleRecord.styleElement);
      styleRecord.styleElement = _lastStyleElement;
    } else {
      head.appendChild(_lastStyleElement);
    }

    if (!styleRecord) {
      lastRegisteredStyle = {
        styleElement: _lastStyleElement,
        themableStyle: styleArray
      };
      _registeredStyles.push(lastRegisteredStyle);
    }
  }

  _lastStyleElement.styleSheet.cssText += detokenize(resolvedStyleText);
  Array.prototype.push.apply(lastRegisteredStyle.themableStyle, styleArray); // concat in-place
}

/**
 * Checks to see if styleSheet exists as a property off of a style element.
 * This will determine if style registration should be done via cssText (<= IE9) or not
 */
function shouldUseCssText(): boolean {
  let useCSSText = false;

  if (typeof document !== 'undefined') {
    let emptyStyle = document.createElement('style') as any;

    emptyStyle.type = 'text/css';
    useCSSText = !!emptyStyle.styleSheet;
  }

  return useCSSText;
}
