[Home](./index) &gt; [local](local.md) &gt; [Excel\_RangeFill](local.excel_rangefill.md)

# Excel\_RangeFill class

Represents the background of a range object. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`color`](local.excel_rangefill.color.md) |  | `string` | HTML color code representing the color of the border line, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange") <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.excel_rangefill.clear.md) |  | `void` | Resets the range background. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_rangefill.load.md) |  | `Excel.RangeFill` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_rangefill.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_rangefill.tojson.md) |  | `{
            "color": string;
        }` |  |

