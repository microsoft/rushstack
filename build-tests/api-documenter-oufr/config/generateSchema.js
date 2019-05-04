const fs = require('fs');

// This is a copy of an object that we will import from @uifabric/fabric-website package
// to be in sync with changes to their controls page navigation
const categories = {
  "Basic Inputs": {
    Button: {},
    Checkbox: {},
    ChoiceGroup: {},
    ComboBox: {},
    Dropdown: {},
    Label: {},
    Link: {},
    Rating: {},
    SearchBox: {},
    Slider: {},
    SpinButton: {},
    TextField: {},
    Toggle: {}
  },
  "Galleries & Pickers": {
    Pickers: {},
    Calendar: {},
    ColorPicker: {},
    DatePicker: {},
    PeoplePicker: {},
    SwatchColorPicker: {}
  },
  "Items & Lists": {
    List: { title: "Basic List" },
    DetailsList: {
      subPages: {
        Basic: {},
        Compact: {},
        Grouped: {},
        LargeGrouped: {},
        CustomColumns: {
          title: "Custom Item Columns",
          url: "customitemcolumns"
        },
        CustomRows: { title: "Custom Item Rows", url: "customitemrows" },
        CustomFooter: { title: "Custom Footer" },
        CustomGroupHeaders: { title: "Custom Group Headers" },
        Advanced: { title: "Variable Row Heights", url: "variablerowheights" },
        DragDrop: { title: "Drag & Drop", url: "draganddrop" },
        NavigatingFocus: { title: "Inner Navigation", url: "innernavigation" },
        Shimmer: {}
      }
    },
    GroupedList: {},
    ActivityItem: {},
    DocumentCard: {},
    Facepile: {},
    HoverCard: {},
    Persona: {}
  },
  "Commands, Menus & Navs": {
    Breadcrumb: {},
    CommandBar: {},
    ContextualMenu: {},
    Nav: {},
    OverflowSet: {},
    Pivot: {}
  },
  "Notification & Engagement": {
    Coachmark: {},
    MessageBar: {},
    TeachingBubble: {}
  },
  Progress: {
    ProgressIndicator: {},
    Shimmer: {},
    Spinner: {}
  },
  Surfaces: {
    Callout: {},
    Dialog: {},
    Modal: {},
    Panel: {},
    ScrollablePane: {},
    Tooltip: {}
  },
  Utilities: {
    Announced: {
      subPages: {
        QuickActions: { title: "Quick Actions" },
        SearchResults: { title: "Search Results" },
        LazyLoading: { title: "Lazy Loading" },
        BulkOperations: { title: "Bulk Operations" }
      }
    },
    FocusTrapZone: {},
    FocusZone: {},
    Icon: {},
    Image: {},
    Keytips: {},
    Layer: {},
    MarqueeSelection: {},
    Overlay: {},
    ResizeGroup: {},
    Selection: {},
    Separator: {},
    Stack: {},
    Text: {},
    Themes: {}
  },
  "Fluent Theme": {
    FluentTheme: { title: "Fluent Theme", url: "fluent-theme" }
  },
  References: {},
  Other: {}
};

// function that will be running every time before calling api-documenter and generate a schema file
// the return of this function will write a schema that all it needs is just to fill the empty `items` arrays for each node that has one.

// in the future we can make modifications to the logic so that to include additional things
// like pages with examples that have nothing to do with the API json files
function generateConfig(stateObj) {
  const tocConfig = {
    items: [
      {
        name: "Office UI Fabric React",
        href: "~/homepage/homepage.md"
      },
      {
        name: "Office UI Fabric React",
        href: "office-ui-fabric-react",
        extended: true,
        items: []
      }
    ]
  };

  // delete unnecessary navigation items for docs.microsoft but present on the Fabric website
  delete stateObj["Fluent Theme"];
  delete stateObj["Other"];

  const categories = Object.keys(stateObj);

  for (const category of categories) {
    const configItem = {
      name: category,
      items: []
    };

    const categoryItems = Object.keys(stateObj[category]);
    for (const categoryItem of categoryItems) {
      configItem.items.push({
        name: categoryItem,
        items: []
      });
    }

    tocConfig.items[1].items.push(configItem);
  }

  // config file is what we needs to have a standardized structure of things we wanna support in customizing the TOC
  // here is just a few that might be generally useful
  const config = {
    tocConfig,
    catchAllCategory: 'References',
    noDuplicateEntries: true,
    // some possible filters to fill the leaf nodes `items` arrays.
    filterByApiItemName: false,
    filterByInlineTag: '@docCategory'
  }

  // writing file
  const json = JSON.stringify(config);
  fs.writeFileSync("api-documenter.json", json, "utf8");
}

generateConfig(categories);
