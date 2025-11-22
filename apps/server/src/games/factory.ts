import {
  GameType,
  Player,
  PluginGameEngine,
  TriviaQuestion,
  PriceItem,
  NaughtyPrompt,
  TriviaRoyaleSettings,
  PriceIsRightSettings,
  NaughtyOrNiceSettings,
  EmojiCarolSettings,
  BingoSettings,
} from '@christmas/core';
import { TriviaRoyaleGame } from './trivia-royale.js';
import { EmojiCarolGame } from './emoji-carol.js';
import { NaughtyOrNiceGame } from './naughty-or-nice.js';
import { PriceIsRightGame } from './price-is-right.js';
import { BingoGame } from './bingo.js';

export class GameFactory {
  /**
   * Create a game instance.
   * All games now extend PluginGameEngine directly, providing FSM and plugin support.
   */
  static createGame(
    gameType: GameType,
    players: Map<string, Player>,
    roomCode: string,
    customQuestions?: TriviaQuestion[],
    customItems?: PriceItem[],
    customPrompts?: NaughtyPrompt[],
    settings?:
      | TriviaRoyaleSettings
      | PriceIsRightSettings
      | NaughtyOrNiceSettings
      | EmojiCarolSettings
      | BingoSettings
  ): PluginGameEngine | null {
    switch (gameType) {
      case GameType.TRIVIA_ROYALE:
        return new TriviaRoyaleGame(players, roomCode, customQuestions, settings as TriviaRoyaleSettings);
      
      case GameType.BINGO:
        return new BingoGame(players, roomCode, settings as BingoSettings);
      
      case GameType.PRICE_IS_RIGHT:
        return new PriceIsRightGame(players, roomCode, customItems, settings as PriceIsRightSettings);
      
      case GameType.NAUGHTY_OR_NICE:
        return new NaughtyOrNiceGame(players, roomCode, customPrompts, settings as NaughtyOrNiceSettings);
      
      case GameType.EMOJI_CAROL:
        return new EmojiCarolGame(players, roomCode, settings as EmojiCarolSettings);
      
      default:
        return null;
    }
  }

  /**
   * Create game without roomCode (legacy support - uses empty string)
   * @deprecated Use createGame with roomCode instead
   */
  static createGameLegacy(
    gameType: GameType,
    players: Map<string, Player>,
    customQuestions?: TriviaQuestion[],
    customItems?: PriceItem[],
    customPrompts?: NaughtyPrompt[],
    settings?:
      | TriviaRoyaleSettings
      | PriceIsRightSettings
      | NaughtyOrNiceSettings
      | EmojiCarolSettings
      | BingoSettings
  ): PluginGameEngine | null {
    return this.createGame(gameType, players, '', customQuestions, customItems, customPrompts, settings);
  }
}
