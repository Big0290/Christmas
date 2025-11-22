import { Intent } from '@christmas/core';

/**
 * AntiSpam detects rapid-fire intents and suspicious patterns.
 * 
 * Responsibilities:
 * - Detect rapid-fire intents
 * - Detect suspicious patterns
 * - Temporary bans for violations
 * - Configurable thresholds
 */
export class AntiSpam {
  // Track intent timestamps per player: Map<playerId, number[]>
  private intentTimestamps: Map<string, number[]> = new Map();
  
  // Track banned players: Map<playerId, { until: number; reason: string }>
  private bans: Map<string, { until: number; reason: string }> = new Map();
  
  // Rapid-fire threshold: max intents per time window
  private rapidFireThreshold: number;
  private rapidFireWindowMs: number;
  
  // Suspicious pattern detection
  private patternWindowMs: number;
  private patternThreshold: number;

  constructor(
    rapidFireThreshold: number = 10,
    rapidFireWindowMs: number = 1000,
    patternWindowMs: number = 5000,
    patternThreshold: number = 50
  ) {
    this.rapidFireThreshold = rapidFireThreshold;
    this.rapidFireWindowMs = rapidFireWindowMs;
    this.patternWindowMs = patternWindowMs;
    this.patternThreshold = patternThreshold;
  }

  /**
   * Check if intent should be allowed (not spam)
   */
  isAllowed(intent: Intent): { allowed: boolean; reason?: string } {
    const { playerId, timestamp } = intent;

    // Check if player is banned
    const ban = this.bans.get(playerId);
    if (ban) {
      if (Date.now() < ban.until) {
        return {
          allowed: false,
          reason: `Banned: ${ban.reason}`,
        };
      } else {
        // Ban expired, remove it
        this.bans.delete(playerId);
      }
    }

    // Track intent timestamp
    if (!this.intentTimestamps.has(playerId)) {
      this.intentTimestamps.set(playerId, []);
    }

    const timestamps = this.intentTimestamps.get(playerId)!;
    const now = timestamp || Date.now();

    // Clean up old timestamps
    const windowStart = now - this.rapidFireWindowMs;
    const recentTimestamps = timestamps.filter(ts => ts > windowStart);
    recentTimestamps.push(now);
    this.intentTimestamps.set(playerId, recentTimestamps);

    // Check rapid-fire threshold
    if (recentTimestamps.length > this.rapidFireThreshold) {
      const banDuration = 60000; // 1 minute ban
      this.bans.set(playerId, {
        until: now + banDuration,
        reason: 'Rapid-fire intents detected',
      });

      console.warn(
        `[AntiSpam] Player ${playerId.substring(0, 8)} banned for rapid-fire intents (${recentTimestamps.length} in ${this.rapidFireWindowMs}ms)`
      );

      return {
        allowed: false,
        reason: 'Rapid-fire intents detected',
      };
    }

    // Check suspicious pattern (many intents over longer window)
    const patternWindowStart = now - this.patternWindowMs;
    const patternTimestamps = timestamps.filter(ts => ts > patternWindowStart);
    
    if (patternTimestamps.length > this.patternThreshold) {
      const banDuration = 300000; // 5 minute ban
      this.bans.set(playerId, {
        until: now + banDuration,
        reason: 'Suspicious pattern detected',
      });

      console.warn(
        `[AntiSpam] Player ${playerId.substring(0, 8)} banned for suspicious pattern (${patternTimestamps.length} intents in ${this.patternWindowMs}ms)`
      );

      return {
        allowed: false,
        reason: 'Suspicious pattern detected',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if player is banned
   */
  isBanned(playerId: string): boolean {
    const ban = this.bans.get(playerId);
    if (!ban) {
      return false;
    }

    if (Date.now() >= ban.until) {
      // Ban expired
      this.bans.delete(playerId);
      return false;
    }

    return true;
  }

  /**
   * Ban a player manually
   */
  banPlayer(playerId: string, durationMs: number, reason: string): void {
    this.bans.set(playerId, {
      until: Date.now() + durationMs,
      reason,
    });
    console.log(`[AntiSpam] Player ${playerId.substring(0, 8)} banned for ${durationMs}ms: ${reason}`);
  }

  /**
   * Unban a player
   */
  unbanPlayer(playerId: string): void {
    this.bans.delete(playerId);
    this.intentTimestamps.delete(playerId);
    console.log(`[AntiSpam] Player ${playerId.substring(0, 8)} unbanned`);
  }

  /**
   * Get ban info for a player
   */
  getBanInfo(playerId: string): { banned: boolean; until?: number; reason?: string } | null {
    const ban = this.bans.get(playerId);
    if (!ban) {
      return { banned: false };
    }

    if (Date.now() >= ban.until) {
      this.bans.delete(playerId);
      return { banned: false };
    }

    return {
      banned: true,
      until: ban.until,
      reason: ban.reason,
    };
  }

  /**
   * Cleanup old data
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    
    // Remove expired bans
    for (const [playerId, ban] of this.bans) {
      if (now >= ban.until) {
        this.bans.delete(playerId);
      }
    }

    // Clean up old timestamps
    for (const [playerId, timestamps] of this.intentTimestamps) {
      const cutoff = now - maxAgeMs;
      const filtered = timestamps.filter(ts => ts > cutoff);
      
      if (filtered.length === 0) {
        this.intentTimestamps.delete(playerId);
      } else {
        this.intentTimestamps.set(playerId, filtered);
      }
    }
  }

  /**
   * Get statistics for a player
   */
  getPlayerStats(playerId: string): {
    recentIntents: number;
    totalIntents: number;
    banned: boolean;
  } {
    const timestamps = this.intentTimestamps.get(playerId) || [];
    const now = Date.now();
    const recentWindow = now - this.rapidFireWindowMs;
    const recentIntents = timestamps.filter(ts => ts > recentWindow).length;

    return {
      recentIntents,
      totalIntents: timestamps.length,
      banned: this.isBanned(playerId),
    };
  }
}

