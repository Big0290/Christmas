import {
  PluginGameEngine,
  GameType,
  GameState,
  BingoGameState,
  BingoItem,
  BingoCard,
  Player,
  BingoSettings,
  Room,
  RenderDescriptor,
  shuffleArray,
  calculateSpeedBonus,
} from '@christmas/core';

// Default bingo items: Santa hat, candy cane, wreath, presents, elf shoes
// Each item type appears in each column (B, I, N, G, O) with numbers 1-5
// Column mapping: B=0, I=1, N=2, G=3, O=4
const BINGO_COLUMNS: Array<'B' | 'I' | 'N' | 'G' | 'O'> = ['B', 'I', 'N', 'G', 'O'];
const ITEM_TYPES = [
  { id: 'santa-hat', emoji: '🎅', name: 'Santa Hat' },
  { id: 'candy-cane', emoji: '🍬', name: 'Candy Cane' },
  { id: 'wreath', emoji: '🎄', name: 'Wreath' },
  { id: 'presents', emoji: '🎁', name: 'Presents' },
  { id: 'elf-shoes', emoji: '👞', name: 'Elf Shoes' },
];

// Generate all possible Bingo items (5 columns × 5 numbers = 25 items, but N3 is FREE)
function generateBingoItems(): BingoItem[] {
  const items: BingoItem[] = [];
  
  for (const column of BINGO_COLUMNS) {
    for (let number = 1; number <= 5; number++) {
      // Skip N3 (center) - it's FREE
      if (column === 'N' && number === 3) {
        continue;
      }
      
      // Assign items to columns (shuffled per column for variety)
      const itemTypeIndex = (BINGO_COLUMNS.indexOf(column) + (number - 1)) % ITEM_TYPES.length;
      const itemType = ITEM_TYPES[itemTypeIndex];
      
      items.push({
        id: `${column.toLowerCase()}-${number}-${itemType.id}`,
        emoji: itemType.emoji,
        name: itemType.name,
        column,
        number,
        callString: `${column}-${number}`,
      });
    }
  }
  
  return items;
}

const DEFAULT_BINGO_ITEMS: BingoItem[] = generateBingoItems();

export class BingoGame extends PluginGameEngine<BingoGameState> {
  private settings: BingoSettings;
  private availableItems: BingoItem[] = [...DEFAULT_BINGO_ITEMS];
  private callTimer: NodeJS.Timeout | null = null;

  constructor(players: Map<string, Player>, roomCode: string, settings?: BingoSettings) {
    super(GameType.BINGO, players, roomCode);

    this.settings = settings || {
      roundCount: 5,
      itemsPerCall: 1,
      callIntervalSeconds: 2.5,
      pointsPerLine: 100,
      speedBonusMultiplier: 1.5,
    };

    // Update state with actual settings (since createInitialState runs before this.settings is set)
    this.state.maxRounds = this.settings.roundCount;
    this.state.callInterval = this.settings.callIntervalSeconds * 1000;
    
    console.log(`[BingoGame] Settings applied:`, {
      roundCount: this.settings.roundCount,
      maxRounds: this.state.maxRounds,
      callIntervalSeconds: this.settings.callIntervalSeconds,
      callIntervalMs: this.state.callInterval,
      itemsPerCall: this.settings.itemsPerCall,
      pointsPerLine: this.settings.pointsPerLine,
      speedBonusMultiplier: this.settings.speedBonusMultiplier
    });
  }

  protected createInitialState(): BingoGameState {
    const scores: Record<string, number> = {};
    this.players.forEach((player) => {
      scores[player.id] = 0;
    });

    // Use default values here since this.settings is not yet set when super() calls this
    // Actual values will be set in constructor after super() completes
    const defaultCallInterval = 2.5 * 1000; // Default 2.5 seconds in ms

    return {
      gameType: GameType.BINGO,
      state: GameState.LOBBY,
      round: 0,
      maxRounds: 5, // Will be updated in constructor
      startedAt: 0,
      scores,
      currentCard: null,
      playerCards: {},
      calledItems: [],
      currentItem: null,
      markedCells: {},
      completedLines: {},
      winners: [],
      callInterval: defaultCallInterval, // Will be updated in constructor
      nextCallTime: 0,
      roundStartTime: 0,
      itemsCalled: 0,
    };
  }

  protected onPlaying(): void {
    if (this.state.round === 0) {
      this.state.round = 1;
    }
    this.startRound();
  }

  protected onRoundStart(): void {
    this.startRound();
  }

  protected onPause(): void {
    this.clearCallTimer();
  }

  protected onResume(): void {
    if (this.state.state === GameState.PLAYING) {
      this.scheduleNextCall();
    }
  }

  protected onEnd(): void {
    this.clearCallTimer();
  }

  protected onDestroy(): void {
    this.clearCallTimer();
  }

  private startRound(): void {
    // Reset round state
    this.state.calledItems = [];
    this.state.currentItem = null;
    this.state.markedCells = {};
    this.state.completedLines = {};
    this.state.winners = [];
    this.state.itemsCalled = 0;
    this.state.roundStartTime = Date.now();

    // Generate unique cards for each player
    this.generateCards();

    // Start automatic calling after a delay to allow rules modal to be read
    // The rules modal auto-dismisses after 5 seconds, so we wait 6 seconds to be safe
    this.setTimer(() => {
      this.scheduleNextCall();
    }, 6000); // 6 second delay before first call to allow rules modal time
  }

  private generateCards(): void {
    const playerIds = Array.from(this.players.keys());
    
    // Generate unique card for each player
    // Each column (B, I, N, G, O) gets items from that column only
    // Column B=0, I=1, N=2, G=3, O=4
    playerIds.forEach((playerId) => {
      const card: BingoCard = {
        grid: [
          [null, null, null, null, null],
          [null, null, null, null, null],
          [null, null, null, null, null], // Center (2,2) will stay null (N3 - FREE)
          [null, null, null, null, null],
          [null, null, null, null, null],
        ],
      };

      // Fill each column with its appropriate items
      for (let col = 0; col < 5; col++) {
        const columnLetter = BINGO_COLUMNS[col];
        
        // Get all items for this column (e.g., B1, B2, B3, B4, B5)
        const columnItems = DEFAULT_BINGO_ITEMS.filter(item => item.column === columnLetter);
        
        // Shuffle items for this column for variety between cards
        const shuffledColumnItems = shuffleArray([...columnItems]);
        
        // Place items in this column (row 0-4, but skip N3 which is row 2, col 2)
        let itemIndex = 0;
        for (let row = 0; row < 5; row++) {
          // Skip center (N3)
          if (row === 2 && col === 2) {
            continue;
          }
          
          if (itemIndex < shuffledColumnItems.length) {
            // Create a new object reference for each placement
            card.grid[row][col] = { ...shuffledColumnItems[itemIndex] };
            itemIndex++;
          }
        }
      }

      this.state.playerCards[playerId] = card;

      // Initialize marked cells for this player
      this.state.markedCells[playerId] = [
        [false, false, false, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false],
        [false, false, false, false, false],
      ];

      // Center cell is always marked (free space)
      this.state.markedCells[playerId][2][2] = true;

      // Initialize completed lines
      this.state.completedLines[playerId] = [];
    });

    // Generate a reference card for the host (can be any player's card)
    if (playerIds.length > 0) {
      this.state.currentCard = this.state.playerCards[playerIds[0]];
    }
  }

  private scheduleNextCall(): void {
    if (this.state.state !== GameState.PLAYING) {
      return;
    }

    // Get all unique items that haven't been called yet (only 5 unique items total)
    const calledItemIds = new Set(this.state.calledItems.map((item) => item.id));
    const availableItems = DEFAULT_BINGO_ITEMS.filter(
      (item) => !calledItemIds.has(item.id)
    );

    // If all unique items have been called, continue calling randomly
    // This allows multiple calls of the same item type
    let nextItem: BingoItem;
    if (availableItems.length === 0) {
      // All items have been called at least once, pick randomly from all items
      nextItem = DEFAULT_BINGO_ITEMS[Math.floor(Math.random() * DEFAULT_BINGO_ITEMS.length)];
    } else {
      // Pick a random available item that hasn't been called yet
      nextItem = availableItems[Math.floor(Math.random() * availableItems.length)];
    }

    // Call the item immediately
    this.callItem(nextItem);

    // Schedule next call
    this.state.nextCallTime = Date.now() + this.state.callInterval;
    this.callTimer = setTimeout(() => {
      this.callTimer = null;
      this.scheduleNextCall();
    }, this.state.callInterval);
  }

  private callItem(item: BingoItem): void {
    this.state.calledItems.push(item);
    this.state.currentItem = item;
    this.state.itemsCalled++;

    // Note: The actual broadcasting happens in socket handlers
    // We just update the state here
  }

  private clearCallTimer(): void {
    if (this.callTimer) {
      clearTimeout(this.callTimer);
      this.callTimer = null;
    }
  }

  private checkForCompletedLines(playerId: string): string[] {
    const marked = this.state.markedCells[playerId];
    const completed: string[] = [];

    // Check horizontals (5 rows)
    for (let row = 0; row < 5; row++) {
      let allMarked = true;
      for (let col = 0; col < 5; col++) {
        if (!marked[row][col]) {
          allMarked = false;
          break;
        }
      }
      if (allMarked) {
        const lineType = `horizontal-${row}`;
        if (!this.state.completedLines[playerId].includes(lineType)) {
          completed.push(lineType);
        }
      }
    }

    // Check verticals (5 columns)
    for (let col = 0; col < 5; col++) {
      let allMarked = true;
      for (let row = 0; row < 5; row++) {
        if (!marked[row][col]) {
          allMarked = false;
          break;
        }
      }
      if (allMarked) {
        const lineType = `vertical-${col}`;
        if (!this.state.completedLines[playerId].includes(lineType)) {
          completed.push(lineType);
        }
      }
    }

    // Check diagonal top-left to bottom-right
    let allMarked = true;
    for (let i = 0; i < 5; i++) {
      if (!marked[i][i]) {
        allMarked = false;
        break;
      }
    }
    if (allMarked) {
      const lineType = 'diagonal-main';
      if (!this.state.completedLines[playerId].includes(lineType)) {
        completed.push(lineType);
      }
    }

    // Check diagonal top-right to bottom-left
    allMarked = true;
    for (let i = 0; i < 5; i++) {
      if (!marked[i][4 - i]) {
        allMarked = false;
        break;
      }
    }
    if (allMarked) {
      const lineType = 'diagonal-anti';
      if (!this.state.completedLines[playerId].includes(lineType)) {
        completed.push(lineType);
      }
    }

    return completed;
  }

  protected handlePlayerActionImpl(playerId: string, action: string, data: any): void {
    if (action !== 'mark' || this.state.state !== GameState.PLAYING) {
      return;
    }

    const { row, col } = data;
    if (typeof row !== 'number' || typeof col !== 'number' || row < 0 || row >= 5 || col < 0 || col >= 5) {
      return;
    }

    // Check if this position is already marked
    if (this.state.markedCells[playerId][row][col]) {
      return;
    }

    // Check if the item at this position has been called
    const playerCard = this.state.playerCards[playerId];
    if (!playerCard) {
      return;
    }

    const cellItem = playerCard.grid[row][col];
    
    // Center cell (free space) can always be marked
    if (cellItem === null && row === 2 && col === 2) {
      // Already marked in generateCards, but handle it anyway
      return;
    }

    if (cellItem === null) {
      return; // Invalid cell
    }

    // Check if this item has been called
    const isCalled = this.state.calledItems.some((item) => item.id === cellItem.id);
    if (!isCalled) {
      return; // Item not called yet, cannot mark
    }

    // Mark the cell
    this.state.markedCells[playerId][row][col] = true;

    // Check for completed lines
    const newCompletedLines = this.checkForCompletedLines(playerId);
    
    if (newCompletedLines.length > 0) {
      // Player completed one or more lines
      const isFirstWinner = this.state.winners.length === 0;
      
      newCompletedLines.forEach((lineType) => {
        if (!this.state.completedLines[playerId].includes(lineType)) {
          this.state.completedLines[playerId].push(lineType);

          // Award points
          let points = this.settings.pointsPerLine;

          // Speed bonus if this is the first winner
          if (isFirstWinner && this.state.itemsCalled > 0) {
            // Calculate speed bonus based on how quickly line was completed
            const timeElapsed = Date.now() - this.state.roundStartTime;
            const maxTime = this.state.callInterval * 25; // Assume max 25 calls
            const speedBonus = calculateSpeedBonus(
              timeElapsed,
              maxTime,
              this.settings.speedBonusMultiplier
            );
            points += speedBonus;
          }

          this.updateScore(playerId, points);
        }
      });

      // Add to winners if first time completing a line this round
      if (!this.state.winners.includes(playerId)) {
        this.state.winners.push(playerId);
        
        // End round when first player completes a line
        if (isFirstWinner) {
          this.clearCallTimer();
          this.setTimer(() => {
            this.endRound();
          }, 2000); // 2 second delay to show winner
        }
      }
    }
  }

  private endRound(): void {
    this.clearCallTimer();
    this.state.state = GameState.ROUND_END;

    // Move to next round or end game
    this.setTimer(() => {
      if (this.state.round >= this.state.maxRounds) {
        this.end();
      } else {
        this.nextRound();
      }
    }, 5000); // 5 second delay before next round
  }

  protected onMigratePlayer(oldPlayerId: string, newPlayerId: string): void {
    // Migrate card
    if (this.state.playerCards[oldPlayerId]) {
      this.state.playerCards[newPlayerId] = this.state.playerCards[oldPlayerId];
      delete this.state.playerCards[oldPlayerId];
    }

    // Migrate marked cells
    if (this.state.markedCells[oldPlayerId]) {
      this.state.markedCells[newPlayerId] = this.state.markedCells[oldPlayerId];
      delete this.state.markedCells[oldPlayerId];
    }

    // Migrate completed lines
    if (this.state.completedLines[oldPlayerId]) {
      this.state.completedLines[newPlayerId] = this.state.completedLines[oldPlayerId];
      delete this.state.completedLines[oldPlayerId];
    }

    // Update winners array
    const winnerIndex = this.state.winners.indexOf(oldPlayerId);
    if (winnerIndex !== -1) {
      this.state.winners[winnerIndex] = newPlayerId;
    }

    console.log(
      `[Bingo] Migrated player from ${oldPlayerId.substring(0, 8)} to ${newPlayerId.substring(0, 8)}`
    );
  }

  getClientState(playerId: string): any {
    return {
      ...this.state,
      playerCard: this.state.playerCards[playerId] || null,
      markedCells: this.state.markedCells[playerId] || null,
      completedLines: this.state.completedLines[playerId] || [],
      hasWon: this.state.winners.includes(playerId),
      scoreboard: this.getScoreboard(),
    };
  }

  // PluginGameEngine interface implementation
  init(roomState: Room): void {
    console.log(`[BingoGame] Initialized for room ${roomState.code}`);
  }

  getRenderDescriptor(): RenderDescriptor {
    return {
      layout: 'grid',
      components: [
        {
          type: 'bingo-card',
          position: { x: 0, y: 0, width: 100, height: 80 },
          props: {},
        },
        {
          type: 'called-items',
          position: { x: 0, y: 80, width: 100, height: 20 },
          props: {},
        },
      ],
      config: {
        gridColumns: 1,
        gridRows: 2,
      },
    };
  }
}

