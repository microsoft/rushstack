[Home](./index) &gt; [@microsoft/ts-command-line](./ts-command-line.md) &gt; [CommandLineParameter](./ts-command-line.commandlineparameter.md)

# CommandLineParameter class

The base class for the various command-line parameter types.

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`value`](./ts-command-line.commandlineparameter.value.md) |  | `T` | After the command line has been parsed, this returns the value of the parameter. |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`constructor(key, converter)`](./ts-command-line.commandlineparameter.constructor.md) |  |  | Constructs a new instance of the [CommandLineParameter](./ts-command-line.commandlineparameter.md) class |

## Remarks

The "subclasses" of this class are not actually constructed directly. Instead, they are used as shorthand for various parameterizations of CommandLineParameter&lt;T&gt;.
