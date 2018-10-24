// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const textSymbol: unique symbol = Symbol('text');
export const isEolSymbol: unique symbol = Symbol('isEol');
export const foregroundColorSymbol: unique symbol = Symbol('foregroundColor');
export const backgroundColorSymbol: unique symbol = Symbol('backgroundColor');

/**
 * @beta
 */
export interface IColorableSequence {
  [textSymbol]: string;
  [isEolSymbol]?: boolean;
  [foregroundColorSymbol]?: ColorValue;
  [backgroundColorSymbol]?: ColorValue;
}

export const eolSequence: IColorableSequence = {
  [isEolSymbol]: true
} as IColorableSequence;

/**
 * @beta
 */
export enum ColorValue {
  Black,
  Red,
  Green,
  Yellow,
  Blue,
  Magenta,
  Cyan,
  White,
  Gray
}

/**
 * @beta
 */
export class Colors {
  public static black(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Black
    };
  }

  public static red(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Red
    };
  }

  public static green(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Green
    };
  }

  public static yellow(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Yellow
    };
  }

  public static blue(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Blue
    };
  }

  public static magenta(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Magenta
    };
  }

  public static cyan(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Cyan
    };
  }

  public static white(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.White
    };
  }

  public static gray(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [foregroundColorSymbol]: ColorValue.Gray
    };
  }

  public static blackBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Black
    };
  }

  public static redBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Red
    };
  }

  public static greenBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Green
    };
  }

  public static yellowBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Yellow
    };
  }

  public static blueBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Blue
    };
  }

  public static magentaBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Magenta
    };
  }

  public static cyanBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Cyan
    };
  }

  public static whiteBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.White
    };
  }

  public static grayBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      [backgroundColorSymbol]: ColorValue.Gray
    };
  }

  /**
   * @internal
   */
  public static _normalizeStringOrColorableSequence(value: string | IColorableSequence): IColorableSequence {
    if (typeof value === 'string') {
      return {
        [textSymbol]: value
      };
    } else {
      return value;
    }
  }
}