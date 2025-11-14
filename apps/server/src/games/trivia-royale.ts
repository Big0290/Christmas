import {
  BaseGameEngine,
  GameType,
  GameState,
  TriviaGameState,
  TriviaQuestion,
  Player,
  shuffleArray,
  calculateSpeedBonus,
  calculateAccuracyScore,
} from '@christmas/core';

// Default trivia questions
const DEFAULT_QUESTIONS: TriviaQuestion[] = [
  {
    id: '1',
    question: 'What color is Santa\'s suit?',
    answers: ['Red', 'Blue', 'Green', 'Yellow'],
    correctIndex: 0,
    difficulty: 'easy',
    category: 'Christmas',
  },
  {
    id: '2',
    question: 'How many reindeer pull Santa\'s sleigh (including Rudolph)?',
    answers: ['8', '9', '10', '12'],
    correctIndex: 1,
    difficulty: 'easy',
    category: 'Christmas',
  },
  {
    id: '3',
    question: 'What do children typically leave out for Santa on Christmas Eve?',
    answers: ['Cookies and milk', 'Pizza', 'Candy', 'Fruit'],
    correctIndex: 0,
    difficulty: 'easy',
    category: 'Christmas',
  },
  {
    id: '4',
    question: 'In which country did the tradition of putting up a Christmas tree originate?',
    answers: ['USA', 'England', 'Germany', 'France'],
    correctIndex: 2,
    difficulty: 'medium',
    category: 'Christmas',
  },
  {
    id: '5',
    question: 'What is the name of the Grinch\'s dog?',
    answers: ['Max', 'Buddy', 'Charlie', 'Rex'],
    correctIndex: 0,
    difficulty: 'medium',
    category: 'Movies',
  },
  {
    id: '6',
    question: 'Which Christmas carol includes the lyric "Sleep in heavenly peace"?',
    answers: ['Silent Night', 'Jingle Bells', 'Deck the Halls', 'Joy to the World'],
    correctIndex: 0,
    difficulty: 'medium',
    category: 'Carols',
  },
  {
    id: '7',
    question: 'How many gifts in total were given in "The Twelve Days of Christmas"?',
    answers: ['78', '144', '364', '120'],
    correctIndex: 2,
    difficulty: 'hard',
    category: 'Carols',
  },
  {
    id: '8',
    question: 'What is the name of the famous Russian ballet about Christmas?',
    answers: ['The Nutcracker', 'Swan Lake', 'Sleeping Beauty', 'Cinderella'],
    correctIndex: 0,
    difficulty: 'easy',
    category: 'Culture',
  },
  {
    id: '9',
    question: 'In the movie Elf, what is the first rule of "The Code of Elves"?',
    answers: ['Treat every day like Christmas', 'Make toys', 'Spread cheer', 'Be nice'],
    correctIndex: 0,
    difficulty: 'medium',
    category: 'Movies',
  },
  {
    id: '10',
    question: 'Which country started the tradition of exchanging gifts?',
    answers: ['Italy', 'Germany', 'USA', 'Netherlands'],
    correctIndex: 0,
    difficulty: 'hard',
    category: 'History',
  },
];

export class TriviaRoyaleGame extends BaseGameEngine<TriviaGameState> {
  private questions: TriviaQuestion[] = [];
  private timePerQuestion: number = 15000; // 15 seconds
  private speedBonusMultiplier: number = 1.5;

  constructor(players: Map<string, Player>, customQuestions?: TriviaQuestion[]) {
    super(GameType.TRIVIA_ROYALE, players);
    this.questions = customQuestions && customQuestions.length > 0 
      ? shuffleArray(customQuestions)
      : shuffleArray(DEFAULT_QUESTIONS);
    // Update maxRounds now that questions are initialized
    this.state.maxRounds = Math.min(this.questions.length, 10);
  }

  protected createInitialState(): TriviaGameState {
    const scores: Record<string, number> = {};
    this.players.forEach((player) => {
      scores[player.id] = 0;
    });

    return {
      gameType: GameType.TRIVIA_ROYALE,
      state: GameState.LOBBY,
      round: 0,
      maxRounds: 10, // Default value, will be updated in constructor
      startedAt: 0,
      scores,
      currentQuestion: null,
      questionStartTime: 0,
      answers: {},
    };
  }

  protected onPlaying(): void {
    // Start first question (round starts at 0, so we need to increment)
    if (this.state.round === 0) {
      this.state.round = 1;
    }
    this.startNextQuestion();
  }

  protected onRoundStart(): void {
    this.startNextQuestion();
  }

  private startNextQuestion(): void {
    // Check if we've exceeded max rounds (round is 1-indexed for display)
    if (this.state.round > this.state.maxRounds) {
      this.end();
      return;
    }

    // Use round - 1 for array indexing (round is 1-indexed)
    const questionIndex = this.state.round - 1;
    if (questionIndex >= this.questions.length) {
      this.end();
      return;
    }

    this.state.currentQuestion = this.questions[questionIndex];
    this.state.questionStartTime = Date.now();
    this.state.answers = {};

    // Auto-advance after time limit
    this.setTimer(() => {
      this.endQuestion();
    }, this.timePerQuestion);
  }

  private endQuestion(): void {
    this.state.state = GameState.ROUND_END;

    // Calculate scores
    const correctIndex = this.state.currentQuestion?.correctIndex ?? -1;
    const questionStartTime = this.state.questionStartTime;

    Object.entries(this.state.answers).forEach(([playerId, answerIndex]) => {
      const correct = answerIndex === correctIndex;
      const answerTime = Date.now() - questionStartTime;

      let points = 0;
      if (correct) {
        points += calculateAccuracyScore(true, 100);
        points += calculateSpeedBonus(answerTime, this.timePerQuestion, this.speedBonusMultiplier);
      }

      this.updateScore(playerId, points);
    });

    // Move to next question after 5 seconds
    this.setTimer(() => {
      this.nextRound();
    }, 5000);
  }

  handlePlayerAction(playerId: string, action: string, data: any): void {
    if (action === 'answer' && this.state.state === GameState.PLAYING) {
      if (this.state.answers[playerId] === undefined) {
        this.state.answers[playerId] = data.answerIndex;

        // If all players answered, end question early
        if (Object.keys(this.state.answers).length === this.players.size) {
          this.clearTimer();
          this.endQuestion();
        }
      }
    }
  }

  getClientState(playerId: string): any {
    return {
      ...this.state,
      currentQuestion: this.state.currentQuestion
        ? {
            ...this.state.currentQuestion,
            // Don't send correct answer to clients until round ends
            correctIndex:
              this.state.state === GameState.ROUND_END
                ? this.state.currentQuestion.correctIndex
                : undefined,
          }
        : null,
      hasAnswered: this.state.answers[playerId] !== undefined,
      scoreboard: this.getScoreboard(),
    };
  }
}
