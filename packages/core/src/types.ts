import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export enum GameType {
  TRIVIA_ROYALE = 'trivia_royale',
  EMOJI_CAROL = 'emoji_carol',
  NAUGHTY_OR_NICE = 'naughty_or_nice',
  PRICE_IS_RIGHT = 'price_is_right',
  BINGO = 'bingo',
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
  language?: 'en' | 'fr'; // Player's preferred language for game content
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
    sparkles: z.boolean().default(true),
    icicles: z.boolean().default(false),
    frostPattern: z.boolean().default(true),
    colorScheme: z.enum(['traditional', 'winter', 'mixed']).default('mixed'),
  }).default({}),
  avatarStyle: z.enum(['festive', 'emoji', 'random']).default('festive'),
  spectatorMode: z.boolean().default(true),
  // Room metadata
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
  timePerRound: z.number().min(5).max(60).default(15),
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

// BINGO
export const BingoSettingsSchema = z.object({
  roundCount: z.number().min(3).max(15).default(5),
  itemsPerCall: z.number().min(1).max(1).default(1),
  callIntervalSeconds: z.number().min(1).max(10).default(2.5),
  pointsPerLine: z.number().min(50).max(500).default(100),
  speedBonusMultiplier: z.number().min(1).max(3).default(1.5),
});

export type BingoSettings = z.infer<typeof BingoSettingsSchema>;

// Combined settings
export interface AllGameSettings {
  trivia_royale: TriviaRoyaleSettings;
  emoji_carol: EmojiCarolSettings;
  naughty_or_nice: NaughtyOrNiceSettings;
  price_is_right: PriceIsRightSettings;
  bingo: BingoSettings;
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
  translations?: Record<string, { question: string; answers: string[] }>; // Language code -> translated content
}

export interface PriceItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  translations?: Record<string, { name: string; description: string }>; // Language code -> translated content
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
  translations?: Record<string, { prompt: string }>; // Language code -> translated content
}

export interface BingoItem {
  id: string;
  emoji: string;
  name: string;
  column: 'B' | 'I' | 'N' | 'G' | 'O'; // B-I-N-G-O column
  number: number; // 1-5 for each column (except N3 which is FREE)
  callString: string; // e.g., "B-3" or "I-5"
}

export interface BingoCard {
  grid: (BingoItem | null)[][]; // 5x5 grid, center (2,2) is null
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
  room_update: (data: { players: Player[]; playerCount: number }) => void;
  
  // Game events
  game_started: (gameType: GameType) => void;
  game_state_update: (state: any) => void;
  game_ended: (results: any) => void;
  
  // Sound events
  sound_event: (data: { sound: 'gameStart' | 'roundEnd' | 'gameEnd'; timestamp: number }) => void;
  
  // Settings
  settings_updated: (settings: Partial<AllGameSettings>) => void;
  
  // Errors
  error: (message: string) => void;
  
  // Game-specific
  trivia_question: (question: TriviaQuestion, round: number) => void;
  trivia_answer_result: (correct: boolean, correctIndex: number) => void;
  
  emoji_round_start: (round: number, emojis: string[]) => void;
  emoji_round_end: (results: any) => void;
  
  voting_start: (prompt: NaughtyPrompt) => void;
  voting_end: (results: any) => void;
  
  price_round_start: (item: PriceItem, round: number) => void;
  price_round_end: (results: any) => void;
  
  bingo_card_generated: (card: BingoCard) => void;
  bingo_item_called: (item: BingoItem, callNumber: number) => void;
  bingo_line_completed: (playerId: string, lineType: string, points: number) => void;
  
  // Jukebox
  jukebox_state: (state: { currentTrack: number; isPlaying: boolean; shuffle: boolean; repeat: 'none' | 'one' | 'all'; volume: number; progress?: number }) => void;
}

export interface ClientToServerEvents {
  // Room events
  create_room: (playerName: string, authToken: string | undefined, language?: 'en' | 'fr', callback?: (response: any) => void) => void;
  join_room: (code: string, playerName: string, preferredAvatar?: string, language?: 'en' | 'fr', callback?: (response: any) => void) => void;
  leave_room: () => void;
  reconnect_player: (roomCode: string, playerToken: string, language?: 'en' | 'fr', callback?: (response: any) => void) => void;
  reconnect_host: (roomCode: string, hostToken: string, language?: 'en' | 'fr', callback?: (response: any) => void) => void;
  
  // Room management events
  get_my_room: (callback: (response: { success: boolean; room?: { code: string; hostToken: string; roomName?: string; description?: string; playerCount: number; isActive: boolean } | null; error?: string }) => void) => void;
  get_room_players: (roomCode: string, callback: (response: { success: boolean; players?: Player[]; error?: string }) => void) => void;
  
  // Host events
  start_game: (gameType: GameType) => void;
  end_game: () => void;
  pause_game: () => void;
  resume_game: () => void;
  
  // Settings
  update_settings: (gameType: GameType, settings: any) => void;
  
  // Game actions
  trivia_answer: (answerIndex: number) => void;
  emoji_pick: (emoji: string) => void;
  vote: (choice: 'naughty' | 'nice') => void;
  price_guess: (guess: number) => void;
  bingo_mark: (row: number, col: number) => void;
  
  // Jukebox control (host only)
  jukebox_control: (roomCode: string, action: 'play' | 'pause' | 'next' | 'previous' | 'select' | 'shuffle' | 'repeat' | 'volume' | 'seek', data?: any) => void;
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

export interface EmojiCarolGameState extends BaseGameState {
  gameType: GameType.EMOJI_CAROL;
  availableEmojis: string[];
  playerPicks: Record<string, string>;
  roundResults: any[];
  roundStartTime: number;
  pickTimes: Record<string, number>; // Track when each player picked
}

export interface NaughtyOrNiceGameState extends BaseGameState {
  gameType: GameType.NAUGHTY_OR_NICE;
  currentPrompt: NaughtyPrompt | null;
  votes: Record<string, 'naughty' | 'nice'>;
  votingClosed: boolean;
  roundStartTime: number;
  voteTimes: Record<string, number>; // Track when each player voted
}

export interface PriceIsRightGameState extends BaseGameState {
  gameType: GameType.PRICE_IS_RIGHT;
  currentItem: PriceItem | null;
  guesses: Record<string, number>;
  guessingClosed: boolean;
  roundStartTime: number;
  guessTimes: Record<string, number>; // Track when each player guessed
}

export interface BingoGameState extends BaseGameState {
  gameType: GameType.BINGO;
  currentCard: BingoCard | null; // Host's reference card
  playerCards: Record<string, BingoCard>; // Each player's unique card
  calledItems: BingoItem[]; // Items called so far
  currentItem: BingoItem | null; // Currently displayed item
  markedCells: Record<string, boolean[][]>; // Marked positions per player [row][col]
  completedLines: Record<string, string[]>; // Completed line types per player ['horizontal-0', 'vertical-2', etc.]
  winners: string[]; // Players who completed lines this round
  callInterval: number; // Time between calls in ms
  nextCallTime: number; // When next item will be called
  roundStartTime: number; // When current round started
  itemsCalled: number; // Number of items called in current round
}

export type AnyGameState =
  | TriviaGameState
  | EmojiCarolGameState
  | NaughtyOrNiceGameState
  | PriceIsRightGameState
  | BingoGameState;
