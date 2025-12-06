/**
 * Hello Kitty Icon Replacements
 * Cute emoji-based icons that replace regular icons in Hello Kitty mode
 */

export const helloKittyIcons = {
  // Navigation icons
  'home': '🏠',
  'dashboard': '📊',
  'settings': '⚙️',
  'user': '👤',
  'users': '👥',
  'bell': '🔔',
  'search': '🔍',
  'menu': '📋',

  // Network icons
  'wifi': '📡',
  'network': '🌐',
  'server': '💻',
  'cloud': '☁️',
  'signal': '📶',
  'router': '📡',

  // Status icons
  'check': '✅',
  'x': '❌',
  'alert': '⚠️',
  'info': 'ℹ️',
  'heart': '💖',
  'star': '⭐',

  // Action icons
  'edit': '✏️',
  'delete': '🗑️',
  'add': '➕',
  'remove': '➖',
  'save': '💾',
  'download': '⬇️',
  'upload': '⬆️',
  'refresh': '🔄',

  // UI icons
  'chevron-right': '▶️',
  'chevron-left': '◀️',
  'chevron-up': '🔼',
  'chevron-down': '🔽',
  'arrow-right': '→',
  'arrow-left': '←',
  'arrow-up': '↑',
  'arrow-down': '↓',

  // Fun extras
  'sparkles': '✨',
  'bow': '🎀',
  'kitty': '😺',
  'pink-heart': '💕',
  'gift': '🎁',
  'cake': '🎂',
  'flower': '🌸',
  'rainbow': '🌈',
  'butterfly': '🦋',
  'cherry-blossom': '🌸',
};

export function getHelloKittyIcon(iconName: string): string {
  return helloKittyIcons[iconName as keyof typeof helloKittyIcons] || iconName;
}

export function isHelloKittyMode(): boolean {
  return document.documentElement.classList.contains('theme-hello-kitty');
}
