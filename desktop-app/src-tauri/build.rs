// Custom commands need an app manifest so capabilities can grant them one by one: the remote
// Aspire page gets only the brain and pairing-status commands (capabilities/remote.json), and
// each Allow / Deny window only its own two commands (capabilities/confirm.json).
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "app_status",
            "set_autostart",
            "set_lang",
            "brain_status",
            "brain_set",
            "brain_forget",
            "brain_chat",
            "local_install",
            "hermes_install",
            "hermes_run",
            "confirm_info",
            "confirm_answer",
            "pair",
            "unpair",
            "pairing_status",
        ]),
    ))
    .expect("tauri build step failed");
}
