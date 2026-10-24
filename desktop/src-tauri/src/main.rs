// Spindle for desktop: a thin, light window around https://spindle-bice.vercel.app.
// The website does the music; this adds what a browser tab can't: Discord
// "Listening to" status, media keys, a tray icon that keeps music going with
// the window closed, and low memory use while hidden.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, StatusDisplayType, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_window_state::StateFlags;

/// The Discord application whose name shows as "Listening to …". Set at build time.
const DISCORD_APP_ID: Option<&str> = option_env!("SPINDLE_DISCORD_APP_ID");
const SITE: &str = "https://spindle-bice.vercel.app";
const LOGO: &str = "https://spindle-bice.vercel.app/brand/spindle-icon-512.png";

/// What the website reports about the current song.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NowPlaying {
    title: String,
    artist: String,
    album: Option<String>,
    art: Option<String>,
    /// Seconds into the song, and its length.
    position: f64,
    duration: f64,
    playing: bool,
}

struct Shared {
    discord: Sender<Option<NowPlaying>>,
    playing: AtomicBool,
    /// A sign-in link that arrived before the page was ready.
    auth: Mutex<Option<String>>,
    /// The update found by check_update, ready to install.
    update: Mutex<Option<Update>>,
}

/// What the website shows in its update banner.
#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

// ---------- commands the website may call (capabilities/site.json) ----------

#[tauri::command]
fn now_playing(app: AppHandle, state: State<Shared>, track: Option<NowPlaying>) {
    state.playing.store(track.as_ref().is_some_and(|t| t.playing), Ordering::Relaxed);
    if let Some(tray) = app.tray_by_id("main") {
        let tip = match &track {
            Some(t) => format!("{} · {}", clip(&t.title, 60), clip(&t.artist, 40)),
            None => "Spindle".into(),
        };
        let _ = tray.set_tooltip(Some(tip));
    }
    let _ = state.discord.send(track);
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    // Only web and mail links leave the app, never files or other schemes.
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("Only web links can be opened.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_update(app: AppHandle, state: State<'_, Shared>) -> Result<Option<UpdateInfo>, String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() });
    *state.update.lock().unwrap() = update;
    Ok(info)
}

/// Downloads and installs the update found by check_update, then restarts Spindle.
#[tauri::command]
async fn install_update(app: AppHandle, state: State<'_, Shared>) -> Result<(), String> {
    let update = state.update.lock().unwrap().take().ok_or("No update to install.")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}

// ---------- signing in through the browser ----------

/// GitHub sign-in happens in the real browser (already signed in to GitHub), which
/// hands the result back through a spindle://auth link. Pass it to the page.
fn deliver_auth(app: &AppHandle, url: String) {
    if !url.starts_with("spindle://auth") {
        return;
    }
    *app.state::<Shared>().auth.lock().unwrap() = Some(url);
    flush_auth(app);
    *app.state::<Shared>().auth.lock().unwrap() = None;
    show(app);
}

fn flush_auth(app: &AppHandle) {
    let Some(url) = app.state::<Shared>().auth.lock().unwrap().clone() else { return };
    if let Some(w) = app.get_webview_window("main") {
        let js = serde_json::to_string(&url).unwrap_or_default();
        // If the page hasn't loaded its bridge yet, it picks the link up when it does.
        let _ = w.eval(format!(
            "window.spindleDesktop && window.spindleDesktop.auth ? window.spindleDesktop.auth({js}) : (window.__spindleAuth = {js})"
        ));
    }
}

// ---------- Discord ----------

fn clip(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max - 1).collect();
    out.push('…');
    out
}

/// Discord wants 2–128 characters.
fn field(s: &str) -> String {
    let s = clip(s, 128);
    if s.chars().count() < 2 {
        format!("{s}  ")
    } else {
        s
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn show_song(client: &mut DiscordIpcClient, t: &NowPlaying) -> Result<(), discord_rich_presence::error::Error> {
    let title = field(&t.title);
    let artist = field(&t.artist);
    let album = t.album.as_deref().map(field).unwrap_or_else(|| title.clone());
    let art = t.art.as_deref().filter(|a| a.starts_with("https://") && a.len() <= 256).unwrap_or(LOGO);
    let start = now_ms() - (t.position * 1000.0) as i64;
    let mut times = Timestamps::new().start(start);
    if t.duration > 0.0 {
        times = times.end(start + (t.duration * 1000.0) as i64);
    }
    client.set_activity(
        Activity::new()
            .activity_type(ActivityType::Listening)
            // "Listening to <song>" in the member list, like Spotify.
            .status_display_type(StatusDisplayType::Details)
            .details(&title)
            .state(&artist)
            .assets(Assets::new().large_image(art).large_text(&album).small_image(LOGO).small_text("Spindle"))
            .timestamps(times)
            .buttons(vec![Button::new("Listen on Spindle", SITE)]),
    )
}

/// Owns the connection to the Discord app: connects when needed, retries when
/// Discord starts later, and always shows the latest song.
fn discord_worker(rx: Receiver<Option<NowPlaying>>) {
    let Some(id) = DISCORD_APP_ID.filter(|id| !id.is_empty()) else {
        for _ in rx {} // Built without a Discord app: nothing to show.
        return;
    };
    let mut client: Option<DiscordIpcClient> = None;
    let mut latest: Option<NowPlaying> = None;
    let mut last_try = Instant::now() - Duration::from_secs(60);
    loop {
        match rx.recv_timeout(Duration::from_secs(20)) {
            Ok(next) => latest = next,
            Err(RecvTimeoutError::Timeout) if client.is_some() || latest.as_ref().map_or(true, |t| !t.playing) => continue,
            Err(RecvTimeoutError::Timeout) => {} // Playing but not connected: try again.
            Err(RecvTimeoutError::Disconnected) => break,
        }
        // Only the newest update matters after a burst (seeking, skipping).
        while let Ok(next) = rx.try_recv() {
            latest = next;
        }
        if client.is_none() {
            if latest.as_ref().map_or(true, |t| !t.playing) || last_try.elapsed() < Duration::from_secs(15) {
                continue;
            }
            last_try = Instant::now();
            let mut c = DiscordIpcClient::new(id);
            if c.connect().is_err() {
                continue; // Discord isn't open.
            }
            client = Some(c);
        }
        let c = client.as_mut().expect("connected above");
        let sent = match &latest {
            Some(t) if t.playing => show_song(c, t),
            _ => c.clear_activity(),
        };
        if sent.is_err() {
            let _ = c.close();
            client = None;
        }
    }
    if let Some(mut c) = client {
        let _ = c.clear_activity();
        let _ = c.close();
    }
}

// ---------- window ----------

/// Ask the website to do something with the player (see src/lib/desktop.ts).
fn player(app: &AppHandle, action: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval(format!("window.spindleDesktop && window.spindleDesktop.{action}()"));
    }
}

/// While hidden or minimised, the page needs very little memory or CPU: tell WebView2,
/// which pauses drawing and trims memory.
fn set_background(window: &WebviewWindow, background: bool) {
    #[cfg(windows)]
    let _ = window.with_webview(move |webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        use windows::core::Interface;
        let controller = webview.controller();
        // A hidden page stops drawing its visuals; the music keeps playing.
        let _ = controller.SetIsVisible(!background);
        if let Ok(core) = controller.CoreWebView2() {
            if let Ok(core) = core.cast::<ICoreWebView2_19>() {
                let level = if background { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
                let _ = core.SetMemoryUsageTargetLevel(level);
            }
        }
    });
    #[cfg(not(windows))]
    let _ = (window, background);
}

fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        set_background(&w, false);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn main() {
    let (discord, rx) = mpsc::channel();
    thread::spawn(move || discord_worker(rx));

    tauri::Builder::default()
        // Opening Spindle again brings the running window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    match shortcut.key {
                        Code::MediaPlayPause => player(app, "toggle"),
                        Code::MediaTrackNext => player(app, "next"),
                        Code::MediaTrackPrevious => player(app, "prev"),
                        Code::MediaStop => player(app, "pause"),
                        _ => {}
                    }
                })
                .build(),
        )
        .manage(Shared { discord, playing: AtomicBool::new(false), auth: Mutex::new(None), update: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![now_playing, open_url, check_update, install_update])
        // The window opens once the page has painted, so there's no white flash.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = webview.window().show();
                // A sign-in that's waiting goes to the freshly loaded page; it's cleared once used.
                let app = webview.app_handle().clone();
                if app.state::<Shared>().auth.lock().unwrap().is_some() {
                    flush_auth(&app);
                    *app.state::<Shared>().auth.lock().unwrap() = None;
                }
            }
        })
        .setup(|app| {
            // spindle:// links (sign-in from the browser) come here, whether Spindle was running or not.
            #[cfg(any(windows, target_os = "linux"))]
            let _ = app.deep_link().register_all();
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    deliver_auth(&handle, url.to_string());
                }
            });
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    *app.state::<Shared>().auth.lock().unwrap() = Some(url.to_string());
                }
            }

            // Media keys work even when Spindle isn't the focused window.
            for key in [Code::MediaPlayPause, Code::MediaTrackNext, Code::MediaTrackPrevious, Code::MediaStop] {
                let _ = app.global_shortcut().register(Shortcut::new(None, key));
            }

            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "Open Spindle", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "toggle", "Play / Pause", true, None::<&str>)?,
                    &MenuItem::with_id(app, "next", "Next song", true, None::<&str>)?,
                    &MenuItem::with_id(app, "prev", "Previous song", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "Quit Spindle", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .tooltip("Spindle")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show(app),
                    "quit" => app.exit(0),
                    action @ ("toggle" | "next" | "prev") => player(app, action),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing while music plays keeps it going from the tray, like Spotify.
            WindowEvent::CloseRequested { api, .. } => {
                if window.state::<Shared>().playing.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                    if let Some(w) = window.app_handle().get_webview_window("main") {
                        set_background(&w, true);
                    }
                }
            }
            WindowEvent::Resized(_) => {
                if let Some(w) = window.app_handle().get_webview_window("main") {
                    set_background(&w, w.is_minimized().unwrap_or(false));
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Spindle");
}
