use thiserror::Error;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedFrameworkCommand {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Debug, Error)]
pub enum CommandPolicyError {
    #[error("command is empty")]
    Empty,
    #[error("command is too long")]
    TooLong,
    #[error("shell operators and substitutions are not allowed")]
    ShellSyntax,
    #[error("only `php bin/w …` framework commands are allowed")]
    NotFrameworkCommand,
    #[error("command has too many arguments")]
    TooManyArguments,
    #[error("command contains invalid quoting")]
    InvalidQuoting,
}

pub fn parse_framework_command(input: &str) -> Result<ParsedFrameworkCommand, CommandPolicyError> {
    let command = input.trim();
    if command.is_empty() {
        return Err(CommandPolicyError::Empty);
    }
    if command.len() > 4096 {
        return Err(CommandPolicyError::TooLong);
    }
    if command.chars().any(|character| {
        matches!(
            character,
            ';' | '&' | '|' | '`' | '$' | '<' | '>' | '\n' | '\r' | '\0'
        )
    }) {
        return Err(CommandPolicyError::ShellSyntax);
    }

    let tokens = shlex::split(command).ok_or(CommandPolicyError::InvalidQuoting)?;
    if tokens.len() > 64 {
        return Err(CommandPolicyError::TooManyArguments);
    }
    let normalized = tokens
        .iter()
        .map(|token| token.replace('\\', "/"))
        .collect::<Vec<_>>();

    if normalized.first().is_some_and(|program| {
        program == "php"
            || program == "php.exe"
            || program.ends_with("/php")
            || program.ends_with("/php.exe")
    }) && normalized.get(1).is_some_and(|entry| entry == "bin/w")
    {
        return Ok(ParsedFrameworkCommand {
            program: tokens[0].clone(),
            args: tokens[1..].to_vec(),
        });
    }

    if normalized.first().is_some_and(|entry| entry == "bin/w") {
        return Ok(ParsedFrameworkCommand {
            program: "php".to_string(),
            args: tokens,
        });
    }

    Err(CommandPolicyError::NotFrameworkCommand)
}
