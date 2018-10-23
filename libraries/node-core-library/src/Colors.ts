// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export interface IColorableSequence {
  text: string;
  foregroundColor?: Color;
  backgroundColor?: Color;
}

export enum Color {
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

export class Colors {
  public static black(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Black
    };
  }

  public static red(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Red
    };
  }

  public static green(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Green
    };
  }

  public static yellow(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Yellow
    };
  }

  public static blue(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Blue
    };
  }

  public static magenta(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Magenta
    };
  }

  public static cyan(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Cyan
    };
  }

  public static white(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.White
    };
  }

  public static gray(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      foregroundColor: Color.Gray
    };
  }

  public static blackBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Black
    };
  }

  public static redBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Red
    };
  }

  public static greenBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Green
    };
  }

  public static yellowBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Yellow
    };
  }

  public static blueBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Blue
    };
  }

  public static magentaBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Magenta
    };
  }

  public static cyanBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Cyan
    };
  }

  public static whiteBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.White
    };
  }

  public static grayBackground(text: string | IColorableSequence): IColorableSequence {
    return {
      ...(typeof text === 'string' ? { text } : text),
      backgroundColor: Color.Gray
    };
  }
}