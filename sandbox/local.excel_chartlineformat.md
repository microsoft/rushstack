[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartLineFormat](local.excel_chartlineformat.md)

# Excel\_ChartLineFormat class

Enapsulates the formatting options for line elements. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`color`](local.excel_chartlineformat.color.md) |  | `string` | HTML color code representing the color of lines in the chart. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`clear()`](local.excel_chartlineformat.clear.md) |  | `void` | Clear the line format of a chart element. <p/> \[Api set: ExcelApi 1.1\] |
|  [`load(option)`](local.excel_chartlineformat.load.md) |  | `Excel.ChartLineFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartlineformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartlineformat.tojson.md) |  | `{
            "color": string;
        }` |  |

