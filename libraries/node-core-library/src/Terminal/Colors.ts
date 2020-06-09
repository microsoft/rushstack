// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @beta
 */
export interface IColorableSequence {
  text: string;
  isEol?: boolean;
  foregroundColor?: ColorValue;
  backgroundColor?: ColorValue;
  textAttributes?: TextAttribute[];
}

export const eolSequence: IColorableSequence = {
  isEol: true
} as IColorableSequence;

/**
 * Colors used with {@link IColorableSequence}.
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
 * Text styles used with {@link IColorableSequence}.
 * @beta
 */
export enum TextAttribute {
  Bold,
  Dim,
  Underline,
  Blink,
  InvertColor,
  Hidden
}

/**
 * The static functions on this class are used to produce colored text
 * for use with the node-core-library terminal.
 *
 * @example
 * terminal.writeLine(Colors.green('Green Text!'), ' ', Colors.blue('Blue Text!'));
 *
 * @beta
 */
export class Colors {
  public static black(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Black
    };
  }

  public static red(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Red
    };
  }

  public static green(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Green
    };
  }

  public static yellow(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Yellow
    };
  }

  public static blue(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Blue
    };
  }

  public static magenta(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Magenta
    };
  }

  public static cyan(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Cyan
    };
  }

  public static white(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.White
    };
  }

  public static gray(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      foregroundColor: ColorValue.Gray
    };
  }

  public static blackBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Black
    };
  }

  public static redBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Red
    };
  }

  public static greenBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Green
    };
  }

  public static yellowBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Yellow
    };
  }

  public static blueBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Blue
    };
  }

  public static magentaBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Magenta
    };
  }

  public static cyanBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Cyan
    };
  }

  public static whiteBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.White
    };
  }

  public static grayBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...Colors._normalizeStringOrColorableSequence(text),
      backgroundColor: ColorValue.Gray
    };
  }

  public static bold(text: string | IColorableSequence): IColorableSequence {
    return Colors._applyTextAttribute(text, TextAttribute.Bold);
  }

  public static dim(text: string | IColorableSequence): IColorableSequence {
    return Colors._applyTextAttribute(text, TextAttribute.Dim);
  }

  public static underline(text: string | IColorableSequence): IColorableSequence {
    return Colors._applyTextAttribute(text, TextAttribute.Underline);
  }

  public static blink(text: string | IColorableSequence): IColorableSequence {
    return Colors._applyTextAttribute(text, TextAttribute.Blink);
  }

  public static invertColor(text: string | IColorableSequence): IColorableSequence {
    return Colors._applyTextAttribute(text, TextAttribute.InvertColor);
  }

  public static hidden(text: string | IColorableSequence): IColorableSequence {
    return Colors._applyTextAttribute(text, TextAttribute.Hidden);
  }

  /**
   * If called with a string, returns the string wrapped in a {@link IColorableSequence}.
   * If called with a {@link IColorableSequence}, returns the {@link IColorableSequence}.
   *
   * @internal
   */
  public static _normalizeStringOrColorableSequence(value: string | IColorableSequence): IColorableSequence {
    if (typeof value === 'string') {
      return {
        text: value
      };
    } else {
      return value;
    }
  }

  private static _applyTextAttribute(
    text: string | IColorableSequence,
    attribute: TextAttribute
  ): IColorableSequence {
    const sequence: IColorableSequence = Colors._normalizeStringOrColorableSequence(text);
    if (!sequence.textAttributes) {
      sequence.textAttributes = [];
    }

    sequence.textAttributes.push(attribute);
    return sequence;
  }
}
