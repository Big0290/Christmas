import { GameType, Player, BaseGameEngine, TriviaQuestion, PriceItem, NaughtyPrompt } from '@christmas/core';
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
    timeSettings?: {
      timePerQuestion?: number;
      timeLimit?: number;
      timePerRound?: number;
    }
  ): BaseGameEngine | null {
    switch (gameType) {
      case GameType.TRIVIA_ROYALE:
        return new TriviaRoyaleGame(players, customQuestions, timeSettings?.timePerQuestion);
      
      case GameType.EMOJI_CAROL:
        return new EmojiCarolGame(players, timeSettings?.timePerRound);
      
      case GameType.NAUGHTY_OR_NICE:
        return new NaughtyOrNiceGame(players, customPrompts, timeSettings?.timePerRound);
      
      case GameType.PRICE_IS_RIGHT:
        return new PriceIsRightGame(players, customItems, timeSettings?.timeLimit);
      
      default:
        return null;
    }
  }
}
