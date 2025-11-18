import {
  GameType,
  Player,
  BaseGameEngine,
  TriviaQuestion,
  PriceItem,
  NaughtyPrompt,
  TriviaRoyaleSettings,
  PriceIsRightSettings,
  NaughtyOrNiceSettings,
  EmojiCarolSettings,
} from '@christmas/core';
import { TriviaRoyaleGame } from './trivia-royale.js';
import { EmojiCarolGame } from './emoji-carol.js';
import { NaughtyOrNiceGame } from './naughty-or-nice.js';
import { PriceIsRightGame } from './price-is-right.js';

export class GameFactory {
  static createGame(
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
  ): BaseGameEngine | null {
    switch (gameType) {
      case GameType.TRIVIA_ROYALE:
        return new TriviaRoyaleGame(players, customQuestions, settings as TriviaRoyaleSettings);

      case GameType.EMOJI_CAROL:
        return new EmojiCarolGame(players, settings as EmojiCarolSettings);

      case GameType.NAUGHTY_OR_NICE:
        return new NaughtyOrNiceGame(players, customPrompts, settings as NaughtyOrNiceSettings);

      case GameType.PRICE_IS_RIGHT:
        return new PriceIsRightGame(players, customItems, settings as PriceIsRightSettings);

      default:
        return null;
    }
  }
}
