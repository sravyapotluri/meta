# GlassFace

Real-time face recognition for Ray-Ban Meta glasses. Detects faces via the phone camera, matches them against an enrolled database, and speaks the person's name/details through the glasses speakers via Bluetooth.

## Setup

### 1. Download the TFLite model

```bash
bash scripts/download_model.sh
```

This downloads MobileFaceNet (128-d face embeddings) into `app/src/main/assets/`.

### 2. Build

Open in Android Studio (Hedgehog or newer) and click Run, or:

```bash
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 3. Requirements

- Android 8.0+ (API 26+)
- Phone with back camera
- Ray-Ban Meta glasses paired via phone Bluetooth settings

### 4. Usage

1. Open **GlassFace** on your phone and grant camera permission
2. Tap **Admin** (top-right) to open the people database
3. Tap **+** to add a person — fill in name, title, company, etc. and select a photo
4. Return to the main screen
5. Point the camera at someone's face — recognition runs live
6. Recognized faces get a green box + name overlay; audio announces through glasses speakers
7. Unknown faces show a red box

## Architecture

- **CameraX** — live preview + image analysis pipeline
- **ML Kit Face Detection** — offline, bundled, finds face bounding boxes
- **MobileFaceNet (TFLite)** — generates 128-d face embeddings, fully on-device
- **Room/SQLite** — stores enrolled persons and their embeddings
- **Android TextToSpeech** — speaks recognition results; routes through Bluetooth (Ray-Ban Meta glasses)

## Notes

- All processing is 100% offline — no cloud APIs
- Same person is announced at most once every 5 seconds (cooldown)
- Similarity threshold: cosine similarity > 0.65 for a match
