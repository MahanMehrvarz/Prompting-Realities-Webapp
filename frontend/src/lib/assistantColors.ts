/**
 * Generates consistent colors for assistants based on their ID.
 * Each assistant gets a unique color derived from its ID hash.
 */

// Curated palette of warm, friendly hues that fit the project's visual language
// Avoiding harsh blues and keeping within warm/earthy tones
const PALETTE_HUES = [
  15,   // warm coral/red-orange
  30,   // orange
  45,   // amber
  75,   // olive/yellow-green
  140,  // soft green
  165,  // teal
  195,  // soft cyan
  280,  // soft purple
  320,  // magenta/pink
  345,  // rose
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

  // Accent color: moderately saturated, medium-dark for good contrast with white text
  // saturation 55-65%, lightness 35-45%
  const accentSaturation = 55 + (hash % 10);
  const accentLightness = 38 + (hash % 8);

  // Chat background: very soft pastel, high lightness, low saturation
  // saturation 30-45%, lightness 92-96% for a barely-there tint
  const bgSaturation = 35 + (hash % 15);
  const bgLightness = 93 + (hash % 4);

  return {
    accent: `hsl(${hue}, ${accentSaturation}%, ${accentLightness}%)`,
    accentText: '#ffffff', // White text works well on these accent colors
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
