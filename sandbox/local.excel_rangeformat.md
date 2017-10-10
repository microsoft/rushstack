[Home](./index) &gt; [local](local.md) &gt; [Excel\_RangeFormat](local.excel_rangeformat.md)

# Excel\_RangeFormat class

A format object encapsulating the range's font, fill, borders, alignment, and other properties. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`borders`](local.excel_rangeformat.borders.md) |  | `Excel.RangeBorderCollection` | Collection of border objects that apply to the overall range. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`columnWidth`](local.excel_rangeformat.columnwidth.md) |  | `number` | Gets or sets the width of all colums within the range. If the column widths are not uniform, null will be returned. <p/> \[Api set: ExcelApi 1.2\] |
|  [`fill`](local.excel_rangeformat.fill.md) |  | `Excel.RangeFill` | Returns the fill object defined on the overall range. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`font`](local.excel_rangeformat.font.md) |  | `Excel.RangeFont` | Returns the font object defined on the overall range. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`horizontalAlignment`](local.excel_rangeformat.horizontalalignment.md) |  | `string` | Represents the horizontal alignment for the specified object. See Excel.HorizontalAlignment for details. <p/> \[Api set: ExcelApi 1.1\] |
|  [`protection`](local.excel_rangeformat.protection.md) |  | `Excel.FormatProtection` | Returns the format protection object for a range. <p/> \[Api set: ExcelApi 1.2\] |
|  [`rowHeight`](local.excel_rangeformat.rowheight.md) |  | `number` | Gets or sets the height of all rows in the range. If the row heights are not uniform null will be returned. <p/> \[Api set: ExcelApi 1.2\] |
|  [`verticalAlignment`](local.excel_rangeformat.verticalalignment.md) |  | `string` | Represents the vertical alignment for the specified object. See Excel.VerticalAlignment for details. <p/> \[Api set: ExcelApi 1.1\] |
|  [`wrapText`](local.excel_rangeformat.wraptext.md) |  | `boolean` | Indicates if Excel wraps the text in the object. A null value indicates that the entire range doesn't have uniform wrap setting <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`autofitColumns()`](local.excel_rangeformat.autofitcolumns.md) |  | `void` | Changes the width of the columns of the current range to achieve the best fit, based on the current data in the columns. <p/> \[Api set: ExcelApi 1.2\] |
|  [`autofitRows()`](local.excel_rangeformat.autofitrows.md) |  | `void` | Changes the height of the rows of the current range to achieve the best fit, based on the current data in the columns. <p/> \[Api set: ExcelApi 1.2\] |
|  [`load(option)`](local.excel_rangeformat.load.md) |  | `Excel.RangeFormat` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_rangeformat.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_rangeformat.tojson.md) |  | `{
            "columnWidth": number;
            "fill": RangeFill;
            "font": RangeFont;
            "horizontalAlignment": string;
            "protection": FormatProtection;
            "rowHeight": number;
            "verticalAlignment": string;
            "wrapText": boolean;
        }` |  |

