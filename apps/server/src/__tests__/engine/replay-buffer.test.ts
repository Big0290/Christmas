import { describe, it, expect, beforeEach } from 'vitest';
import { ReplayBuffer } from '../../engine/replay-buffer.js';
import { GameEvent } from '@christmas/core';

describe('ReplayBuffer', () => {
  let replayBuffer: ReplayBuffer;
  const roomCode = 'TEST';

  beforeEach(() => {
    replayBuffer = new ReplayBuffer(100);
  });

  it('should add events to buffer', () => {
    const event: GameEvent = {
      id: 'evt1',
      type: 'game_answer',
      roomCode,
      timestamp: Date.now(),
      version: 1,
      data: { answerIndex: 0 },
    };

    replayBuffer.addEvent(event);
    const events = replayBuffer.getEvents(roomCode);
    
    expect(events.length).toBe(1);
    expect(events[0].id).toBe('evt1');
  });

  it('should maintain buffer size limit', () => {
    const bufferSize = 5;
    const smallBuffer = new ReplayBuffer(bufferSize);
    
    for (let i = 0; i < 10; i++) {
      const event: GameEvent = {
        id: `evt${i}`,
        type: 'game_answer',
        roomCode,
        timestamp: Date.now(),
        version: i,
        data: {},
      };
      smallBuffer.addEvent(event);
    }
    
    const events = smallBuffer.getEvents(roomCode);
    expect(events.length).toBe(bufferSize);
    // Should have latest events
    expect(events[0].id).toBe('evt5');
    expect(events[events.length - 1].id).toBe('evt9');
  });

  it('should get events since version', () => {
    for (let i = 1; i <= 10; i++) {
      const event: GameEvent = {
        id: `evt${i}`,
        type: 'game_answer',
        roomCode,
        timestamp: Date.now(),
        version: i,
        data: {},
      };
      replayBuffer.addEvent(event);
    }
    
    const events = replayBuffer.getEventsSince(roomCode, 5);
    expect(events.length).toBe(6); // Versions 5-10
    expect(events[0].version).toBe(5);
    expect(events[events.length - 1].version).toBe(10);
  });

  it('should get events between versions', () => {
    for (let i = 1; i <= 10; i++) {
      const event: GameEvent = {
        id: `evt${i}`,
        type: 'game_answer',
        roomCode,
        timestamp: Date.now(),
        version: i,
        data: {},
      };
      replayBuffer.addEvent(event);
    }
    
    const events = replayBuffer.getEventsBetween(roomCode, 3, 7);
    expect(events.length).toBe(5); // Versions 3-7
    expect(events[0].version).toBe(3);
    expect(events[events.length - 1].version).toBe(7);
  });

  it('should get latest event', () => {
    for (let i = 1; i <= 5; i++) {
      const event: GameEvent = {
        id: `evt${i}`,
        type: 'game_answer',
        roomCode,
        timestamp: Date.now(),
        version: i,
        data: {},
      };
      replayBuffer.addEvent(event);
    }
    
    const latest = replayBuffer.getLatestEvent(roomCode);
    expect(latest).not.toBeNull();
    expect(latest!.version).toBe(5);
  });

  it('should get latest version', () => {
    for (let i = 1; i <= 5; i++) {
      const event: GameEvent = {
        id: `evt${i}`,
        type: 'game_answer',
        roomCode,
        timestamp: Date.now(),
        version: i,
        data: {},
      };
      replayBuffer.addEvent(event);
    }
    
    const version = replayBuffer.getLatestVersion(roomCode);
    expect(version).toBe(5);
  });

  it('should clear buffer', () => {
    const event: GameEvent = {
      id: 'evt1',
      type: 'game_answer',
      roomCode,
      timestamp: Date.now(),
      version: 1,
      data: {},
    };
    
    replayBuffer.addEvent(event);
    replayBuffer.clear(roomCode);
    
    const events = replayBuffer.getEvents(roomCode);
    expect(events.length).toBe(0);
  });

  it('should cleanup old events', () => {
    const oldEvent: GameEvent = {
      id: 'evt_old',
      type: 'game_answer',
      roomCode,
      timestamp: Date.now() - 7200000, // 2 hours ago
      version: 1,
      data: {},
    };
    
    const newEvent: GameEvent = {
      id: 'evt_new',
      type: 'game_answer',
      roomCode,
      timestamp: Date.now(),
      version: 2,
      data: {},
    };
    
    replayBuffer.addEvent(oldEvent);
    replayBuffer.addEvent(newEvent);
    
    replayBuffer.cleanupOldEvents(3600000); // 1 hour TTL
    
    const events = replayBuffer.getEvents(roomCode);
    expect(events.length).toBe(1);
    expect(events[0].id).toBe('evt_new');
  });
});

