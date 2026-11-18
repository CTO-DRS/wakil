# Model storage contract

Where Rafeeq's downloaded model files live, why, and how they move. Introduced in v0.21.0 after a device report showed models vanishing on every update install.

## The problem

The app keeps models in its internal files directory (`Paths.document`, which ExpoModules maps to Android's `context.filesDir`). That directory **survives an APK update** — the audit that proved it:

- the signing certificate is byte-identical across every release since v0.1.0 (verified by parsing the v3.1 APK signing blocks of the released artifacts),
- the package id (`com.drsai.rafeeq`) and the versionCode never moved backwards,
- no release ever renamed the models folder or the persisted store key.

So a plain in-place update never erases models. What *does* erase them: uninstalling before installing an update (a common habit when an installer complains), tapping "Clear data", and the aggressive device cleaners that Transsion/XOS phones ship — all of which delete `/data/data/<pkg>` wholesale. A redownloading a 0.5–1.5 GB catalog model on metered mobile data is the most expensive thing the user does in the app; losing it to any of the above is unacceptable.

## The public root

When **all** of these hold, the models root becomes the shared **`Download/Rafeeq/`** folder:

1. Android 11+ (`Environment.isExternalStorageManager` exists),
2. the user granted **All files access** (one-time, via Settings — Android never grants it silently, and the app never asks more than once),
3. the "Keep models in Downloads" setting is on (it defaults to on).

Any other combination falls back to the internal root — identical to pre-0.21.0 behavior. The decision matrix is pure (`decideModelsRoot` in `src/models/modelStorage.ts`) and tested.

Under scoped storage, All-files-access is the only grant that lets an app read its own previously-downloaded files from the shared Downloads folder **after a reinstall** (a fresh install no longer "owns" them). It is a user-level Settings toggle, never a runtime dialog.

## Migration (internal → public)

`migrateIntoActiveRoot` (`src/models/publicStorage.ts`) moves only known model file names, and is failure-proof by construction:

- **Pass 1** copies every file into a `.migrating` staging name in the target and verifies the byte size.
- **Pass 2** (only when *every* copy verified) moves staging files into place and deletes the internal originals.
- Any failure cleans the staging copies and leaves the internal root active — a half-done migration can never look like a finished one, and no source file is deleted before a verified copy exists.

Migration runs from `useModelStore.reinitStorage()`, which the root layout calls once at startup and which the Settings switch and the Models-screen banner re-run after the grant state changes. It is idempotent and cheap when there is nothing to move.

## The stall watchdog

`DownloadManager` (v0.21.0) no longer allows a transfer to freeze the UI on "downloading" forever:

- A transfer with **no progress events for 45 s** is auto-paused with its resume state preserved and flagged `autoResume: true` — the user sees a paused row they can resume, and the next app launch resumes it automatically.
- The stall clock restarts when the transfer's bytes complete (hashing/move phase), and a heartbeat keeps it warm while a multi-gigabyte file hashes — hashing is never mistaken for a stall.
- A pause the **user** made never becomes auto-resumable: `autoResume` distinguishes "the app interrupted this" (kill, watchdog) from "the user chose to pause".
- `syncWithDisk` splits the restart paths accordingly: persisted `downloading` becomes an auto-resumable pause (sidecar state wins over stale saved state); persisted `paused` is left exactly as the user left it.
