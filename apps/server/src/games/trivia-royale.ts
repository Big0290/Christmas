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
  TriviaRoyaleSettings,
} from '@christmas/core';
import { translateQuestion } from '../utils/translations.js';

// Default trivia questions
const DEFAULT_QUESTIONS: TriviaQuestion[] = [
  {
    id: '1',
    question: "What color is Santa's suit?",
    answers: ['Red', 'Blue', 'Green', 'Yellow'],
    correctIndex: 0,
    difficulty: 'easy',
    category: 'Christmas',
    translations: {
      en: {
        question: "What color is Santa's suit?",
        answers: ['Red', 'Blue', 'Green', 'Yellow'],
      },
      fr: {
        question: 'De quelle couleur est le costume du Père Noël ?',
        answers: ['Rouge', 'Bleu', 'Vert', 'Jaune'],
      },
    },
  },
  {
    id: '2',
    question: "How many reindeer pull Santa's sleigh (including Rudolph)?",
    answers: ['8', '9', '10', '12'],
    correctIndex: 1,
    difficulty: 'easy',
    category: 'Christmas',
    translations: {
      en: {
        question: "How many reindeer pull Santa's sleigh (including Rudolph)?",
        answers: ['8', '9', '10', '12'],
      },
      fr: {
        question: 'Combien de rennes tirent le traîneau du Père Noël (y compris Rudolph) ?',
        answers: ['8', '9', '10', '12'],
      },
    },
  },
  {
    id: '3',
    question: 'What do children typically leave out for Santa on Christmas Eve?',
    answers: ['Cookies and milk', 'Pizza', 'Candy', 'Fruit'],
    correctIndex: 0,
    difficulty: 'easy',
    category: 'Christmas',
    translations: {
      en: {
        question: 'What do children typically leave out for Santa on Christmas Eve?',
        answers: ['Cookies and milk', 'Pizza', 'Candy', 'Fruit'],
      },
      fr: {
        question: 'Que les enfants laissent-ils généralement pour le Père Noël la veille de Noël ?',
        answers: ['Des biscuits et du lait', 'De la pizza', 'Des bonbons', 'Des fruits'],
      },
    },
  },
  {
    id: '4',
    question: 'In which country did the tradition of putting up a Christmas tree originate?',
    answers: ['USA', 'England', 'Germany', 'France'],
    correctIndex: 2,
    difficulty: 'medium',
    category: 'Christmas',
    translations: {
      en: {
        question: 'In which country did the tradition of putting up a Christmas tree originate?',
        answers: ['USA', 'England', 'Germany', 'France'],
      },
      fr: {
        question: 'Dans quel pays la tradition de mettre un sapin de Noël a-t-elle commencé ?',
        answers: ['États-Unis', 'Angleterre', 'Allemagne', 'France'],
      },
    },
  },
  {
    id: '5',
    question: "What is the name of the Grinch's dog?",
    answers: ['Max', 'Buddy', 'Charlie', 'Rex'],
    correctIndex: 0,
    difficulty: 'medium',
    category: 'Movies',
    translations: {
      en: {
        question: "What is the name of the Grinch's dog?",
        answers: ['Max', 'Buddy', 'Charlie', 'Rex'],
      },
      fr: {
        question: 'Quel est le nom du chien du Grinch ?',
        answers: ['Max', 'Buddy', 'Charlie', 'Rex'],
      },
    },
  },
  {
    id: '6',
    question: 'Which Christmas carol includes the lyric "Sleep in heavenly peace"?',
    answers: ['Silent Night', 'Jingle Bells', 'Deck the Halls', 'Joy to the World'],
    correctIndex: 0,
    difficulty: 'medium',
    category: 'Carols',
    translations: {
      en: {
        question: 'Which Christmas carol includes the lyric "Sleep in heavenly peace"?',
        answers: ['Silent Night', 'Jingle Bells', 'Deck the Halls', 'Joy to the World'],
      },
      fr: {
        question: 'Quel chant de Noël contient les paroles "Dors en paix céleste" ?',
        answers: ['Douce nuit', 'Vive le vent', 'Décorons la salle', 'Joie au monde'],
      },
    },
  },
  {
    id: '7',
    question: 'How many gifts in total were given in "The Twelve Days of Christmas"?',
    answers: ['78', '144', '364', '120'],
    correctIndex: 2,
    difficulty: 'hard',
    category: 'Carols',
    translations: {
      en: {
        question: 'How many gifts in total were given in "The Twelve Days of Christmas"?',
        answers: ['78', '144', '364', '120'],
      },
      fr: {
        question: 'Combien de cadeaux au total ont été donnés dans "Les Douze Jours de Noël" ?',
        answers: ['78', '144', '364', '120'],
      },
    },
  },
  {
    id: '8',
    question: 'What is the name of the famous Russian ballet about Christmas?',
    answers: ['The Nutcracker', 'Swan Lake', 'Sleeping Beauty', 'Cinderella'],
    correctIndex: 0,
    difficulty: 'easy',
    category: 'Culture',
    translations: {
      en: {
        question: 'What is the name of the famous Russian ballet about Christmas?',
        answers: ['The Nutcracker', 'Swan Lake', 'Sleeping Beauty', 'Cinderella'],
      },
      fr: {
        question: 'Quel est le nom du célèbre ballet russe sur Noël ?',
        answers: ['Casse-Noisette', 'Le Lac des cygnes', 'La Belle au bois dormant', 'Cendrillon'],
      },
    },
  },
  {
    id: '9',
    question: 'In the movie Elf, what is the first rule of "The Code of Elves"?',
    answers: ['Treat every day like Christmas', 'Make toys', 'Spread cheer', 'Be nice'],
    correctIndex: 0,
    difficulty: 'medium',
    category: 'Movies',
    translations: {
      en: {
        question: 'In the movie Elf, what is the first rule of "The Code of Elves"?',
        answers: ['Treat every day like Christmas', 'Make toys', 'Spread cheer', 'Be nice'],
      },
      fr: {
        question: 'Dans le film Elf, quelle est la première règle du "Code des Elfes" ?',
        answers: [
          'Traiter chaque jour comme Noël',
          'Fabriquer des jouets',
          'Répandre la joie',
          'Être gentil',
        ],
      },
    },
  },
  {
    id: '10',
    question: 'Which country started the tradition of exchanging gifts?',
    answers: ['Italy', 'Germany', 'USA', 'Netherlands'],
    correctIndex: 0,
    difficulty: 'hard',
    category: 'History',
    translations: {
      en: {
        question: 'Which country started the tradition of exchanging gifts?',
        answers: ['Italy', 'Germany', 'USA', 'Netherlands'],
      },
      fr: {
        question: "Quel pays a commencé la tradition d'échanger des cadeaux ?",
        answers: ['Italie', 'Allemagne', 'États-Unis', 'Pays-Bas'],
      },
    },
  },
];

export class TriviaRoyaleGame extends BaseGameEngine<TriviaGameState> {
  private questions: TriviaQuestion[] = [];
  private timePerQuestion: number = 15000; // 15 seconds
  private speedBonusMultiplier: number = 1.5;
  private settings: TriviaRoyaleSettings;

  constructor(
    players: Map<string, Player>,
    customQuestions?: TriviaQuestion[],
    settings?: TriviaRoyaleSettings
  ) {
    super(GameType.TRIVIA_ROYALE, players);

    // Use provided settings or defaults
    this.settings = settings || {
      questionCount: 10,
      timePerQuestion: 15,
      difficulty: 'mixed',
      imagesEnabled: true,
      scoringStrategy: 'both',
      speedBonusMultiplier: 1.5,
      customQuestionSetId: null,
    };

    this.questions =
      customQuestions && customQuestions.length > 0
        ? shuffleArray(customQuestions)
        : shuffleArray(DEFAULT_QUESTIONS);

    // Filter by difficulty if not 'mixed'
    if (this.settings.difficulty !== 'mixed') {
      this.questions = this.questions.filter((q) => q.difficulty === this.settings.difficulty);
    }

    // Update maxRounds based on questionCount setting
    this.state.maxRounds = Math.min(this.questions.length, this.settings.questionCount);

    // Set time per question (convert seconds to milliseconds)
    this.timePerQuestion = this.settings.timePerQuestion * 1000;

    // Set speed bonus multiplier
    this.speedBonusMultiplier = this.settings.speedBonusMultiplier;
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

    // Calculate voting statistics
    const answerCounts: Record<number, number> = {};
    const playersByAnswer: Record<number, string[]> = {};

    // Initialize counts
    if (this.state.currentQuestion) {
      for (let i = 0; i < this.state.currentQuestion.answers.length; i++) {
        answerCounts[i] = 0;
        playersByAnswer[i] = [];
      }
    }

    // Count answers
    const totalAnswers = Object.keys(this.state.answers).length;
    Object.entries(this.state.answers).forEach(([playerId, answerIndex]) => {
      answerCounts[answerIndex] = (answerCounts[answerIndex] || 0) + 1;

      // Get player name
      const player = this.players.get(playerId);
      if (player) {
        if (!playersByAnswer[answerIndex]) {
          playersByAnswer[answerIndex] = [];
        }
        playersByAnswer[answerIndex].push(player.name);
      }
    });

    // Calculate percentages
    const answerPercentages: Record<number, number> = {};
    if (totalAnswers > 0) {
      for (const [index, count] of Object.entries(answerCounts)) {
        answerPercentages[parseInt(index)] = Math.round((count / totalAnswers) * 100);
      }
    }

    // Store in state
    this.state.answerCounts = answerCounts;
    this.state.answerPercentages = answerPercentages;
    this.state.playersByAnswer = playersByAnswer;
    this.state.showReveal = true;
    this.state.revealStartTime = Date.now();

    // Calculate scores
    const correctIndex = this.state.currentQuestion?.correctIndex ?? -1;
    const questionStartTime = this.state.questionStartTime;

    Object.entries(this.state.answers).forEach(([playerId, answerIndex]) => {
      const correct = answerIndex === correctIndex;
      const answerTime = Date.now() - questionStartTime;

      let points = 0;
      if (correct) {
        // Apply scoring strategy
        if (
          this.settings.scoringStrategy === 'accuracy' ||
          this.settings.scoringStrategy === 'both'
        ) {
          points += calculateAccuracyScore(true, 100);
        }
        if (this.settings.scoringStrategy === 'speed' || this.settings.scoringStrategy === 'both') {
          points += calculateSpeedBonus(
            answerTime,
            this.timePerQuestion,
            this.speedBonusMultiplier
          );
        }
      }

      this.updateScore(playerId, points);
    });

    // Move to next question after reveal phase (extend to 8 seconds for reveal)
    this.setTimer(() => {
      // Clear reveal data
      this.state.showReveal = false;
      this.state.answerCounts = undefined;
      this.state.answerPercentages = undefined;
      this.state.playersByAnswer = undefined;
      this.nextRound();
    }, 8000); // Extended to 8 seconds to show reveal
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

  protected onMigratePlayer(oldPlayerId: string, newPlayerId: string): void {
    // Migrate answer if it exists
    if (this.state.answers && this.state.answers[oldPlayerId] !== undefined) {
      this.state.answers[newPlayerId] = this.state.answers[oldPlayerId];
      delete this.state.answers[oldPlayerId];
      console.log(
        `[Trivia] Migrated answer from ${oldPlayerId.substring(0, 8)} to ${newPlayerId.substring(0, 8)}`
      );
    }
  }

  getClientState(playerId: string): any {
    // Get player's language preference, default to English
    const player = this.players.get(playerId);
    const language = player?.language || 'en';

    // Translate current question if it exists
    let translatedQuestion = null;
    if (this.state.currentQuestion) {
      translatedQuestion = translateQuestion(this.state.currentQuestion, language);
      // Don't send correct answer to clients until round ends
      translatedQuestion = {
        ...translatedQuestion,
        correctIndex:
          this.state.state === GameState.ROUND_END ? translatedQuestion.correctIndex : undefined,
      };
    }

    return {
      ...this.state,
      currentQuestion: translatedQuestion,
      hasAnswered: this.state.answers[playerId] !== undefined,
      scoreboard: this.getScoreboard(),
      // Include voting statistics for reveal phase
      answerCounts: this.state.answerCounts,
      answerPercentages: this.state.answerPercentages,
      playersByAnswer: this.state.playersByAnswer,
      showReveal: this.state.showReveal,
      revealStartTime: this.state.revealStartTime,
    };
  }
}
