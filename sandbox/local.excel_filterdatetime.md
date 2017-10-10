[Home](./index) &gt; [local](local.md) &gt; [Excel\_FilterDatetime](local.excel_filterdatetime.md)

# Excel\_FilterDatetime interface

Represents how to filter a date when filtering on values. 

 \[Api set: ExcelApi 1.2\]

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [`date`](local.excel_filterdatetime.date.md) | `string` | The date in ISO8601 format used to filter data. <p/> \[Api set: ExcelApi 1.2\] |
|  [`specificity`](local.excel_filterdatetime.specificity.md) | `string` | How specific the date should be used to keep data. For example, if the date is 2005-04-02 and the specifity is set to "month", the filter operation will keep all rows with a date in the month of april 2009. <p/> \[Api set: ExcelApi 1.2\] |

