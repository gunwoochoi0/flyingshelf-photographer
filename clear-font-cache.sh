#!/bin/bash
# Clear the WOFF2 font cache and force re-download of TTF fonts

echo "🧹 Clearing font cache..."
rm -rf .fonts-cache
mkdir -p .fonts-cache
echo "✅ Font cache cleared. Fonts will be re-downloaded as TTF on next render."

