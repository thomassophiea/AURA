/**
 * useHaptic - Haptic feedback for iOS
 * Provides subtle tactile feedback on interactions
 */

export function useHaptic() {
  const vibrate = (pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  return {
    light: () => vibrate(10),
    medium: () => vibrate(20),
    heavy: () => vibrate(30),
    success: () => vibrate([10, 50, 10]),
    warning: () => vibrate([10, 100, 10, 100, 10]),
    error: () => vibrate([20, 100, 20]),
  };
}
