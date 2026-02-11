/**
 * Generates consistent colors for assistants based on their ID.
 * Each assistant gets a unique color derived from its ID hash.
 */

// Curated palette of warm, friendly hues that fit the project's visual language
// Expanded for more variety while keeping colors cohesive
const PALETTE_HUES = [
  8,    // deep coral
  22,   // burnt orange
  35,   // tangerine
  50,   // golden amber
  68,   // olive
  95,   // lime green
  145,  // forest green
  170,  // teal
  200,  // slate blue
  260,  // lavender purple
  290,  // violet
  325,  // magenta
  350,  // rose red
];

/**
 * Simple hash function to convert string to number
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get colors for an assistant based on their ID
 * Returns both an accent color (for card backgrounds) and a soft background color (for chat)
 */
export function getAssistantColors(assistantId: string): {
  accent: string;      // Vibrant color for card name background
  accentText: string;  // Text color for accent background
  chatBg: string;      // Very soft/pastel background for chat interface
} {
  const hash = hashString(assistantId);
  const hue = PALETTE_HUES[hash % PALETTE_HUES.length];

  // Accent color: lighter and more saturated for good contrast with black text
  // saturation 50-65%, lightness 55-65% for vibrant but readable backgrounds
  const accentSaturation = 50 + (hash % 15);
  const accentLightness = 55 + (hash % 10);

  // Chat background: very soft pastel, high lightness, low saturation
  // saturation 30-45%, lightness 92-96% for a barely-there tint
  const bgSaturation = 35 + (hash % 15);
  const bgLightness = 93 + (hash % 4);

  return {
    accent: `hsl(${hue}, ${accentSaturation}%, ${accentLightness}%)`,
    accentText: '#1b1b1b', // Dark text for better readability on lighter accent colors
    chatBg: `hsl(${hue}, ${bgSaturation}%, ${bgLightness}%)`,
  };
}

/**
 * Get CSS custom properties for an assistant's colors
 * Useful for applying via style prop
 */
export function getAssistantColorStyles(assistantId: string): React.CSSProperties {
  const colors = getAssistantColors(assistantId);
  return {
    '--assistant-accent': colors.accent,
    '--assistant-accent-text': colors.accentText,
    '--assistant-chat-bg': colors.chatBg,
  } as React.CSSProperties;
}
