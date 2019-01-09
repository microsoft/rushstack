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

|  <p>Method</p> | <p>Modifiers</p> | <p>Description</p> |
|  --- | --- | --- |
|  <p>[black(text)](./node-core-library.colors.black.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[blackBackground(text)](./node-core-library.colors.blackbackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[blue(text)](./node-core-library.colors.blue.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[blueBackground(text)](./node-core-library.colors.bluebackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[cyan(text)](./node-core-library.colors.cyan.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[cyanBackground(text)](./node-core-library.colors.cyanbackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[gray(text)](./node-core-library.colors.gray.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[grayBackground(text)](./node-core-library.colors.graybackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[green(text)](./node-core-library.colors.green.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[greenBackground(text)](./node-core-library.colors.greenbackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[magenta(text)](./node-core-library.colors.magenta.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[magentaBackground(text)](./node-core-library.colors.magentabackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[red(text)](./node-core-library.colors.red.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[redBackground(text)](./node-core-library.colors.redbackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[white(text)](./node-core-library.colors.white.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[whiteBackground(text)](./node-core-library.colors.whitebackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[yellow(text)](./node-core-library.colors.yellow.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |
|  <p>[yellowBackground(text)](./node-core-library.colors.yellowbackground.md)</p> | <p>`static`</p> | <p><b><i>(BETA)</i></b></p> |

## Example

terminal.writeLine(Colors.green('Green Text!'), ' ', Colors.blue('Blue Text!'));

