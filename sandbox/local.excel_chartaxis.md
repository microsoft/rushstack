[Home](./index) &gt; [local](local.md) &gt; [Excel\_ChartAxis](local.excel_chartaxis.md)

# Excel\_ChartAxis class

Represents a single axis in a chart. 

 \[Api set: ExcelApi 1.1\]

## Properties

|  Property | Access Modifier | Type | Description |
|  --- | --- | --- | --- |
|  [`format`](local.excel_chartaxis.format.md) |  | `Excel.ChartAxisFormat` | Represents the formatting of a chart object, which includes line and font formatting. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`majorGridlines`](local.excel_chartaxis.majorgridlines.md) |  | `Excel.ChartGridlines` | Returns a gridlines object that represents the major gridlines for the specified axis. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`majorUnit`](local.excel_chartaxis.majorunit.md) |  | `any` | Represents the interval between two major tick marks. Can be set to a numeric value or an empty string. The returned value is always a number. <p/> \[Api set: ExcelApi 1.1\] |
|  [`maximum`](local.excel_chartaxis.maximum.md) |  | `any` | Represents the maximum value on the value axis. Can be set to a numeric value or an empty string (for automatic axis values). The returned value is always a number. <p/> \[Api set: ExcelApi 1.1\] |
|  [`minimum`](local.excel_chartaxis.minimum.md) |  | `any` | Represents the minimum value on the value axis. Can be set to a numeric value or an empty string (for automatic axis values). The returned value is always a number. <p/> \[Api set: ExcelApi 1.1\] |
|  [`minorGridlines`](local.excel_chartaxis.minorgridlines.md) |  | `Excel.ChartGridlines` | Returns a Gridlines object that represents the minor gridlines for the specified axis. Read-only. <p/> \[Api set: ExcelApi 1.1\] |
|  [`minorUnit`](local.excel_chartaxis.minorunit.md) |  | `any` | Represents the interval between two minor tick marks. "Can be set to a numeric value or an empty string (for automatic axis values). The returned value is always a number. <p/> \[Api set: ExcelApi 1.1\] |
|  [`title`](local.excel_chartaxis.title.md) |  | `Excel.ChartAxisTitle` | Represents the axis title. Read-only. <p/> \[Api set: ExcelApi 1.1\] |

## Methods

|  Method | Access Modifier | Returns | Description |
|  --- | --- | --- | --- |
|  [`load(option)`](local.excel_chartaxis.load.md) |  | `Excel.ChartAxis` | Queues up a command to load the specified properties of the object. You must call "context.sync()" before reading the properties. |
|  [`set(properties, options)`](local.excel_chartaxis.set.md) |  | `void` | Sets multiple properties on the object at the same time, based on JSON input. |
|  [`toJSON()`](local.excel_chartaxis.tojson.md) |  | `{
            "format": ChartAxisFormat;
            "majorGridlines": ChartGridlines;
            "majorUnit": any;
            "maximum": any;
            "minimum": any;
            "minorGridlines": ChartGridlines;
            "minorUnit": any;
            "title": ChartAxisTitle;
        }` |  |

