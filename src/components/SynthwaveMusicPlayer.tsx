import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Music,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface Track {
  title: string;
  artist: string;
  url: string;
}

interface SynthwaveMusicPlayerProps {
  isVisible: boolean;
  onClose: () => void;
}

export function SynthwaveMusicPlayer({ isVisible, onClose }: SynthwaveMusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Tracks - default starts with "Turn Off The Lights"
  const [tracks] = useState<Track[]>([
    {
      title: 'Turn Off The Lights',
      artist: 'Synthwave Collection',
      url: '/music/turn-off-the-lights.mp3'
    },
    {
      title: 'Neon Nights',
      artist: 'Synthwave Dreams',
      url: '/music/neon-nights.mp3'
    },
    {
      title: 'Cyber Highway',
      artist: 'Retro Future',
      url: '/music/cyber-highway.mp3'
    }
  ]);

  const currentTrack = tracks[currentTrackIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => handleNext();

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error('Failed to play audio:', err);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
    setIsPlaying(true);
    setTimeout(() => audioRef.current?.play(), 100);
  };

  const handlePrevious = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    setIsPlaying(true);
    setTimeout(() => audioRef.current?.play(), 100);
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isVisible) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Card
          className="border-2 border-pink-500 synthwave-card-glow"
          style={{
            background: 'rgba(8, 2, 28, 0.92)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 0 30px rgba(255,0,110,0.5), 0 0 60px rgba(123,47,255,0.2)',
          }}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={togglePlay}
              className="h-8 w-8 p-0 hover:bg-cyan-500/20"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 text-cyan-400" />
              ) : (
                <Play className="h-4 w-4 text-cyan-400" />
              )}
            </Button>
            {/* Mini equalizer */}
            <div className="flex items-end gap-0.5 h-5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={isPlaying ? 'synthwave-eq-bar' : ''}
                  style={{
                    width: '3px',
                    height: isPlaying ? undefined : '4px',
                    background: i % 2 === 0
                      ? 'linear-gradient(to top, #ff2d9b, #bf5fff)'
                      : 'linear-gradient(to top, #00e6ff, #7b2fff)',
                    borderRadius: '1px',
                    animationDuration: isPlaying ? `${0.45 + i * 0.12}s` : undefined,
                    animationDelay: isPlaying ? `${i * 0.08}s` : undefined,
                  }}
                />
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsMinimized(false)}
              className="h-8 w-8 p-0 hover:bg-cyan-500/20"
            >
              <Maximize2 className="h-3 w-3 text-cyan-400" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96">
      <Card
        className="border-2 border-pink-500 synthwave-card-glow"
        style={{
          background: 'rgba(6, 1, 22, 0.93)',
          backdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: '0 0 40px rgba(255,0,110,0.55), 0 0 80px rgba(123,47,255,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <CardContent className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="h-5 w-5 text-pink-400 animate-pulse" />
              <h3
                className="font-bold tracking-widest text-sm synthwave-title-glow"
                style={{
                  background: 'linear-gradient(90deg, #ff2d9b, #00e6ff, #ff2d9b)',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  animation: 'synthwave-title-glow 2.5s ease-in-out infinite, gradient-shift 4s linear infinite',
                }}
              >
                ◈ MIAMI VICE PLAYER ◈
              </h3>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsMinimized(true)}
                className="h-8 w-8 p-0 hover:bg-cyan-500/20"
              >
                <Minimize2 className="h-3 w-3 text-cyan-400" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8 p-0 hover:bg-pink-500/20"
              >
                <X className="h-3 w-3 text-pink-400" />
              </Button>
            </div>
          </div>

          {/* Equalizer Bars */}
          <div
            className="flex items-end justify-center gap-1 rounded"
            style={{
              height: '40px',
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,45,155,0.15)',
            }}
          >
            {Array.from({ length: 18 }).map((_, i) => (
              <div
                key={i}
                className={isPlaying ? 'synthwave-eq-bar' : ''}
                style={{
                  flex: '1',
                  height: isPlaying ? undefined : '3px',
                  background: i % 3 === 0
                    ? 'linear-gradient(to top, #ff2d9b, #ff6eb4)'
                    : i % 3 === 1
                      ? 'linear-gradient(to top, #7b2fff, #bf5fff)'
                      : 'linear-gradient(to top, #00e6ff, #7b2fff)',
                  borderRadius: '2px 2px 0 0',
                  animationDuration: isPlaying ? `${0.35 + (i % 5) * 0.13}s` : undefined,
                  animationDelay: isPlaying ? `${(i % 7) * 0.06}s` : undefined,
                  minHeight: '3px',
                }}
              />
            ))}
          </div>

          {/* Track Info */}
          <div
            className="text-center space-y-1 py-3 rounded"
            style={{
              borderTop: '1px solid rgba(255,45,155,0.25)',
              borderBottom: '1px solid rgba(0,230,255,0.20)',
            }}
          >
            <div
              className="text-base font-bold tracking-wide"
              style={{
                color: '#ff2d9b',
                textShadow: '0 0 12px rgba(255,45,155,0.8), 0 0 24px rgba(255,45,155,0.4)',
              }}
            >
              {currentTrack.title}
            </div>
            <div
              className="text-xs tracking-widest uppercase"
              style={{
                color: '#00e6ff',
                textShadow: '0 0 8px rgba(0,230,255,0.6)',
              }}
            >
              {currentTrack.artist}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
            <div
              className="flex justify-between text-xs"
              style={{ color: 'rgba(0,230,255,0.75)' }}
            >
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePrevious}
              className="h-10 w-10 p-0 hover:bg-cyan-500/20 transition-all"
            >
              <SkipBack className="h-5 w-5 text-cyan-400" />
            </Button>

            <Button
              size="lg"
              onClick={togglePlay}
              className="h-16 w-16 rounded-full transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #ff2d9b 0%, #7b2fff 100%)',
                boxShadow: isPlaying
                  ? '0 0 25px rgba(255,45,155,0.8), 0 0 50px rgba(123,47,255,0.5), 0 0 80px rgba(255,45,155,0.2)'
                  : '0 0 15px rgba(255,45,155,0.5), 0 0 30px rgba(123,47,255,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {isPlaying ? (
                <Pause className="h-7 w-7 text-white" />
              ) : (
                <Play className="h-7 w-7 text-white ml-1" />
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleNext}
              className="h-10 w-10 p-0 hover:bg-cyan-500/20 transition-all"
            >
              <SkipForward className="h-5 w-5 text-cyan-400" />
            </Button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsMuted(!isMuted)}
              className="h-8 w-8 p-0 hover:bg-cyan-500/20"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-pink-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-cyan-400" />
              )}
            </Button>
            <Slider
              value={[volume]}
              max={100}
              step={1}
              onValueChange={(val) => setVolume(val[0])}
              className="flex-1"
            />
            <span
              className="text-xs w-8 text-right"
              style={{ color: 'rgba(0,230,255,0.75)' }}
            >
              {volume}%
            </span>
          </div>

          {/* Track List Hint */}
          <div
            className="text-xs text-center pt-2"
            style={{
              borderTop: '1px solid rgba(255,45,155,0.18)',
              color: 'rgba(191,95,255,0.55)',
            }}
          >
            Drop .mp3 files into /public/music/
          </div>
        </CardContent>
      </Card>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} src={currentTrack.url} />

      {/* Inline styles for gradient-shift animation */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% center; }
          100% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
}
