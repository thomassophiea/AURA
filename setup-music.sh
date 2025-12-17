#!/bin/bash

# Synthwave Music Setup Script
# This script helps you set up the music files for the Synthwave player

echo "🌆 Synthwave Music Setup 🎵"
echo "================================"
echo ""

# Create the music directory if it doesn't exist
if [ ! -d "public/music" ]; then
  echo "📁 Creating public/music directory..."
  mkdir -p public/music
  echo "✅ Directory created!"
else
  echo "✅ public/music directory already exists"
fi

echo ""
echo "📥 Next Steps:"
echo ""
echo "1. Download the music files from Google Drive:"
echo "   https://drive.google.com/drive/folders/1MUeKQOGKPpLzbcWhr5Ay0xlYSTi8YULE"
echo ""
echo "2. Move/copy the .mp3 files to: public/music/"
echo ""
echo "3. Rename the files to match the player expectations:"
echo "   - First track  → track1.mp3"
echo "   - Second track → track2.mp3"
echo "   - Third track  → track3.mp3"
echo ""
echo "   OR update the track list in:"
echo "   src/components/SynthwaveMusicPlayer.tsx"
echo ""
echo "🎮 Once done, start the app and toggle to Synthwave mode!"
echo ""

# List current files in music directory
if [ -d "public/music" ] && [ "$(ls -A public/music)" ]; then
  echo "📂 Current files in public/music:"
  ls -lh public/music/
else
  echo "📂 No music files found yet"
fi

echo ""
echo "🌟 Enjoy your neon vibes! 🌆✨"
