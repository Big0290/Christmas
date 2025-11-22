import { describe, it, expect } from 'vitest';
import { FSMEngine } from '../../engine/fsm-engine.js';
import { FSMState, GameState } from '@christmas/core';
import { GameType } from '@christmas/core';

describe('FSMEngine', () => {
  it('should initialize with LOBBY state', () => {
    const fsm = new FSMEngine();
    expect(fsm.getState()).toBe(FSMState.LOBBY);
  });

  it('should transition from LOBBY to SETUP', () => {
    const fsm = new FSMEngine();
    const result = fsm.transition(FSMState.SETUP);
    expect(result).toBe(true);
    expect(fsm.getState()).toBe(FSMState.SETUP);
  });

  it('should reject invalid transitions', () => {
    const fsm = new FSMEngine();
    const result = fsm.transition(FSMState.GAME_END);
    expect(result).toBe(false);
    expect(fsm.getState()).toBe(FSMState.LOBBY);
  });

  it('should track state history', () => {
    const fsm = new FSMEngine();
    fsm.transition(FSMState.SETUP);
    fsm.transition(FSMState.ROUND_START);
    
    const history = fsm.getStateHistory();
    expect(history.length).toBe(2);
    expect(history[0].from).toBe(FSMState.LOBBY);
    expect(history[0].to).toBe(FSMState.SETUP);
    expect(history[1].from).toBe(FSMState.SETUP);
    expect(history[1].to).toBe(FSMState.ROUND_START);
  });

  it('should validate transitions correctly', () => {
    const fsm = new FSMEngine();
    
    expect(fsm.canTransition(FSMState.SETUP)).toBe(true);
    expect(fsm.canTransition(FSMState.GAME_END)).toBe(false);
    
    fsm.transition(FSMState.SETUP);
    expect(fsm.canTransition(FSMState.ROUND_START)).toBe(true);
    expect(fsm.canTransition(FSMState.LOBBY)).toBe(true);
  });

  it('should map game states to FSM states', () => {
    const fsm = new FSMEngine(GameType.TRIVIA_ROYALE);
    fsm.setRound(1, 5);
    
    expect(fsm.getRound()).toBe(1);
    expect(fsm.getMaxRounds()).toBe(5);
    
    // Test static mapping methods
    const fsmState = FSMEngine.mapGameStateToFSM(GameState.PLAYING, 1, 5);
    expect(fsmState).toBe(FSMState.ROUND_START);
  });

  it('should reset to LOBBY state', () => {
    const fsm = new FSMEngine();
    fsm.transition(FSMState.SETUP);
    fsm.transition(FSMState.ROUND_START);
    
    fsm.reset();
    
    expect(fsm.getState()).toBe(FSMState.LOBBY);
    expect(fsm.getStateHistory().length).toBe(0);
    expect(fsm.getRound()).toBe(0);
  });

  it('should replay transitions from history', () => {
    const fsm1 = new FSMEngine();
    fsm1.transition(FSMState.SETUP);
    fsm1.transition(FSMState.ROUND_START);
    fsm1.transition(FSMState.ROUND_END);
    
    const history = fsm1.getStateHistory();
    
    const fsm2 = new FSMEngine();
    fsm2.replayTransitions(history);
    
    expect(fsm2.getState()).toBe(FSMState.ROUND_END);
    expect(fsm2.getStateHistory().length).toBe(3);
  });
});

