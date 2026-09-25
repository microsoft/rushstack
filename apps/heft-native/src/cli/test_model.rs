use super::model::{AliasModel, CliModel, DefaultValue, ParameterKind, PhaseModel, PluginModel, PluginParameterDefinition};

pub fn leak(text: String) -> &'static str {
    Box::leak(text.into_boxed_str())
}

pub fn percent_decode(text: &str) -> &'static str {
    let bytes: &[u8] = text.as_bytes();
    let mut decoded: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index: usize = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex: &str = &text[index + 1..index + 3];
            decoded.push(u8::from_str_radix(hex, 16).expect("hex"));
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    leak(String::from_utf8(decoded).expect("utf8"))
}

pub fn optional_field(field: &str) -> Option<&'static str> {
    field.strip_prefix('=').map(percent_decode)
}

pub fn list_field(field: &str) -> Vec<&'static str> {
    if field.is_empty() { Vec::new() } else { field.split(',').map(percent_decode).collect() }
}

fn index_list(field: &str) -> Vec<usize> {
    if field.is_empty() { Vec::new() } else { field.split(',').map(|item| item.parse().expect("index")).collect() }
}

fn parameter_kind(text: &str) -> ParameterKind {
    match text {
        "flag" => ParameterKind::Flag,
        "string" => ParameterKind::String,
        "stringList" => ParameterKind::StringList,
        "integer" => ParameterKind::Integer,
        "integerList" => ParameterKind::IntegerList,
        "choice" => ParameterKind::Choice,
        "choiceList" => ParameterKind::ChoiceList,
        other => panic!("unknown kind {other}"),
    }
}

fn default_value(field: &str) -> Option<DefaultValue<'static>> {
    match field.split_at_checked(1) {
        Some(("T", rest)) => optional_field(rest).map(DefaultValue::Text),
        Some(("N", rest)) => optional_field(rest).map(|number| DefaultValue::Number(number.parse().expect("number"))),
        _ => None,
    }
}

pub fn load_model(text: &str) -> CliModel<'static> {
    let mut model: CliModel<'static> = CliModel::default();
    for line in text.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        match fields[0] {
            "L" => model.lifecycle_plugin_indices = index_list(fields[1]),
            "G" => model.plugins.push(PluginModel {
                plugin_name: optional_field(fields[2]).expect("name"),
                package_name: optional_field(fields[3]).expect("package"),
                parameter_scope: optional_field(fields[4]).expect("scope"),
                parameters: Vec::new(),
            }),
            "Q" => {
                let plugin_index: usize = fields[1].parse().expect("plugin index");
                model.plugins[plugin_index].parameters.push(PluginParameterDefinition {
                    kind: parameter_kind(fields[2]),
                    long_name: optional_field(fields[3]).expect("long name"),
                    short_name: optional_field(fields[4]),
                    description: optional_field(fields[5]).unwrap_or(""),
                    required: fields[6] == "1",
                    argument_name: optional_field(fields[7]),
                    alternatives: list_field(fields[8]),
                    default_value: default_value(fields[9]),
                });
            }
            "F" => model.phases.push(PhaseModel {
                name: optional_field(fields[1]).expect("phase"),
                description: optional_field(fields[2]),
                dependency_names: list_field(fields[3]),
                task_plugin_indices: index_list(fields[4]),
            }),
            "A" => model.aliases.push(AliasModel {
                name: optional_field(fields[1]).expect("alias"),
                action_name: optional_field(fields[2]).expect("action"),
                default_parameters: list_field(fields[3]),
            }),
            "D" => model.debug_messages.push(optional_field(fields[1]).expect("debug message")),
            other => panic!("unknown line {other}"),
        }
    }
    model
}
