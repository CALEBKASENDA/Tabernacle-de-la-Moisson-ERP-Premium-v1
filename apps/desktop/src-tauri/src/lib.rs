use std::collections::HashMap;
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

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let bridge = spawn_embedded_api(&handle)?;
            app.manage(ApiBridge(Mutex::new(bridge)));
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
        let resource = app.path().resource_dir()?;
        let node = resource.join("node").join("node.exe");
        let embedded_js = resource
            .join("app")
            .join("apps")
            .join("api")
            .join("dist")
            .join("embedded.js");

        let (data_dir, config_dir, install_root) = resolve_install_dirs(app)?;
        let _ = (config_dir, install_root);
        Ok((node, embedded_js, resource.join("app").join("apps").join("api"), data_dir))
    }
}

fn resolve_install_dirs(
    app: &tauri::AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf), Box<dyn std::error::Error>> {
    if let Ok(exe_dir) = app.path().executable_dir() {
        let install_root = exe_dir.clone();
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

fn spawn_embedded_api(app: &tauri::AppHandle) -> Result<ApiBridgeInner, Box<dyn std::error::Error>> {
    let (node, embedded_js, api_cwd, data_dir) = resolve_embedded_paths(app)?;
    let (_, config_dir, install_root) = resolve_install_dirs(app)?;
    std::fs::create_dir_all(&data_dir)?;

    let env_file = config_dir.join(".env");
    let env_template = config_dir.join("env.template");
    if !env_file.exists() {
        if let Ok(resource) = app.path().resource_dir() {
            let bundled_template = resource.join("config").join("env.template");
            if bundled_template.exists() {
                std::fs::create_dir_all(&config_dir)?;
                std::fs::copy(&bundled_template, &env_file)?;
            }
        } else if env_template.exists() {
            std::fs::copy(&env_template, &env_file)?;
        }
    }

    let mut cmd = Command::new(&node);
    cmd.arg(&embedded_js)
        .current_dir(&api_cwd)
        .env("TABERNACLE_EMBEDDED", "1")
        .env("TABERNACLE_DATA_DIR", &data_dir)
        .env("TABERNACLE_INSTALL_ROOT", &install_root)
        .env("NODE_ENV", "production")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    if env_file.exists() {
        cmd.env("TABERNACLE_ENV_FILE", &env_file);
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
