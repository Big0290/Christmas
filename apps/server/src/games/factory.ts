import { GameType, Player, BaseGameEngine, TriviaQuestion, PriceItem } from '@christmas/core';
import { TriviaRoyaleGame } from './trivia-royale.js';
import { GiftGrabberGame } from './gift-grabber.js';
import { WorkshopTycoonGame } from './workshop-tycoon.js';
import { EmojiCarolGame } from './emoji-carol.js';
import { NaughtyOrNiceGame } from './naughty-or-nice.js';
import { PriceIsRightGame } from './price-is-right.js';

export class GameFactory {
  static createGame(
    gameType: GameType, 
    players: Map<string, Player>,
    customQuestions?: TriviaQuestion[],
    customItems?: PriceItem[]
  ): BaseGameEngine | null {
    switch (gameType) {
      case GameType.TRIVIA_ROYALE:
        return new TriviaRoyaleGame(players, customQuestions);
      
      case GameType.GIFT_GRABBER:
        return new GiftGrabberGame(players);
      
      case GameType.WORKSHOP_TYCOON:
        return new WorkshopTycoonGame(players);
      
      case GameType.EMOJI_CAROL:
        return new EmojiCarolGame(players);
      
      case GameType.NAUGHTY_OR_NICE:
        return new NaughtyOrNiceGame(players);
      
      case GameType.PRICE_IS_RIGHT:
        return new PriceIsRightGame(players, customItems);
      
      default:
        return null;
    }
  }
}
