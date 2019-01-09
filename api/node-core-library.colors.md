[Home](./index) &gt; [@microsoft/node-core-library](./node-core-library.md) &gt; [Colors](./node-core-library.colors.md)

## Colors class

> This API is provided as a preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.
> 

The static functions on this class are used to produce colored text for use with the node-core-library terminal.

<b>Signature:</b>

```typescript
export declare class Colors 
```

## Methods

|  Method | Modifiers | Description |
|  --- | --- | --- |
|  [black(text)](./node-core-library.colors.black.md) | `static` | <b><i>(BETA)</i></b> |
|  [blackBackground(text)](./node-core-library.colors.blackbackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [blue(text)](./node-core-library.colors.blue.md) | `static` | <b><i>(BETA)</i></b> |
|  [blueBackground(text)](./node-core-library.colors.bluebackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [cyan(text)](./node-core-library.colors.cyan.md) | `static` | <b><i>(BETA)</i></b> |
|  [cyanBackground(text)](./node-core-library.colors.cyanbackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [gray(text)](./node-core-library.colors.gray.md) | `static` | <b><i>(BETA)</i></b> |
|  [grayBackground(text)](./node-core-library.colors.graybackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [green(text)](./node-core-library.colors.green.md) | `static` | <b><i>(BETA)</i></b> |
|  [greenBackground(text)](./node-core-library.colors.greenbackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [magenta(text)](./node-core-library.colors.magenta.md) | `static` | <b><i>(BETA)</i></b> |
|  [magentaBackground(text)](./node-core-library.colors.magentabackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [red(text)](./node-core-library.colors.red.md) | `static` | <b><i>(BETA)</i></b> |
|  [redBackground(text)](./node-core-library.colors.redbackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [white(text)](./node-core-library.colors.white.md) | `static` | <b><i>(BETA)</i></b> |
|  [whiteBackground(text)](./node-core-library.colors.whitebackground.md) | `static` | <b><i>(BETA)</i></b> |
|  [yellow(text)](./node-core-library.colors.yellow.md) | `static` | <b><i>(BETA)</i></b> |
|  [yellowBackground(text)](./node-core-library.colors.yellowbackground.md) | `static` | <b><i>(BETA)</i></b> |

## Example

terminal.writeLine(Colors.green('Green Text!'), ' ', Colors.blue('Blue Text!'));

