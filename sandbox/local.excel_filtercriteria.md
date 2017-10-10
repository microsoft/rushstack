[Home](./index) &gt; [local](local.md) &gt; [Excel\_FilterCriteria](local.excel_filtercriteria.md)

# Excel\_FilterCriteria interface

Represents the filtering criteria applied to a column. 

 \[Api set: ExcelApi 1.2\]

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`color`](local.excel_filtercriteria.color.md) | `string` | The HTML color string used to filter cells. Used with "cellColor" and "fontColor" filtering. <p/> \[Api set: ExcelApi 1.2\] |
|  [`criterion1`](local.excel_filtercriteria.criterion1.md) | `string` | The first criterion used to filter data. Used as an operator in the case of "custom" filtering. For example "&gt;50" for number greater than 50 or "=\*s" for values ending in "s". <p/> Used as a number in the case of top/bottom items/percents. E.g. "5" for the top 5 items if filterOn is set to "topItems" <p/> \[Api set: ExcelApi 1.2\] |
|  [`criterion2`](local.excel_filtercriteria.criterion2.md) | `string` | The second criterion used to filter data. Only used as an operator in the case of "custom" filtering. <p/> \[Api set: ExcelApi 1.2\] |
|  [`dynamicCriteria`](local.excel_filtercriteria.dynamiccriteria.md) | `string` | The dynamic criteria from the Excel.DynamicFilterCriteria set to apply on this column. Used with "dynamic" filtering. <p/> \[Api set: ExcelApi 1.2\] |
|  [`filterOn`](local.excel_filtercriteria.filteron.md) | `string` | The property used by the filter to determine whether the values should stay visible. <p/> \[Api set: ExcelApi 1.2\] |
|  [`icon`](local.excel_filtercriteria.icon.md) | `Excel.Icon` | The icon used to filter cells. Used with "icon" filtering. <p/> \[Api set: ExcelApi 1.2\] |
|  [`operator`](local.excel_filtercriteria.operator.md) | `string` | The operator used to combine criterion 1 and 2 when using "custom" filtering. <p/> \[Api set: ExcelApi 1.2\] |
|  [`values`](local.excel_filtercriteria.values.md) | `Array<string | Excel.FilterDatetime>` | The set of values to be used as part of "values" filtering. <p/> \[Api set: ExcelApi 1.2\] |

