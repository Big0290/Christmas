import { GameState, GameType } from '@christmas/core';

/**
 * Normalizes a game state value to a GameState enum value.
 * Accepts both string values ('playing') and enum values (GameState.PLAYING).
 * Returns null for invalid values.
 */
export function normalizeGameState(state: any): GameState | null {
  if (!state) return null;
  
  // If it's already a valid enum value, return it
  if (Object.values(GameState).includes(state as GameState)) {
    return state as GameState;
  }
  
  // If it's a string, try to match it to an enum value
  if (typeof state === 'string') {
    const lowerState = state.toLowerCase();
    const enumValue = Object.values(GameState).find(
      (value) => value.toLowerCase() === lowerState
    );
    if (enumValue) {
      return enumValue as GameState;
    }
  }
  
  return null;
}

/**
 * Normalizes a game type value to a GameType enum value.
 * Accepts both string values ('trivia_royale') and enum values (GameType.TRIVIA_ROYALE).
 * Returns null for invalid values.
 */
export function normalizeGameType(type: any): GameType | null {
  if (!type) return null;
  
  // If it's already a valid enum value, return it
  if (Object.values(GameType).includes(type as GameType)) {
    return type as GameType;
  }
  
  // If it's a string, try to match it to an enum value
  if (typeof type === 'string') {
    const enumValue = Object.values(GameType).find(
      (value) => value === type || value.toLowerCase() === type.toLowerCase()
    );
    if (enumValue) {
      return enumValue as GameType;
    }
  }
  
  return null;
}

/**
 * Type guard to check if a value is a valid GameState enum value.
 */
export function isGameState(value: any): value is GameState {
  return Object.values(GameState).includes(value);
}

/**
 * Type guard to check if a value is a valid GameType enum value.
 */
export function isGameType(value: any): value is GameType {
  return Object.values(GameType).includes(value);
}

