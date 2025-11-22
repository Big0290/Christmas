import { z } from 'zod';
import { GameType, GameState } from './types.js';

/**
 * Zod schemas for all message types used in the game engine.
 * These schemas validate inbound messages for type safety and security.
 */

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const RoomCodeSchema = z.string().length(4).regex(/^[A-Z0-9]+$/);
export const SocketIdSchema = z.string().min(1);
export const TimestampSchema = z.number().int().positive();
export const VersionSchema = z.number().int().nonnegative();

// ============================================================================
// HANDSHAKE SCHEMA
// ============================================================================

export const HandshakeSchema = z.object({
  type: z.literal('handshake'),
  roomCode: RoomCodeSchema,
  socketId: SocketIdSchema,
  role: z.enum(['player', 'host-control', 'host-display']),
  timestamp: TimestampSchema,
  version: VersionSchema.optional(),
});

// ============================================================================
// INTENT SCHEMA
// ============================================================================

export const IntentSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  playerId: SocketIdSchema,
  roomCode: RoomCodeSchema,
  action: z.string().min(1),
  data: z.any(), // Action-specific data
  timestamp: TimestampSchema,
  version: VersionSchema.optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'processed']).optional(),
});

// ============================================================================
// INTENT RESULT SCHEMA
// ============================================================================

export const IntentResultSchema = z.object({
  success: z.boolean(),
  intentId: z.string().min(1),
  eventId: z.string().min(1).optional(),
  error: z.string().optional(),
  version: VersionSchema.optional(),
});

// ============================================================================
// EVENT SCHEMA
// ============================================================================

export const EventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  roomCode: RoomCodeSchema,
  timestamp: TimestampSchema,
  version: VersionSchema,
  data: z.any(),
  intentId: z.string().min(1).optional(),
});

// ============================================================================
// STATE SYNC SCHEMA
// ============================================================================

export const StateSyncSchema = z.object({
  type: z.literal('state_sync'),
  roomCode: RoomCodeSchema,
  version: VersionSchema,
  timestamp: TimestampSchema,
  state: z.any(), // Game state (validated by game-specific schemas)
  delta: z.any().optional(), // Delta object if this is a delta update
  isDelta: z.boolean().optional(), // Whether this is a delta or full state
});

// ============================================================================
// ACK SCHEMA
// ============================================================================

export const AckSchema = z.object({
  type: z.literal('ack'),
  roomCode: RoomCodeSchema,
  version: VersionSchema,
  timestamp: TimestampSchema,
  messageType: z.enum(['state', 'player_list', 'settings']).optional(),
  clientTimestamp: TimestampSchema.optional(), // Client's timestamp for latency calculation
});

// ============================================================================
// REPLAY REQUEST SCHEMA
// ============================================================================

export const ReplayRequestSchema = z.object({
  type: z.literal('replay_request'),
  roomCode: RoomCodeSchema,
  fromVersion: VersionSchema.optional(), // Request events from this version
  fromTimestamp: TimestampSchema.optional(), // Or from this timestamp
  toVersion: VersionSchema.optional(), // To this version
  toTimestamp: TimestampSchema.optional(), // Or to this timestamp
});

// ============================================================================
// REPLAY RESPONSE SCHEMA
// ============================================================================

export const ReplayResponseSchema = z.object({
  type: z.literal('replay_response'),
  roomCode: RoomCodeSchema,
  events: z.array(EventSchema),
  snapshot: z.any().optional(), // Optional snapshot if available
  snapshotVersion: VersionSchema.optional(),
});

// ============================================================================
// FSM TRANSITION SCHEMA
// ============================================================================

export const FSMTransitionSchema = z.object({
  type: z.literal('fsm_transition'),
  roomCode: RoomCodeSchema,
  from: z.enum(['lobby', 'setup', 'round_start', 'round_end', 'scoreboard', 'next_round', 'game_end']),
  to: z.enum(['lobby', 'setup', 'round_start', 'round_end', 'scoreboard', 'next_round', 'game_end']),
  timestamp: TimestampSchema,
  gameType: z.nativeEnum(GameType).nullable(),
  round: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
});

// ============================================================================
// ERROR SCHEMA
// ============================================================================

export const ErrorSchema = z.object({
  type: z.literal('error'),
  code: z.string().min(1),
  message: z.string().min(1),
  roomCode: RoomCodeSchema.optional(),
  timestamp: TimestampSchema,
  details: z.any().optional(),
});

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateHandshake(data: unknown): z.infer<typeof HandshakeSchema> {
  return HandshakeSchema.parse(data);
}

export function validateIntent(data: unknown): z.infer<typeof IntentSchema> {
  return IntentSchema.parse(data);
}

export function validateIntentResult(data: unknown): z.infer<typeof IntentResultSchema> {
  return IntentResultSchema.parse(data);
}

export function validateEvent(data: unknown): z.infer<typeof EventSchema> {
  return EventSchema.parse(data);
}

export function validateStateSync(data: unknown): z.infer<typeof StateSyncSchema> {
  return StateSyncSchema.parse(data);
}

export function validateAck(data: unknown): z.infer<typeof AckSchema> {
  return AckSchema.parse(data);
}

export function validateReplayRequest(data: unknown): z.infer<typeof ReplayRequestSchema> {
  return ReplayRequestSchema.parse(data);
}

export function validateReplayResponse(data: unknown): z.infer<typeof ReplayResponseSchema> {
  return ReplayResponseSchema.parse(data);
}

export function validateFSMTransition(data: unknown): z.infer<typeof FSMTransitionSchema> {
  return FSMTransitionSchema.parse(data);
}

export function validateError(data: unknown): z.infer<typeof ErrorSchema> {
  return ErrorSchema.parse(data);
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type HandshakeMessage = z.infer<typeof HandshakeSchema>;
export type IntentMessage = z.infer<typeof IntentSchema>;
export type IntentResultMessage = z.infer<typeof IntentResultSchema>;
export type EventMessage = z.infer<typeof EventSchema>;
export type StateSyncMessage = z.infer<typeof StateSyncSchema>;
export type AckMessage = z.infer<typeof AckSchema>;
export type ReplayRequestMessage = z.infer<typeof ReplayRequestSchema>;
export type ReplayResponseMessage = z.infer<typeof ReplayResponseSchema>;
export type FSMTransitionMessage = z.infer<typeof FSMTransitionSchema>;
export type ErrorMessage = z.infer<typeof ErrorSchema>;

export type Message =
  | HandshakeMessage
  | IntentMessage
  | IntentResultMessage
  | EventMessage
  | StateSyncMessage
  | AckMessage
  | ReplayRequestMessage
  | ReplayResponseMessage
  | FSMTransitionMessage
  | ErrorMessage;

