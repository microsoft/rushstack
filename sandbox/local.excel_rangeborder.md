[Home](./index) &gt; [local](local.md) &gt; [Excel\_RangeBorder](local.excel_rangeborder.md)

# Excel\_RangeBorder class

Represents the border of an object. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`color`](local.excel_rangeborder.color.md) |  | `string` | HTML color code representing the color of the border line, of the form \#RRGGBB (e.g. "FFA500") or as a named HTML color (e.g. "orange"). <p/> \[Api set: ExcelApi 1.1\] |
|  [`sideIndex`](local.excel_rangeborder.sideindex.md) |  | `string` | Constant value that indicates the specific side of the border. See Excel.BorderIndex for details. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`style`](local.excel_rangeborder.style.md) |  | `string` | One of the constants of line style specifying the line style for the border. See Excel.BorderLineStyle for details. <p/> \[Api set: ExcelApi 1.1\] |
|  [`weight`](local.excel_rangeborder.weight.md) |  | `string` | Specifies the weight of the border around a range. See Excel.BorderWeight for details. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_rangeborder.load.md) |  | `Excel.RangeBorder` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_rangeborder.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_rangeborder.tojson.md) |  | `{
            "color": string;
            "sideIndex": string;
            "style": string;
            "weight": string;
        }` |  |

