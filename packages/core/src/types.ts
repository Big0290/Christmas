import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum GameType {
  TRIVIA_ROYALE = 'trivia_royale',
  GIFT_GRABBER = 'gift_grabber',
  WORKSHOP_TYCOON = 'workshop_tycoon',
  EMOJI_CAROL = 'emoji_carol',
  NAUGHTY_OR_NICE = 'naughty_or_nice',
  PRICE_IS_RIGHT = 'price_is_right',
}

export enum GameState {
  LOBBY = 'lobby',
  STARTING = 'starting',
  PLAYING = 'playing',
  ROUND_END = 'round_end',
  GAME_END = 'game_end',
  PAUSED = 'paused',
}

export enum PlayerStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  SPECTATING = 'spectating',
}

// ============================================================================
// PLAYER & ROOM
// ============================================================================

export interface Player {
  id: string;
  name: string;
  avatar: string;
  status: PlayerStatus;
  score: number;
  joinedAt: number;
  lastSeen: number;
}

export interface Room {
  code: string;
  hostId: string;
  createdAt: number;
  expiresAt: number;
  currentGame: GameType | null;
  gameState: GameState;
  players: Map<string, Player>;
  settings: GlobalSettings;
}

// ============================================================================
// SETTINGS SCHEMAS
// ============================================================================

export const GlobalSettingsSchema = z.object({
  roomCodeLength: z.number().min(4).max(8).default(4),
  roomExpirationHours: z.number().min(1).max(168).default(24),
  maxPlayers: z.number().min(5).max(100).default(50),
  theme: z.object({
    primaryColor: z.string().default('#c41e3a'),
    secondaryColor: z.string().default('#0f8644'),
    snowEffect: z.boolean().default(true),
    soundEnabled: z.boolean().default(true),
  }).default({}),
  avatarStyle: z.enum(['festive', 'emoji', 'random']).default('festive'),
  spectatorMode: z.boolean().default(true),
  // Room metadata
  isPublic: z.boolean().default(false),
  roomName: z.string().optional(),
  description: z.string().optional(),
});

export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;

// ============================================================================
// GAME-SPECIFIC SETTINGS
// ============================================================================

// TRIVIA ROYALE
export const TriviaRoyaleSettingsSchema = z.object({
  questionCount: z.number().min(5).max(50).default(10),
  timePerQuestion: z.number().min(5).max(60).default(15),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  imagesEnabled: z.boolean().default(true),
  scoringStrategy: z.enum(['speed', 'accuracy', 'both']).default('both'),
  speedBonusMultiplier: z.number().min(1).max(3).default(1.5),
  customQuestionSetId: z.string().nullable().default(null),
});

export type TriviaRoyaleSettings = z.infer<typeof TriviaRoyaleSettingsSchema>;

// GIFT GRABBER
export const GiftGrabberSettingsSchema = z.object({
  mapSize: z.enum(['small', 'medium', 'large']).default('medium'),
  sessionDuration: z.number().min(60).max(300).default(120),
  giftSpawnRate: z.number().min(1).max(10).default(3),
  coalSpawnRate: z.number().min(0).max(5).default(1),
  playerSpeed: z.number().min(0.5).max(2).default(1),
  collisionsEnabled: z.boolean().default(true),
});

export type GiftGrabberSettings = z.infer<typeof GiftGrabberSettingsSchema>;

// WORKSHOP TYCOON
export const WorkshopTycoonSettingsSchema = z.object({
  startingResources: z.number().min(0).max(1000).default(100),
  sessionDuration: z.number().min(120).max(600).default(300),
  upgradeCostCurve: z.enum(['linear', 'exponential']).default('exponential'),
  boostFrequency: z.number().min(10).max(60).default(30),
  productionMultiplier: z.number().min(0.5).max(3).default(1),
});

export type WorkshopTycoonSettings = z.infer<typeof WorkshopTycoonSettingsSchema>;

// EMOJI CAROL BATTLE
export const EmojiCarolSettingsSchema = z.object({
  roundCount: z.number().min(3).max(15).default(8),
  allowDuplicates: z.boolean().default(false),
  uniquePickBonus: z.number().min(0).max(10).default(5),
  customEmojiSetId: z.string().nullable().default(null),
  timePerRound: z.number().min(10).max(30).default(15),
});

export type EmojiCarolSettings = z.infer<typeof EmojiCarolSettingsSchema>;

// NAUGHTY OR NICE
export const NaughtyOrNiceSettingsSchema = z.object({
  promptCount: z.number().min(5).max(30).default(10),
  contentFilter: z.enum(['pg', 'pg13', 'none']).default('pg'),
  voteMode: z.enum(['majority', 'weighted']).default('majority'),
  revealSpeed: z.enum(['slow', 'medium', 'fast']).default('medium'),
  customPromptSetId: z.string().nullable().default(null),
  anonymousVoting: z.boolean().default(true),
});

export type NaughtyOrNiceSettings = z.infer<typeof NaughtyOrNiceSettingsSchema>;

// PRICE IS RIGHT
export const PriceIsRightSettingsSchema = z.object({
  roundCount: z.number().min(3).max(20).default(10),
  scoringMode: z.enum(['closest_without_over', 'closest_overall']).default('closest_without_over'),
  itemSelection: z.enum(['random', 'sequential', 'category']).default('random'),
  selectedCategories: z.array(z.string()).default([]),
  timeLimit: z.number().min(10).max(60).default(30),
  customItemSetId: z.string().nullable().default(null),
  showHints: z.boolean().default(false),
});

export type PriceIsRightSettings = z.infer<typeof PriceIsRightSettingsSchema>;

// Combined settings
export interface AllGameSettings {
  trivia_royale: TriviaRoyaleSettings;
  gift_grabber: GiftGrabberSettings;
  workshop_tycoon: WorkshopTycoonSettings;
  emoji_carol: EmojiCarolSettings;
  naughty_or_nice: NaughtyOrNiceSettings;
  price_is_right: PriceIsRightSettings;
}

// ============================================================================
// GAME DATA MODELS
// ============================================================================

export interface TriviaQuestion {
  id: string;
  question: string;
  answers: string[];
  correctIndex: number;
  difficulty: 'easy' | 'medium' | 'hard';
  imageUrl?: string;
  category?: string;
}

export interface PriceItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
}

export interface EmojiSet {
  id: string;
  name: string;
  emojis: string[];
}

export interface NaughtyPrompt {
  id: string;
  prompt: string;
  category: string;
  contentRating: 'pg' | 'pg13';
}

export interface WorkshopUpgrade {
  id: string;
  name: string;
  description: string;
  baseCost: number;
  productionBoost: number;
  icon: string;
}

// ============================================================================
// SOCKET EVENTS
// ============================================================================

export interface ServerToClientEvents {
  // Room events
  room_joined: (data: { player: Player; players: Player[] }) => void;
  player_joined: (player: Player) => void;
  player_left: (playerId: string) => void;
  room_state: (state: any) => void;
  
  // Game events
  game_started: (gameType: GameType) => void;
  game_state_update: (state: any) => void;
  game_ended: (results: any) => void;
  
  // Settings
  settings_updated: (settings: Partial<AllGameSettings>) => void;
  
  // Errors
  error: (message: string) => void;
  
  // Game-specific
  trivia_question: (question: TriviaQuestion, round: number) => void;
  trivia_answer_result: (correct: boolean, correctIndex: number) => void;
  
  gift_grabber_update: (state: any) => void;
  
  workshop_update: (state: any) => void;
  
  emoji_round_start: (round: number, emojis: string[]) => void;
  emoji_round_end: (results: any) => void;
  
  voting_start: (prompt: NaughtyPrompt) => void;
  voting_end: (results: any) => void;
  
  price_round_start: (item: PriceItem, round: number) => void;
  price_round_end: (results: any) => void;
}

export interface ClientToServerEvents {
  // Room events
  create_room: (playerName: string, callback: (response: any) => void) => void;
  join_room: (code: string, playerName: string, callback: (response: any) => void) => void;
  leave_room: () => void;
  
  // Host events
  start_game: (gameType: GameType) => void;
  end_game: () => void;
  pause_game: () => void;
  resume_game: () => void;
  
  // Settings
  update_settings: (gameType: GameType, settings: any) => void;
  
  // Game actions
  trivia_answer: (answerIndex: number) => void;
  gift_move: (direction: { x: number; y: number }) => void;
  workshop_upgrade: (upgradeId: string) => void;
  workshop_boost: () => void;
  emoji_pick: (emoji: string) => void;
  vote: (choice: 'naughty' | 'nice') => void;
  price_guess: (guess: number) => void;
}

// ============================================================================
// GAME STATE INTERFACES
// ============================================================================

export interface BaseGameState {
  gameType: GameType;
  state: GameState;
  round: number;
  maxRounds: number;
  startedAt: number;
  scores: Record<string, number>;
}

export interface TriviaGameState extends BaseGameState {
  gameType: GameType.TRIVIA_ROYALE;
  currentQuestion: TriviaQuestion | null;
  questionStartTime: number;
  answers: Record<string, number>;
  // Voting percentages and reveal phase
  answerCounts?: Record<number, number>; // Count of players who selected each answer index
  answerPercentages?: Record<number, number>; // Percentage for each answer
  playersByAnswer?: Record<number, string[]>; // Player names who selected each answer
  showReveal?: boolean; // Whether to show reveal phase
  revealStartTime?: number; // When reveal phase started
}

export interface GiftGrabberGameState extends BaseGameState {
  gameType: GameType.GIFT_GRABBER;
  playerPositions: Record<string, { x: number; y: number }>;
  gifts: Array<{ id: string; x: number; y: number; value: number }>;
  coals: Array<{ id: string; x: number; y: number }>;
}

export interface WorkshopGameState extends BaseGameState {
  gameType: GameType.WORKSHOP_TYCOON;
  playerResources: Record<string, number>;
  playerProduction: Record<string, number>;
  playerUpgrades: Record<string, string[]>;
}

export interface EmojiCarolGameState extends BaseGameState {
  gameType: GameType.EMOJI_CAROL;
  availableEmojis: string[];
  playerPicks: Record<string, string>;
  roundResults: any[];
}

export interface NaughtyOrNiceGameState extends BaseGameState {
  gameType: GameType.NAUGHTY_OR_NICE;
  currentPrompt: NaughtyPrompt | null;
  votes: Record<string, 'naughty' | 'nice'>;
  votingClosed: boolean;
}

export interface PriceIsRightGameState extends BaseGameState {
  gameType: GameType.PRICE_IS_RIGHT;
  currentItem: PriceItem | null;
  guesses: Record<string, number>;
  guessingClosed: boolean;
}

export type AnyGameState =
  | TriviaGameState
  | GiftGrabberGameState
  | WorkshopGameState
  | EmojiCarolGameState
  | NaughtyOrNiceGameState
  | PriceIsRightGameState;
