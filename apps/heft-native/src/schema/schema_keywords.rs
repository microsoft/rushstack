use crate::json::{JsonObject, JsonValue};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Keyword {
    Type,
    Enum,
    Const,
    Properties,
    PatternProperties,
    AdditionalProperties,
    Required,
    Items,
    MinItems,
    MaxItems,
    UniqueItems,
    Contains,
    MinLength,
    MaxLength,
    Pattern,
    Minimum,
    Maximum,
    ExclusiveMinimum,
    ExclusiveMaximum,
    MultipleOf,
    MinProperties,
    MaxProperties,
    Dependencies,
    PropertyNames,
    AllOf,
    AnyOf,
    OneOf,
    Not,
    If,
    Then,
    Else,
    Reference,
    Definitions,
    DollarDefinitions,
    Comment,
    Schema,
    Title,
    Description,
    Default,
    Examples,
    ReadOnly,
    WriteOnly,
    Deprecated,
    ContentMediaType,
    ContentEncoding,
    Identifier,
    DollarIdentifier,
}

const KEYWORD_COUNT: usize = Keyword::DollarIdentifier as usize + 1;

fn keyword_for_key(key: &str) -> Option<Keyword> {
    Some(match key {
        "type" => Keyword::Type,
        "enum" => Keyword::Enum,
        "const" => Keyword::Const,
        "properties" => Keyword::Properties,
        "patternProperties" => Keyword::PatternProperties,
        "additionalProperties" => Keyword::AdditionalProperties,
        "required" => Keyword::Required,
        "items" => Keyword::Items,
        "minItems" => Keyword::MinItems,
        "maxItems" => Keyword::MaxItems,
        "uniqueItems" => Keyword::UniqueItems,
        "contains" => Keyword::Contains,
        "minLength" => Keyword::MinLength,
        "maxLength" => Keyword::MaxLength,
        "pattern" => Keyword::Pattern,
        "minimum" => Keyword::Minimum,
        "maximum" => Keyword::Maximum,
        "exclusiveMinimum" => Keyword::ExclusiveMinimum,
        "exclusiveMaximum" => Keyword::ExclusiveMaximum,
        "multipleOf" => Keyword::MultipleOf,
        "minProperties" => Keyword::MinProperties,
        "maxProperties" => Keyword::MaxProperties,
        "dependencies" => Keyword::Dependencies,
        "propertyNames" => Keyword::PropertyNames,
        "allOf" => Keyword::AllOf,
        "anyOf" => Keyword::AnyOf,
        "oneOf" => Keyword::OneOf,
        "not" => Keyword::Not,
        "if" => Keyword::If,
        "then" => Keyword::Then,
        "else" => Keyword::Else,
        "$ref" => Keyword::Reference,
        "definitions" => Keyword::Definitions,
        "$defs" => Keyword::DollarDefinitions,
        "$comment" => Keyword::Comment,
        "$schema" => Keyword::Schema,
        "title" => Keyword::Title,
        "description" => Keyword::Description,
        "default" => Keyword::Default,
        "examples" => Keyword::Examples,
        "readOnly" => Keyword::ReadOnly,
        "writeOnly" => Keyword::WriteOnly,
        "deprecated" => Keyword::Deprecated,
        "contentMediaType" => Keyword::ContentMediaType,
        "contentEncoding" => Keyword::ContentEncoding,
        "id" => Keyword::Identifier,
        "$id" => Keyword::DollarIdentifier,
        _ => return None,
    })
}

fn keyword_is_known_to_draft_04(keyword: Keyword) -> bool {
    !matches!(
        keyword,
        Keyword::Examples
            | Keyword::ReadOnly
            | Keyword::WriteOnly
            | Keyword::Deprecated
            | Keyword::ContentMediaType
            | Keyword::ContentEncoding
    )
}

pub(super) struct SchemaKeywordValues<'schema> {
    values: [Option<&'schema JsonValue<'schema>>; KEYWORD_COUNT],
}

impl<'schema> SchemaKeywordValues<'schema> {
    pub(super) fn gather_known_to_ajv(
        object: &'schema JsonObject<'schema>,
        is_draft_04: bool,
        is_root: bool,
        vendor_keywords: &[&str],
    ) -> Option<Self> {
        let mut gathered = SchemaKeywordValues {
            values: [None; KEYWORD_COUNT],
        };
        for (key, value) in object.entries() {
            match keyword_for_key(key) {
                Some(Keyword::Identifier | Keyword::DollarIdentifier) if !is_root => return None,
                Some(keyword) if is_draft_04 && !keyword_is_known_to_draft_04(keyword) => {
                    return None
                }
                Some(keyword) => gathered.values[keyword as usize] = Some(value),
                None if vendor_keywords.contains(&key.as_ref()) => {}
                None => return None,
            }
        }
        Some(gathered)
    }

    pub(super) fn value(&self, keyword: Keyword) -> Option<&'schema JsonValue<'schema>> {
        self.values[keyword as usize]
    }

    pub(super) fn has(&self, keyword: Keyword) -> bool {
        self.values[keyword as usize].is_some()
    }
}
