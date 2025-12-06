import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from './ui/button';

/**
 * Hello Kitty Theme Music Player
 * Plays kawaii background music when Hello Kitty theme is active
 */

export function HelloKittyMusic() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Check if we're in Hello Kitty mode
    const isHelloKittyMode = document.documentElement.classList.contains('theme-hello-kitty');

    if (!isHelloKittyMode) {
      // Stop music if not in Hello Kitty mode
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    // Create audio element if it doesn't exist
    if (!audioRef.current) {
      audioRef.current = new Audio();
      // Using a royalty-free kawaii music loop
      // You can replace this with any Hello Kitty theme music URL
      audioRef.current.src = 'https://www.bensound.com/bensound-music/bensound-cute.mp3';
      audioRef.current.loop = true;
      audioRef.current.volume = 0.3; // Start at 30% volume (not too loud)
    }

    // Auto-play when entering Hello Kitty mode (with user gesture required)
    const playMusic = async () => {
      if (audioRef.current && isHelloKittyMode) {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          // Auto-play blocked - user needs to click play button
          console.log('🎀 Click the music button to play Hello Kitty music!');
        }
      }
    };

    playMusic();

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Failed to play audio:', error);
      }
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;

    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Only show if in Hello Kitty mode
  const isHelloKittyMode = document.documentElement.classList.contains('theme-hello-kitty');
  if (!isHelloKittyMode) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-pink-100 dark:bg-pink-900 p-3 rounded-full shadow-lg border-2 border-pink-300">
      <span className="text-2xl animate-bounce">🎀</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={togglePlay}
        className="h-8 w-8 p-0 hover:bg-pink-200"
        title={isPlaying ? 'Pause music' : 'Play music'}
      >
        {isPlaying ? '⏸️' : '▶️'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={toggleMute}
        className="h-8 w-8 p-0 hover:bg-pink-200"
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </Button>
      <span className="text-xs text-pink-600 dark:text-pink-300 font-medium">
        Hello Kitty Mode
      </span>
    </div>
  );
}
