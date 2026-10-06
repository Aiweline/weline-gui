use weline_gui_lib::command_policy::parse_framework_command;
use weline_gui_lib::discover::github_owner_repo;
use weline_gui_lib::update::is_newer_release;

#[test]
fn framework_console_never_invokes_a_shell() {
    let parsed = parse_framework_command("php bin/w server:status --doctor --json")
        .expect("safe framework command should parse");
    assert_eq!(parsed.program, "php");
    assert_eq!(parsed.args[0], "bin/w");
    assert!(parse_framework_command("php bin/w cache:clear; rm -rf /tmp/example").is_err());
    assert!(parse_framework_command("curl https://example.com").is_err());
}

#[test]
fn github_release_comparison_uses_semver() {
    assert!(is_newer_release("0.1.0", "v0.2.0").unwrap());
    assert!(!is_newer_release("1.2.0", "v1.2.0").unwrap());
    assert!(!is_newer_release("2.0.0", "v1.9.9").unwrap());
}

#[test]
fn github_urls_collapse_to_owner_repository() {
    assert_eq!(
        github_owner_repo("git@github.com:aiweline/weline.git").as_deref(),
        Some("aiweline/weline")
    );
}
