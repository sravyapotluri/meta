#!/bin/bash
# Downloads the MobileFaceNet TFLite model into app/src/main/assets/
# Run this from the repo root before building: bash scripts/download_model.sh

set -e
ASSETS_DIR="app/src/main/assets"
MODEL_FILE="$ASSETS_DIR/mobile_face_net.tflite"
MODEL_URL="https://github.com/silentsoft/facenet-android/raw/master/app/src/main/assets/mobile_face_net.tflite"

mkdir -p "$ASSETS_DIR"

if [ -f "$MODEL_FILE" ]; then
    echo "Model already present: $MODEL_FILE"
    ls -lh "$MODEL_FILE"
    exit 0
fi

echo "Downloading MobileFaceNet TFLite model (~4 MB)..."
if command -v curl &>/dev/null; then
    curl -L --retry 3 "$MODEL_URL" -o "$MODEL_FILE"
elif command -v wget &>/dev/null; then
    wget -q --tries=3 "$MODEL_URL" -O "$MODEL_FILE"
else
    echo "ERROR: neither curl nor wget found. Download manually:"
    echo "  URL: $MODEL_URL"
    echo "  Destination: $MODEL_FILE"
    exit 1
fi

echo "Done: $(ls -lh $MODEL_FILE)"
