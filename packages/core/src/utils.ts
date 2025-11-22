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

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  burstSize?: number; // Maximum burst requests allowed
  burstWindowMs?: number; // Burst window in milliseconds
}

export class RateLimiter {
  // Per-key rate limit tracking: Map<key, { requests: number[], burstRequests: number[] }>
  private requests: Map<string, { requests: number[]; burstRequests: number[] }> = new Map();
  
  // Default config
  private config: RateLimitConfig;
  
  // Per-action configs: Map<actionType, RateLimitConfig>
  private actionConfigs: Map<string, RateLimitConfig> = new Map();
  
  // Per-room configs: Map<roomCode, RateLimitConfig>
  private roomConfigs: Map<string, RateLimitConfig> = new Map();
  
  // Per-client configs: Map<clientId, RateLimitConfig>
  private clientConfigs: Map<string, RateLimitConfig> = new Map();

  constructor(config: RateLimitConfig = { maxRequests: 10, windowMs: 1000 }) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      burstSize: config.burstSize || config.maxRequests * 2,
      burstWindowMs: config.burstWindowMs || config.windowMs * 2,
    };
  }

  /**
   * Set config for a specific action type
   */
  setActionConfig(actionType: string, config: RateLimitConfig): void {
    this.actionConfigs.set(actionType, config);
  }

  /**
   * Set config for a specific room
   */
  setRoomConfig(roomCode: string, config: RateLimitConfig): void {
    this.roomConfigs.set(roomCode, config);
  }

  /**
   * Set config for a specific client
   */
  setClientConfig(clientId: string, config: RateLimitConfig): void {
    this.clientConfigs.set(clientId, config);
  }

  /**
   * Check if request is allowed (sliding window algorithm)
   */
  isAllowed(
    key: string,
    actionType?: string,
    roomCode?: string,
    clientId?: string
  ): boolean {
    const now = Date.now();
    
    // Determine config (priority: client > room > action > default)
    let config = this.config;
    if (clientId && this.clientConfigs.has(clientId)) {
      config = this.clientConfigs.get(clientId)!;
    } else if (roomCode && this.roomConfigs.has(roomCode)) {
      config = this.roomConfigs.get(roomCode)!;
    } else if (actionType && this.actionConfigs.has(actionType)) {
      config = this.actionConfigs.get(actionType)!;
    }

    // Get or create request tracking for this key
    if (!this.requests.has(key)) {
      this.requests.set(key, { requests: [], burstRequests: [] });
    }

    const tracking = this.requests.get(key)!;
    
    // Clean up old requests (sliding window)
    const windowStart = now - config.windowMs;
    tracking.requests = tracking.requests.filter(time => time > windowStart);
    
    const burstWindowStart = now - (config.burstWindowMs || config.windowMs * 2);
    tracking.burstRequests = tracking.burstRequests.filter(time => time > burstWindowStart);

    // Check burst limit first
    const burstLimit = config.burstSize || config.maxRequests * 2;
    if (tracking.burstRequests.length >= burstLimit) {
      return false;
    }

    // Check regular limit
    if (tracking.requests.length >= config.maxRequests) {
      return false;
    }

    // Allow request - record it
    tracking.requests.push(now);
    tracking.burstRequests.push(now);
    this.requests.set(key, tracking);

    return true;
  }

  /**
   * Check if request is allowed for a client
   */
  isAllowedForClient(clientId: string, actionType?: string): boolean {
    return this.isAllowed(`client:${clientId}`, actionType, undefined, clientId);
  }

  /**
   * Check if request is allowed for a room
   */
  isAllowedForRoom(roomCode: string, actionType?: string): boolean {
    return this.isAllowed(`room:${roomCode}`, actionType, roomCode);
  }

  /**
   * Check if request is allowed for an action type
   */
  isAllowedForAction(actionType: string, clientId?: string, roomCode?: string): boolean {
    return this.isAllowed(`action:${actionType}`, actionType, roomCode, clientId);
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Reset rate limit for a client
   */
  resetClient(clientId: string): void {
    this.reset(`client:${clientId}`);
  }

  /**
   * Reset rate limit for a room
   */
  resetRoom(roomCode: string): void {
    this.reset(`room:${roomCode}`);
  }

  /**
   * Reset rate limit for an action
   */
  resetAction(actionType: string): void {
    this.reset(`action:${actionType}`);
  }

  /**
   * Get current request count for a key
   */
  getRequestCount(key: string): number {
    const tracking = this.requests.get(key);
    return tracking ? tracking.requests.length : 0;
  }

  /**
   * Cleanup old entries (call periodically)
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, tracking] of this.requests) {
      const oldestRequest = Math.min(
        ...tracking.requests,
        ...tracking.burstRequests,
        now
      );
      
      if (now - oldestRequest > maxAgeMs) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.requests.delete(key);
    }
  }
}
