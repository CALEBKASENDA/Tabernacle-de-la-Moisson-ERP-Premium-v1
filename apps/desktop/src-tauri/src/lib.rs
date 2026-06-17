use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Manager, RunEvent, State};

struct ApiBridge(Mutex<ApiBridgeInner>);

struct ApiBridgeInner {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<std::process::ChildStdout>,
    next_id: u64,
}

#[derive(Serialize)]
struct OutgoingRequest<'a> {
    id: u64,
    method: &'a str,
    path: &'a str,
    headers: &'a HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<&'a str>,
}

#[derive(Deserialize)]
struct IncomingResponse {
    id: serde_json::Value,
    ok: bool,
    #[serde(default)]
    status_code: Option<u16>,
    #[serde(default)]
    headers: Option<HashMap<String, String>>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    ready: Option<bool>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[cfg(windows)]
fn show_fatal_error(message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            text: *const u16,
            caption: *const u16,
            utype: u32,
        ) -> i32;
    }

    fn to_wide(value: &str) -> Vec<u16> {
        OsStr::new(value).encode_wide().chain(Some(0)).collect()
    }

    let text = to_wide(message);
    let caption = to_wide("Tabernacle de la Moisson ERP");
    unsafe {
        MessageBoxW(ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x10);
    }
}

/// Dossier contenant l'exécutable (Tauri `resource_dir` sur Windows, pas `executable_dir`).
fn install_root_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .ok()
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf))
        })
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(err) = try_setup(&handle) {
                let message = format!("Echec demarrage : {err}");
                if let Ok((data_dir, _, _)) = resolve_install_dirs(&handle) {
                    append_boot_log(&data_dir, &message);
                }
                eprintln!("Tabernacle ERP — {message}");
                #[cfg(windows)]
                show_fatal_error(&format!(
                    "{err}\n\nConsultez data\\tauri-boot.log dans le dossier d'installation."
                ));
                std::process::exit(1);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![api_request])
        .build(tauri::generate_context!())
        .expect("Erreur initialisation Tauri")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                if let Some(api) = app.try_state::<ApiBridge>() {
                    stop_api(&api.0);
                }
            }
        });
}

fn try_setup(app: &tauri::AppHandle) -> Result<(), String> {
    let bridge = spawn_embedded_api(app).map_err(|e| e.to_string())?;
    app.manage(ApiBridge(Mutex::new(bridge)));
    Ok(())
}

#[tauri::command]
fn api_request(
    bridge: State<'_, ApiBridge>,
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<ApiResponse, String> {
    let mut inner = bridge.0.lock().map_err(|_| "Pont API indisponible".to_string())?;
    inner.request(&method, &path, &headers, body.as_deref())
}

fn monorepo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn append_boot_log(data_dir: &Path, message: &str) {
    let _ = (|| -> Result<(), Box<dyn std::error::Error>> {
        std::fs::create_dir_all(data_dir)?;
        let path = data_dir.join("tauri-boot.log");
        let mut file = OpenOptions::new().create(true).append(true).open(path)?;
        let stamp = chrono_lite_now();
        writeln!(file, "[{stamp}] {message}")?;
        Ok(())
    })();
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}

fn resolve_resource_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let embedded_rel = Path::new("app")
        .join("apps")
        .join("api")
        .join("dist")
        .join("embedded.js");

    let install_root = install_root_dir(app).ok_or_else(|| {
        "Ressources API introuvables (dossier executable). Reinstallez Tabernacle ERP.".to_string()
    })?;

    let mut tried = Vec::new();
    for base in [install_root.join("resources"), install_root.clone()] {
        let candidate = base.join(&embedded_rel);
        tried.push(candidate.display().to_string());
        if candidate.exists() {
            return Ok(base);
        }
    }

    if let Ok((data_dir, _, _)) = resolve_install_dirs(app) {
        append_boot_log(
            &data_dir,
            &format!("API embarquee introuvable. Chemins testes : {}", tried.join(" | ")),
        );
    }

    Err("Ressources API introuvables (node/app). Reinstallez Tabernacle ERP.".into())
}

fn resolve_embedded_paths(
    app: &tauri::AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) {
        let root = monorepo_root();
        let embedded_js = root
            .join("apps")
            .join("api")
            .join("dist")
            .join("embedded.js");
        if !embedded_js.exists() {
            return Err(format!(
                "API embarquée non compilée : {} — lancez npm run build -w @tabernacle/erp-premium-api",
                embedded_js.display()
            )
            .into());
        }
        Ok((
            PathBuf::from("node"),
            embedded_js,
            root.join("apps").join("api"),
            root.join("data"),
        ))
    } else {
        let resource = resolve_resource_root(app).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
        let node = resource.join("node").join("node.exe");
        let embedded_js = resource
            .join("app")
            .join("apps")
            .join("api")
            .join("dist")
            .join("embedded.js");
        let api_cwd = resource.join("app").join("apps").join("api");

        let (data_dir, _, _) = resolve_install_dirs(app)?;
        if !node.exists() {
            return Err(format!("Node embarque introuvable : {}", node.display()).into());
        }
        if !embedded_js.exists() {
            return Err(format!("API embarquee introuvable : {}", embedded_js.display()).into());
        }
        Ok((node, embedded_js, api_cwd, data_dir))
    }
}

fn resolve_install_dirs(
    app: &tauri::AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf), Box<dyn std::error::Error>> {
    if let Some(install_root) = install_root_dir(app) {
        let data_dir = install_root.join("data");
        let config_dir = install_root.join("config");
        std::fs::create_dir_all(&data_dir)?;
        std::fs::create_dir_all(&config_dir)?;
        return Ok((data_dir, config_dir, install_root));
    }

    let app_data = app.path().app_data_dir()?;
    let data_dir = app_data.join("data");
    let config_dir = app_data.join("config");
    std::fs::create_dir_all(&data_dir)?;
    std::fs::create_dir_all(&config_dir)?;
    Ok((data_dir, config_dir, app_data))
}

/// Chemins sans préfixe `\\?\` — Node.js ne les gère pas correctement sous Windows.
fn path_for_subprocess(path: &Path) -> PathBuf {
    let rendered = path.to_string_lossy();
    let normalized = rendered.strip_prefix(r"\\?\").unwrap_or(&rendered);
    PathBuf::from(normalized)
}

fn apply_config_env(cmd: &mut Command, env_file: &Path) {
    let Ok(raw) = std::fs::read_to_string(env_file) else {
        return;
    };
    let content = raw.trim_start_matches('\u{FEFF}');
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        let key = key.trim().trim_start_matches('\u{FEFF}');
        let mut value = value.trim().to_string();
        if (value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\''))
        {
            value = value[1..value.len() - 1].to_string();
        }
        if key.starts_with("TABERNACLE_BOOTSTRAP_")
            || key == "TABERNACLE_DB_KEY"
            || key == "TABERNACLE_JWT_SECRET"
            || key == "TABERNACLE_CHURCH_ID"
            || key == "TABERNACLE_CHURCH_NAME"
        {
            cmd.env(key, value);
        }
    }
}

fn spawn_embedded_api(app: &tauri::AppHandle) -> Result<ApiBridgeInner, Box<dyn std::error::Error>> {
    let (node, embedded_js, api_cwd, data_dir) = resolve_embedded_paths(app)?;
    let (_, config_dir, install_root) = resolve_install_dirs(app)?;
    std::fs::create_dir_all(&data_dir)?;

    let node = path_for_subprocess(&node);
    let embedded_js = path_for_subprocess(&embedded_js);
    let api_cwd = path_for_subprocess(&api_cwd);

    let env_file = config_dir.join(".env");
    let env_template = config_dir.join("env.template");
    if !env_file.exists() {
        if let Ok(resource) = resolve_resource_root(app) {
            let bundled_template = resource.join("config").join("env.template");
            if bundled_template.exists() {
                std::fs::create_dir_all(&config_dir)?;
                std::fs::copy(&bundled_template, &env_file)?;
            }
        } else if env_template.exists() {
            std::fs::copy(&env_template, &env_file)?;
        }
    }

    let stderr_log = data_dir.join("api-embedded-stderr.log");
    let stderr_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&stderr_log)
        .ok();

    let mut cmd = Command::new(&node);
    cmd.arg(&embedded_js)
        .current_dir(&api_cwd)
        .env("TABERNACLE_EMBEDDED", "1")
        .env("TABERNACLE_DATA_DIR", path_for_subprocess(&data_dir))
        .env("TABERNACLE_INSTALL_ROOT", path_for_subprocess(&install_root))
        .env("NODE_ENV", "production")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(if stderr_file.is_some() {
            Stdio::from(stderr_file.unwrap())
        } else {
            Stdio::piped()
        });

    if env_file.exists() {
        cmd.env("TABERNACLE_ENV_FILE", path_for_subprocess(&env_file));
        apply_config_env(&mut cmd, &env_file);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn()?;
    let stdin = child.stdin.take().ok_or("stdin API indisponible")?;
    let stdout = child.stdout.take().ok_or("stdout API indisponible")?;
    let mut reader = BufReader::new(stdout);

    let mut ready_line = String::new();
    for _ in 0..200 {
        ready_line.clear();
        if reader.read_line(&mut ready_line)? == 0 {
            append_boot_log(
                &data_dir,
                &format!(
                    "API embarquee arretee. Voir {}",
                    stderr_log.display()
                ),
            );
            return Err("Processus API embarquée arrêté avant signal ready".into());
        }
        if let Ok(resp) = serde_json::from_str::<IncomingResponse>(ready_line.trim()) {
            if resp.ready == Some(true) && resp.ok {
                return Ok(ApiBridgeInner {
                    child,
                    stdin,
                    reader,
                    next_id: 1,
                });
            }
            if let Some(err) = resp.error {
                return Err(err.into());
            }
        }
    }

    Err("L'API embarquée n'a pas signalé sa disponibilité".into())
}

impl ApiBridgeInner {
    fn request(
        &mut self,
        method: &str,
        path: &str,
        headers: &HashMap<String, String>,
        body: Option<&str>,
    ) -> Result<ApiResponse, String> {
        let id = self.next_id;
        self.next_id += 1;

        let outgoing = OutgoingRequest {
            id,
            method,
            path,
            headers,
            body,
        };

        let payload = serde_json::to_string(&outgoing).map_err(|e| e.to_string())?;
        writeln!(self.stdin, "{payload}").map_err(|e| e.to_string())?;
        self.stdin.flush().map_err(|e| e.to_string())?;

        let mut line = String::new();
        self.reader.read_line(&mut line).map_err(|e| e.to_string())?;
        let resp: IncomingResponse =
            serde_json::from_str(line.trim()).map_err(|e| format!("Réponse API invalide : {e}"))?;

        if !resp.ok {
            return Err(resp
                .error
                .unwrap_or_else(|| "Erreur API embarquée".to_string()));
        }

        Ok(ApiResponse {
            status: resp.status_code.unwrap_or(500),
            body: resp.body.unwrap_or_default(),
            headers: resp.headers.unwrap_or_default(),
        })
    }
}

fn stop_api(api: &Mutex<ApiBridgeInner>) {
    if let Ok(mut guard) = api.lock() {
        let pid = guard.child.id();
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = guard.child.kill();
        }
    }
}
