[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalRangeBorder](local.excel_conditionalrangeborder.md)

# Excel\_ConditionalRangeBorder class

Represents the border of an object. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`color`](local.excel_conditionalrangeborder.color.md) |  | `string` | HTML color code representing the color of the border line, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`sideIndex`](local.excel_conditionalrangeborder.sideindex.md) |  | `string` | Constant value that indicates the specific side of the border. See Excel.ConditionalRangeBorderIndex for details. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`style`](local.excel_conditionalrangeborder.style.md) |  | `string` | One of the constants of line style specifying the line style for the border. See Excel.BorderLineStyle for details. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_conditionalrangeborder.load.md) |  | `Excel.ConditionalRangeBorder` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionalrangeborder.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionalrangeborder.tojson.md) |  | `{
            "color": string;
            "sideIndex": string;
            "style": string;
        }` |  |

