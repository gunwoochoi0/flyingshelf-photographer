#!/bin/sh
# Download fonts during Docker build from Google Fonts GitHub repository
# This uses direct downloads from GitHub instead of the deprecated CSS API

set -e

FONTS_DIR="/usr/share/fonts/truetype/google-fonts"
FONTS_CONFIG="/tmp/fonts.txt"

mkdir -p "$FONTS_DIR"

echo "📥 Downloading fonts from Google Fonts GitHub repository..."
echo ""

GOOGLE_COUNT=0
CUSTOM_COUNT=0
TOTAL_VARIANTS=0

# Function to download a font from GitHub
download_google_font() {
  FONT_NAME="$1"
  WEIGHTS="$2"
  
  echo "  → [GOOGLE] $FONT_NAME"
  
  # Convert font name for GitHub paths
  FONT_ID=$(echo "$FONT_NAME" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
  FONT_NAME_NO_SPACE=$(echo "$FONT_NAME" | tr -d ' ')
  
  # Determine if it's Roboto (Apache license) or others (OFL license)
  if [ "$FONT_NAME" = "Roboto" ]; then
    BASE_URL="https://raw.githubusercontent.com/google/fonts/main/apache/roboto"
    # Roboto uses dash in filenames: Roboto-Regular.ttf
    LIGHT_FILE="Roboto-Light.ttf"
    REGULAR_FILE="Roboto-Regular.ttf"
    MEDIUM_FILE="Roboto-Medium.ttf"
    BOLD_FILE="Roboto-Bold.ttf"
  else
    # Try static directory first (most common for newer fonts)
    BASE_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/${FONT_ID}/static"
    # Other fonts typically: FontName-Regular.ttf
    LIGHT_FILE="${FONT_NAME_NO_SPACE}-Light.ttf"
    REGULAR_FILE="${FONT_NAME_NO_SPACE}-Regular.ttf"
    MEDIUM_FILE="${FONT_NAME_NO_SPACE}-Medium.ttf"
    BOLD_FILE="${FONT_NAME_NO_SPACE}-Bold.ttf"
  fi
  
  DOWNLOADED=0
  
  # Download Regular (400) - most important
  if wget -q "${BASE_URL}/${REGULAR_FILE}" -O "${FONTS_DIR}/${FONT_NAME_NO_SPACE}-Regular.ttf" 2>/dev/null; then
    DOWNLOADED=$((DOWNLOADED + 1))
  fi
  
  # Download Bold (700)
  if wget -q "${BASE_URL}/${BOLD_FILE}" -O "${FONTS_DIR}/${FONT_NAME_NO_SPACE}-Bold.ttf" 2>/dev/null; then
    DOWNLOADED=$((DOWNLOADED + 1))
  fi
  
  # Download Light (300) if requested
  if echo "$WEIGHTS" | grep -q "300"; then
    if wget -q "${BASE_URL}/${LIGHT_FILE}" -O "${FONTS_DIR}/${FONT_NAME_NO_SPACE}-Light.ttf" 2>/dev/null; then
      DOWNLOADED=$((DOWNLOADED + 1))
    fi
  fi
  
  # Download Medium (500) if requested
  if echo "$WEIGHTS" | grep -q "500"; then
    if wget -q "${BASE_URL}/${MEDIUM_FILE}" -O "${FONTS_DIR}/${FONT_NAME_NO_SPACE}-Medium.ttf" 2>/dev/null; then
      DOWNLOADED=$((DOWNLOADED + 1))
    fi
  fi
  
  # If no files downloaded, try the non-static directory (for older fonts or variable fonts)
  if [ $DOWNLOADED -eq 0 ] && [ "$FONT_NAME" != "Roboto" ]; then
    BASE_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/${FONT_ID}"
    
    # Try downloading a variable font as fallback
    VARIABLE_FILE="${FONT_NAME_NO_SPACE}-VariableFont_wght.ttf"
    if wget -q "${BASE_URL}/${VARIABLE_FILE}" -O "${FONTS_DIR}/${FONT_NAME_NO_SPACE}-Variable.ttf" 2>/dev/null; then
      DOWNLOADED=$((DOWNLOADED + 1))
    fi
  fi
  
  if [ $DOWNLOADED -gt 0 ]; then
    echo "    ✓ Downloaded ${DOWNLOADED} variants"
    GOOGLE_COUNT=$((GOOGLE_COUNT + 1))
    TOTAL_VARIANTS=$((TOTAL_VARIANTS + DOWNLOADED))
  else
    echo "    ✗ No files found (font may not exist or has different naming)"
    # Clean up any failed partial downloads
    rm -f "${FONTS_DIR}/${FONT_NAME_NO_SPACE}"*.ttf 2>/dev/null || true
  fi
}

# Read fonts from config file (skip comments and empty lines)
grep -v '^#' "$FONTS_CONFIG" | grep -v '^$' | while IFS= read -r line; do
  
  # Check if it's a custom font (starts with CUSTOM|)
  if echo "$line" | grep -q '^CUSTOM|'; then
    # Format: CUSTOM|FontName|URL
    FONT_NAME=$(echo "$line" | cut -d'|' -f2)
    FONT_URL=$(echo "$line" | cut -d'|' -f3)
    
    echo "  → [CUSTOM] $FONT_NAME"
    
    # Get file extension from URL
    EXT=$(echo "$FONT_URL" | grep -oE '\.(ttf|otf|woff|woff2)$' || echo ".ttf")
    FILENAME="${FONT_NAME// /-}${EXT}"
    
    # Download custom font
    if wget -q "$FONT_URL" -O "$FONTS_DIR/$FILENAME" 2>/dev/null; then
      echo "    ✓ Downloaded $FILENAME"
      CUSTOM_COUNT=$((CUSTOM_COUNT + 1))
    else
      echo "    ✗ Failed to download from $FONT_URL"
    fi
    
  else
    # Google Font format: FontName:weights
    FONT_NAME=$(echo "$line" | cut -d: -f1)
    FONT_WEIGHTS=$(echo "$line" | cut -d: -f2)
    
    download_google_font "$FONT_NAME" "$FONT_WEIGHTS"
  fi
done

# Update font cache
echo ""
echo "🔄 Updating font cache..."
fc-cache -f -v 2>&1 | grep -E "fc-cache:|succeed" | head -3

# Show summary
TOTAL_FILES=$(ls -1 "$FONTS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "✅ Font Download Summary:"
echo "   - Google Fonts: $GOOGLE_COUNT families"
echo "   - Total variants: $TOTAL_VARIANTS files"
echo "   - Custom Fonts: $CUSTOM_COUNT files"
echo "   - Total files in directory: $TOTAL_FILES"
echo ""
echo "📋 Available font families (showing first 30):"
fc-list | cut -d: -f2 | cut -d, -f1 | sort -u | head -30 | sed 's/^/   /'
echo ""

if [ $TOTAL_FILES -gt 0 ]; then
  echo "✅ Fonts successfully installed in Docker image!"
else
  echo "⚠️  Warning: No fonts were downloaded. Runtime downloads will be used."
fi
