/**
 * "Ah ah ah, you didn't say the magic word" - Jurassic Park Easter Egg
 * Plays when API errors occur
 */

let audioInstance: HTMLAudioElement | null = null;
let isPlaying = false;

export function playMagicWordWarning() {
  // Only play if not already playing
  if (isPlaying) {
    return;
  }

  // Create audio element if it doesn't exist
  if (!audioInstance) {
    // Using a direct MP3 URL from a CDN that hosts the Jurassic Park sound
    audioInstance = new Audio('https://www.myinstants.com/media/sounds/ah-ah-ah-you-didnt-say-the-magic-word.mp3');
    audioInstance.loop = true; // Loop it!
    audioInstance.volume = 0.7;

    // Debug logging
    console.log('🦖 Creating audio instance...');
  }

  // Play the sound
  audioInstance.play()
    .then(() => {
      isPlaying = true;
      console.log('🦖 Ah ah ah, you didn\'t say the magic word!');

      // Auto-stop after 30 seconds (so it doesn't drive you crazy)
      setTimeout(() => {
        stopMagicWordWarning();
      }, 30000);
    })
    .catch((error) => {
      console.error('Failed to play magic word sound:', error);
    });
}

export function stopMagicWordWarning() {
  if (audioInstance && isPlaying) {
    audioInstance.pause();
    audioInstance.currentTime = 0;
    isPlaying = false;
    console.log('🦖 Magic word warning stopped');
  }
}

// Function to check if API error and play sound
export function handleApiError(error: any, statusCode?: number) {
  // Play sound for 4xx and 5xx errors
  if (statusCode && (statusCode >= 400 || error)) {
    playMagicWordWarning();
  }
}
