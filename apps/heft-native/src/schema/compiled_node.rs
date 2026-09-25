use crate::json::JsonValue;

pub(super) type NodeIdentifier = u32;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum NodeKind {
    Regular,
    AlwaysValid,
    AlwaysInvalid,
}

pub(super) enum DependencyRequirement<'schema> {
    RequiredPropertyNames(Vec<&'schema str>),
    Subschema(NodeIdentifier),
}

#[derive(Default)]
pub(super) struct UncommonKeywordConstraints<'schema> {
    pub(super) const_value: Option<&'schema JsonValue<'schema>>,
    pub(super) minimum: Option<f64>,
    pub(super) maximum: Option<f64>,
    pub(super) exclusive_minimum: Option<f64>,
    pub(super) exclusive_maximum: Option<f64>,
    pub(super) multiple_of: Option<f64>,
    pub(super) min_length: Option<u64>,
    pub(super) max_length: Option<u64>,
    pub(super) min_items: Option<u64>,
    pub(super) max_items: Option<u64>,
    pub(super) unique_items: bool,
    pub(super) contains: Option<NodeIdentifier>,
    pub(super) min_properties: Option<u64>,
    pub(super) max_properties: Option<u64>,
    pub(super) pattern_properties: Option<Vec<(usize, NodeIdentifier)>>,
    pub(super) dependencies: Option<Vec<(&'schema str, DependencyRequirement<'schema>)>>,
    pub(super) property_names: Option<NodeIdentifier>,
    pub(super) any_of: Option<Vec<NodeIdentifier>>,
    pub(super) one_of: Option<Vec<NodeIdentifier>>,
    pub(super) not: Option<NodeIdentifier>,
    pub(super) if_schema: Option<NodeIdentifier>,
    pub(super) then_schema: Option<NodeIdentifier>,
    pub(super) else_schema: Option<NodeIdentifier>,
}

impl UncommonKeywordConstraints<'_> {
    fn constrains_anything(&self) -> bool {
        self.const_value.is_some()
            || [
                self.minimum,
                self.maximum,
                self.exclusive_minimum,
                self.exclusive_maximum,
            ]
            .iter()
            .any(Option::is_some)
            || self.multiple_of.is_some()
            || [
                self.min_length,
                self.max_length,
                self.min_items,
                self.max_items,
            ]
            .iter()
            .any(Option::is_some)
            || self.unique_items
            || [self.min_properties, self.max_properties]
                .iter()
                .any(Option::is_some)
            || self.pattern_properties.is_some()
            || self.dependencies.is_some()
            || self.any_of.is_some()
            || self.one_of.is_some()
            || [
                self.contains,
                self.property_names,
                self.not,
                self.if_schema,
                self.then_schema,
                self.else_schema,
            ]
            .iter()
            .any(Option::is_some)
    }
}

pub(super) struct CompiledSchemaNode<'schema> {
    pub(super) kind: NodeKind,
    pub(super) allowed_type_bits: u8,
    pub(super) items: Option<NodeIdentifier>,
    pub(super) additional_properties: Option<NodeIdentifier>,
    pub(super) reference: Option<NodeIdentifier>,
    pub(super) pattern_regex_index: Option<usize>,
    pub(super) enum_values: Option<&'schema [JsonValue<'schema>]>,
    pub(super) required: Option<Vec<&'schema str>>,
    pub(super) properties: Option<Vec<(&'schema str, NodeIdentifier)>>,
    pub(super) all_of: Option<Vec<NodeIdentifier>>,
    pub(super) uncommon: Option<Box<UncommonKeywordConstraints<'schema>>>,
}

pub(super) struct SchemaNodeUnderConstruction<'schema> {
    pub(super) kind: NodeKind,
    pub(super) allowed_type_bits: u8,
    pub(super) items: Option<NodeIdentifier>,
    pub(super) additional_properties: Option<NodeIdentifier>,
    pub(super) reference: Option<NodeIdentifier>,
    pub(super) pattern_regex_index: Option<usize>,
    pub(super) enum_values: Option<&'schema [JsonValue<'schema>]>,
    pub(super) required: Option<Vec<&'schema str>>,
    pub(super) properties: Option<Vec<(&'schema str, NodeIdentifier)>>,
    pub(super) all_of: Option<Vec<NodeIdentifier>>,
    pub(super) uncommon: UncommonKeywordConstraints<'schema>,
}

impl<'schema> SchemaNodeUnderConstruction<'schema> {
    pub(super) fn of_kind(kind: NodeKind) -> Self {
        SchemaNodeUnderConstruction {
            kind,
            allowed_type_bits: 0,
            items: None,
            additional_properties: None,
            reference: None,
            pattern_regex_index: None,
            enum_values: None,
            required: None,
            properties: None,
            all_of: None,
            uncommon: UncommonKeywordConstraints::default(),
        }
    }

    pub(super) fn into_compiled_node(self) -> CompiledSchemaNode<'schema> {
        CompiledSchemaNode {
            kind: self.kind,
            allowed_type_bits: self.allowed_type_bits,
            items: self.items,
            additional_properties: self.additional_properties,
            reference: self.reference,
            pattern_regex_index: self.pattern_regex_index,
            enum_values: self.enum_values,
            required: self.required,
            properties: self.properties,
            all_of: self.all_of,
            uncommon: if self.uncommon.constrains_anything() {
                Some(Box::new(self.uncommon))
            } else {
                None
            },
        }
    }
}
