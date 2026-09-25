use std::borrow::Cow;

#[derive(Debug, Clone, PartialEq)]
pub enum JsonValue<'text> {
    Null,
    Boolean(bool),
    Number(JsonNumber<'text>),
    String(Cow<'text, str>),
    Array(Vec<JsonValue<'text>>),
    Object(JsonObject<'text>),
}

#[derive(Debug, Clone, Copy)]
pub struct JsonNumber<'text> {
    pub value: f64,
    pub source_text: &'text str,
}

impl PartialEq for JsonNumber<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.value == other.value
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct JsonObject<'text> {
    pub(super) entries: Vec<(Cow<'text, str>, JsonValue<'text>)>,
}

impl<'text> JsonObject<'text> {
    pub fn with_capacity(capacity: usize) -> Self {
        JsonObject {
            entries: Vec::with_capacity(capacity),
        }
    }

    pub fn get(&self, key: &str) -> Option<&JsonValue<'text>> {
        self.entries
            .iter()
            .find(|(existing_key, _)| existing_key.as_ref() == key)
            .map(|(_, value)| value)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.entries
            .iter()
            .any(|(existing_key, _)| existing_key.as_ref() == key)
    }

    pub fn entries(&self) -> &[(Cow<'text, str>, JsonValue<'text>)] {
        &self.entries
    }

    pub fn into_entries(self) -> Vec<(Cow<'text, str>, JsonValue<'text>)> {
        self.entries
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn set_keeping_first_position(&mut self, key: Cow<'text, str>, value: JsonValue<'text>) {
        match self
            .entries
            .iter_mut()
            .find(|(existing_key, _)| existing_key.as_ref() == key.as_ref())
        {
            Some(existing_entry) => existing_entry.1 = value,
            None => self.entries.push((key, value)),
        }
    }
}

impl<'text> JsonValue<'text> {
    pub fn as_object(&self) -> Option<&JsonObject<'text>> {
        match self {
            JsonValue::Object(object) => Some(object),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[JsonValue<'text>]> {
        match self {
            JsonValue::Array(items) => Some(items),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsonValue::String(text) => Some(text),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            JsonValue::Number(number) => Some(number.value),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            JsonValue::Boolean(flag) => Some(*flag),
            _ => None,
        }
    }

    pub fn get(&self, key: &str) -> Option<&JsonValue<'text>> {
        self.as_object().and_then(|object| object.get(key))
    }
}
