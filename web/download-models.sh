#!/bin/bash
# Downloads face-api.js models required for GlassFace web interface.
# Run once from the web/ directory: bash download-models.sh

set -e
MODELS_DIR="$(dirname "$0")/models"
mkdir -p "$MODELS_DIR"

BASE="https://raw.githubusercontent.com/vladmandic/face-api/master/model"

FILES=(
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model.bin"
  "face_landmark_68_tiny_model-weights_manifest.json"
  "face_landmark_68_tiny_model.bin"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
)

echo "Downloading face-api.js models to $MODELS_DIR ..."
for FILE in "${FILES[@]}"; do
  DEST="$MODELS_DIR/$FILE"
  if [ -f "$DEST" ]; then
    echo "  Already exists: $FILE"
    continue
  fi
  echo "  Fetching: $FILE"
  if command -v curl &>/dev/null; then
    curl -fsSL "$BASE/$FILE" -o "$DEST"
  else
    wget -q "$BASE/$FILE" -O "$DEST"
  fi
done

echo ""
echo "Done! Models saved to: $MODELS_DIR"
echo ""
echo "Start the web app with:"
echo "  cd web && npm start"
echo "  # or: python3 -m http.server 3000"
echo "  # then open http://localhost:3000"
