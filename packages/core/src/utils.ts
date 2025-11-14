// ============================================================================
// ROOM CODE GENERATION
// ============================================================================

export function generateRoomCode(length: number = 4): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar-looking chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================================
// AVATAR GENERATION
// ============================================================================

const festiveAvatars = [
  '🎅', '🤶', '🎄', '⛄', '🦌', '🎁', '🔔', '⭐', '🕯️', '🎿',
  '🧝', '🧙', '👼', '🎺', '🎻', '🎸', '🥁', '🎷', '🎉', '🎊'
];

const emojiAvatars = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
  '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗'
];

export function generateAvatar(style: 'festive' | 'emoji' | 'random' = 'festive'): string {
  if (style === 'random') {
    style = Math.random() > 0.5 ? 'festive' : 'emoji';
  }
  
  const avatars = style === 'festive' ? festiveAvatars : emojiAvatars;
  return avatars[Math.floor(Math.random() * avatars.length)];
}

// ============================================================================
// SCORING UTILITIES
// ============================================================================

export function calculateSpeedBonus(
  timeElapsed: number,
  maxTime: number,
  multiplier: number = 1.5
): number {
  const ratio = Math.max(0, 1 - timeElapsed / maxTime);
  return Math.floor(100 * ratio * multiplier);
}

export function calculateAccuracyScore(correct: boolean, basePoints: number = 100): number {
  return correct ? basePoints : 0;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code);
}

export function sanitizePlayerName(name: string): string {
  return name.trim().slice(0, 20) || 'Player';
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

export function getTimestamp(): number {
  return Date.now();
}

export function isExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================================================
// RATE LIMITING
// ============================================================================

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(
    private maxRequests: number = 10,
    private windowMs: number = 1000
  ) {}
  
  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Filter out old requests
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }
  
  reset(key: string): void {
    this.requests.delete(key);
  }
}
