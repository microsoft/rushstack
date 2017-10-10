[Home](./index) &gt; [local](local.md) &gt; [Excel\_ConditionalRangeFormat](local.excel_conditionalrangeformat.md)

# Excel\_ConditionalRangeFormat class

A format object encapsulating the conditional formats range's font, fill, borders, and other properties. 

 \[Api set: ExcelApi 1.6 (PREVIEW)\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`borders`](local.excel_conditionalrangeformat.borders.md) |  | `Excel.ConditionalRangeBorderCollection` | Collection of border objects that apply to the overall conditional format range. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`fill`](local.excel_conditionalrangeformat.fill.md) |  | `Excel.ConditionalRangeFill` | Returns the fill object defined on the overall conditional format range. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`font`](local.excel_conditionalrangeformat.font.md) |  | `Excel.ConditionalRangeFont` | Returns the font object defined on the overall conditional format range. Read-only. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |
|  [`numberFormat`](local.excel_conditionalrangeformat.numberformat.md) |  | `any` | Represents Excel's number format code for the given range. Cleared if null is passed in. <p/> \[Api set: ExcelApi 1.6 (PREVIEW)\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_conditionalrangeformat.load.md) |  | `Excel.ConditionalRangeFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_conditionalrangeformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_conditionalrangeformat.tojson.md) |  | `{
            "numberFormat": any;
        }` |  |

