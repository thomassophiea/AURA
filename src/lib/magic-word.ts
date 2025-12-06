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
    audioInstance = new Audio('https://www.101soundboards.com/sounds/73575-ah-ah-ah-you-didnt-say-the-magic-word');
    audioInstance.loop = true; // Loop it!
    audioInstance.volume = 0.7;
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
