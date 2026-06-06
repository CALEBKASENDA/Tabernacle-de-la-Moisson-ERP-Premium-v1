use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};

const API_PORT: u16 = 3847;

struct ApiProcess(Mutex<Option<Child>>);

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let (node, server_js, api_cwd, web_dist, data_dir) = resolve_paths(&handle)?;
            ensure_data_dir(&data_dir)?;

            let child = spawn_api(&node, &server_js, &api_cwd, &web_dist, &data_dir)?;
            if !wait_for_port(API_PORT, 45_000) {
                return Err("L'API Tabernacle n'a pas démarré à temps.".into());
            }

            app.manage(ApiProcess(Mutex::new(Some(child))));

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Erreur initialisation Tauri")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                if let Some(api) = app.try_state::<ApiProcess>() {
                    stop_api(&api.0);
                }
            }
        });
}

fn monorepo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn resolve_paths(
    app: &tauri::AppHandle,
) -> Result<(PathBuf, PathBuf, PathBuf, Option<PathBuf>, PathBuf), Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) {
        let root = monorepo_root();
        let server_js = root.join("apps").join("api").join("dist").join("server.js");
        if !server_js.exists() {
            return Err(format!(
                "API non compilée : {} — lancez npm run build -w @tabernacle/erp-premium-api",
                server_js.display()
            )
            .into());
        }
        let data_dir = root.join("data");
        Ok((
            PathBuf::from("node"),
            server_js,
            root.join("apps").join("api"),
            None,
            data_dir,
        ))
    } else {
        let resource = app.path().resource_dir()?;
        let node = resource.join("node").join("node.exe");
        let server_js = resource
            .join("app")
            .join("apps")
            .join("api")
            .join("dist")
            .join("server.js");
        let web_dist = resource.join("app").join("apps").join("desktop").join("dist");
        let data_dir = app.path().app_data_dir()?.join("data");
        Ok((node, server_js, resource.join("app").join("apps").join("api"), Some(web_dist), data_dir))
    }
}

fn ensure_data_dir(data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(data_dir)?;
    Ok(())
}

fn spawn_api(
    node: &Path,
    server_js: &Path,
    api_cwd: &Path,
    web_dist: &Option<PathBuf>,
    data_dir: &Path,
) -> Result<Child, Box<dyn std::error::Error>> {
    let mut cmd = Command::new(node);
    cmd.arg(server_js)
        .current_dir(api_cwd)
        .env("PORT", API_PORT.to_string())
        .env("HOST", "127.0.0.1")
        .env("TABERNACLE_DATA_DIR", data_dir)
        .env("NODE_ENV", "production")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(dist) = web_dist {
        if dist.exists() {
            cmd.env("WEB_DIST_DIR", dist);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn()?;
    Ok(child)
}

fn wait_for_port(port: u16, timeout_ms: u64) -> bool {
    let start = Instant::now();
    while (start.elapsed().as_millis() as u64) < timeout_ms {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn stop_api(api: &Mutex<Option<Child>>) {
    if let Ok(mut guard) = api.lock() {
        if let Some(mut child) = guard.take() {
            let pid = child.id();
            #[cfg(windows)]
            {
                drop(child);
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .status();
            }
            #[cfg(not(windows))]
            {
                let _ = child.kill();
            }
        }
    }
}
