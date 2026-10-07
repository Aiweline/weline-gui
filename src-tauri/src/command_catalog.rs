use crate::models::{ConsoleCommandCatalog, ConsoleCommandGroup, ConsoleCommandItem};
use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::BTreeMap;

/// Build a searchable command tree from `generated/commands.php` JSON (after PHP `include`).
pub fn catalog_from_commands_php_value(raw: &Value) -> Result<ConsoleCommandCatalog> {
    let object = raw
        .as_object()
        .context("generated/commands.php did not return an object")?;
    let mut grouped: BTreeMap<String, Vec<ConsoleCommandItem>> = BTreeMap::new();

    for (group_key, entries) in object {
        let Some(entries) = entries.as_object() else {
            continue;
        };
        let group = group_key
            .split_once('#')
            .map(|(prefix, _)| prefix)
            .unwrap_or(group_key.as_str())
            .trim()
            .to_string();
        if group.is_empty() {
            continue;
        }
        for (name, info) in entries {
            let Some(info) = info.as_object() else {
                continue;
            };
            let tip = info
                .get("tip")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let module = info
                .get("module")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            grouped.entry(group.clone()).or_default().push(ConsoleCommandItem {
                name: name.clone(),
                tip,
                module,
                group: group.clone(),
            });
        }
    }

    let mut groups = Vec::with_capacity(grouped.len());
    let mut commands = Vec::new();
    for (id, mut items) in grouped {
        items.sort_by(|left, right| left.name.cmp(&right.name));
        commands.extend(items.iter().cloned());
        groups.push(ConsoleCommandGroup {
            id: id.clone(),
            label: id,
            commands: items,
        });
    }
    commands.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(ConsoleCommandCatalog {
        groups,
        commands,
        count: 0, // filled below
    }
    .with_count())
}

trait WithCount {
    fn with_count(self) -> Self;
}

impl WithCount for ConsoleCommandCatalog {
    fn with_count(mut self) -> Self {
        self.count = self.commands.len();
        self
    }
}

pub fn catalog_from_commands_php_json(json: &str) -> Result<ConsoleCommandCatalog> {
    let raw: Value = serde_json::from_str(json).context("invalid commands.php JSON dump")?;
    catalog_from_commands_php_value(&raw)
}

/// Dump script: include generated/commands.php and print JSON (path via env).
pub const DUMP_COMMANDS_PHP_SCRIPT: &str = r#"
$path = getenv('WELINE_COMMANDS_PATH');
if ($path === false || $path === '' || !is_file($path)) {
    fwrite(STDERR, "commands.php missing\n");
    exit(1);
}
$raw = include $path;
if (!is_array($raw)) {
    fwrite(STDERR, "commands.php invalid\n");
    exit(2);
}
echo json_encode($raw, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_tree_from_grouped_commands_php() {
        let json = r#"{
            "server#Weline_Server": {
                "server:status": {"tip": "状态", "module": "Weline_Server"},
                "server:start": {"tip": "启动", "module": "Weline_Server"}
            },
            "cache#Weline_Framework": {
                "cache:clear": {"tip": "清缓存", "module": "Weline_Framework"}
            },
            "user:reset#Weline_Backend": {
                "user:reset:password": {"tip": "重置", "module": "Weline_Backend"}
            }
        }"#;
        let catalog = catalog_from_commands_php_json(json).expect("catalog");
        assert_eq!(catalog.count, 4);
        assert_eq!(catalog.groups.len(), 3);
        let server = catalog
            .groups
            .iter()
            .find(|group| group.id == "server")
            .expect("server group");
        assert_eq!(server.commands.len(), 2);
        assert_eq!(server.commands[0].name, "server:start");
        let reset = catalog
            .groups
            .iter()
            .find(|group| group.id == "user:reset")
            .expect("user:reset group");
        assert_eq!(reset.commands[0].name, "user:reset:password");
    }
}
