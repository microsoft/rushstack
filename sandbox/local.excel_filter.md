[Home](./index) &gt; [local](local.md) &gt; [Excel\_Filter](local.excel_filter.md)

# Excel\_Filter class

Manages the filtering of a table's column. 

 \[Api set: ExcelApi 1.2\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`criteria`](local.excel_filter.criteria.md) |  | `Excel.FilterCriteria` | The currently applied filter on the given column. <p/> \[Api set: ExcelApi 1.2\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`apply(criteria)`](local.excel_filter.apply.md) |  | `void` | Apply the given filter criteria on the given column. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyBottomItemsFilter(count)`](local.excel_filter.applybottomitemsfilter.md) |  | `void` | Apply a "Bottom Item" filter to the column for the given number of elements. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyBottomPercentFilter(percent)`](local.excel_filter.applybottompercentfilter.md) |  | `void` | Apply a "Bottom Percent" filter to the column for the given percentage of elements. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyCellColorFilter(color)`](local.excel_filter.applycellcolorfilter.md) |  | `void` | Apply a "Cell Color" filter to the column for the given color. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyCustomFilter(criteria1, criteria2, oper)`](local.excel_filter.applycustomfilter.md) |  | `void` | Apply a "Icon" filter to the column for the given criteria strings. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyDynamicFilter(criteria)`](local.excel_filter.applydynamicfilter.md) |  | `void` | Apply a "Dynamic" filter to the column. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyFontColorFilter(color)`](local.excel_filter.applyfontcolorfilter.md) |  | `void` | Apply a "Font Color" filter to the column for the given color. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyIconFilter(icon)`](local.excel_filter.applyiconfilter.md) |  | `void` | Apply a "Icon" filter to the column for the given icon. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyTopItemsFilter(count)`](local.excel_filter.applytopitemsfilter.md) |  | `void` | Apply a "Top Item" filter to the column for the given number of elements. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyTopPercentFilter(percent)`](local.excel_filter.applytoppercentfilter.md) |  | `void` | Apply a "Top Percent" filter to the column for the given percentage of elements. <p/> \[Api set: ExcelApi 1.2\] |
|  [`applyValuesFilter(values)`](local.excel_filter.applyvaluesfilter.md) |  | `void` | Apply a "Values" filter to the column for the given values. <p/> \[Api set: ExcelApi 1.2\] |
|  [`clear()`](local.excel_filter.clear.md) |  | `void` | Clear the filter on the given column. <p/> \[Api set: ExcelApi 1.2\] |
|  [`load(option)`](local.excel_filter.load.md) |  | `Excel.Filter` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`toJSON()`](local.excel_filter.tojson.md) |  | `{
            "criteria": FilterCriteria;
        }` |  |

