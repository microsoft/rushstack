[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalRangeFill](local.excel_conditionalrangefill.md)

# Excel\_ConditionalRangeFill class

Represents the background of a conditional range object. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`color`](local.excel_conditionalrangefill.color.md) |  | `string` | HTML color code representing the color of the fill, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.excel_conditionalrangefill.clear.md) |  | `void` | Resets the fill. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`load(option)`](local.excel_conditionalrangefill.load.md) |  | `Excel.ConditionalRangeFill` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionalrangefill.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionalrangefill.tojson.md) |  | `{
            "color": string;
        }` |  |

