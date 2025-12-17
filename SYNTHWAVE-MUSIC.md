# 🌆 Synthwave Music Player Setup

The Synthwave theme includes a retro music player that can play your .mp3 files!

## 📥 Quick Setup with Google Drive Music

**Music Files Location:** https://drive.google.com/drive/folders/1MUeKQOGKPpLzbcWhr5Ay0xlYSTi8YULE

### Option 1: Using the Setup Script (Recommended)

```bash
./setup-music.sh
```

Then follow the prompts to download and set up your music!

### Option 2: Manual Setup

1. **Download the music files** from the Google Drive link above

2. **Move the files** to the `public/music/` folder:
   ```
   public/
   └── music/
       ├── track1.mp3
       ├── track2.mp3
       └── track3.mp3
   ```

3. **Rename files** to match the expected names:
   - `track1.mp3`
   - `track2.mp3`
   - `track3.mp3`

4. **Restart the app** if it's running

5. **Toggle to Synthwave mode** and enjoy! 🎵

## 🎵 Default Tracks

The player is configured with 3 placeholder tracks:
- **Neon Nights** by Synthwave Dreams (`/music/track1.mp3`)
- **Cyber Highway** by Retro Future (`/music/track2.mp3`)
- **Sunset Drive** by Wave Rider (`/music/track3.mp3`)

## 🎮 Music Player Features

- **Play/Pause**: Control playback
- **Skip Forward/Back**: Navigate between tracks
- **Volume Control**: Adjust or mute the volume
- **Seek Bar**: Jump to any point in the track
- **Minimize**: Collapse the player to a small widget
- **Auto-advance**: Automatically plays the next track when one ends

## 🎨 Customization

To add more tracks or change track info, edit:
`src/components/SynthwaveMusicPlayer.tsx`

Look for the `tracks` array and add your own:
```typescript
const [tracks] = useState<Track[]>([
  {
    title: 'Your Track Name',
    artist: 'Your Artist Name',
    url: '/music/your-file.mp3'
  },
  // Add more tracks...
]);
```

## 🌟 Recommended Synthwave Artists

- Gunship
- The Midnight
- FM-84
- Timecop1983
- Perturbator
- Carpenter Brut
- Dance with the Dead
- Lazerhawk

Enjoy your neon-soaked journey! 🎶✨
