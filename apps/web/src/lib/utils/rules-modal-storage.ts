import type { GameType } from '@christmas/core';

const STORAGE_KEY_PREFIX = 'christmas_rules_dismissed_';

/**
 * Check if rules modal has been dismissed for a specific game type in a room session
 */
export function hasDismissedRules(roomCode: string, gameType: GameType): boolean {
  if (typeof window === 'undefined') return false;
  const key = `${STORAGE_KEY_PREFIX}${roomCode}_${gameType}`;
  return sessionStorage.getItem(key) === 'true';
}

/**
 * Mark rules modal as dismissed for a specific game type in a room session
 */
export function dismissRules(roomCode: string, gameType: GameType): void {
  if (typeof window === 'undefined') return;
  const key = `${STORAGE_KEY_PREFIX}${roomCode}_${gameType}`;
  sessionStorage.setItem(key, 'true');
}

/**
 * Clear all dismissed rules for a room session (called when player leaves room)
 */
export function clearDismissedRules(roomCode: string): void {
  if (typeof window === 'undefined') return;
  const prefix = `${STORAGE_KEY_PREFIX}${roomCode}_`;
  Object.keys(sessionStorage).forEach(key => {
    if (key.startsWith(prefix)) {
      sessionStorage.removeItem(key);
    }
  });
}

