# Scoring Systems Documentation

This document outlines the scoring mechanics for all active games in the Christmas Party Games platform.

## Overview

The platform currently has 4 active games, each with different scoring mechanisms. This document provides details on how points are awarded in each game.

---

## 🎄 Trivia Royale

**File:** `apps/server/src/games/trivia-royale.ts`

### Scoring Mechanics

- **Base Points:** 100 points for a correct answer
- **Speed Bonus:** Up to 150 points (calculated as: `100 * ratio * 1.5`)
  - Ratio is based on how quickly the player answers: `Math.max(0, 1 - timeElapsed / maxTime)`
  - Faster answers = higher bonus
  - Maximum bonus when answering immediately
- **Total Possible per Question:** 250 points (100 base + 150 speed bonus)

### Scoring Formula
```
If answer is correct:
  points = 100 (base) + calculateSpeedBonus(answerTime, 15000, 1.5)
Else:
  points = 0
```

### Notes
- Speed bonus multiplier: 1.5
- Time per question: 15 seconds
- Incorrect answers award 0 points
- No penalty for wrong answers

---

## 🎶 Emoji Carol Battle

**File:** `apps/server/src/games/emoji-carol.ts`

### Scoring Mechanics

- **Majority Vote Bonus:** 10 points
  - Awarded if the player's emoji choice matches the majority emoji
- **Uniqueness Bonus:** 5 points
  - Awarded if the player is the only one who chose that emoji
- **Total Possible per Round:** 15 points (10 + 5)

### Scoring Formula
```
points = 0
If emoji === majorityEmoji:
  points += 10
If pickCount === 1:
  points += 5
```

### Notes
- Both bonuses can be earned simultaneously
- Round duration: 15 seconds
- Players can earn points even if not in the majority (via uniqueness bonus)

---

## 😇 Naughty or Nice

**File:** `apps/server/src/games/naughty-or-nice.ts`

### Scoring Mechanics

- **Majority Vote Bonus:** 10 points
  - Awarded if the player's vote matches the majority vote (naughty or nice)
- **Total Possible per Round:** 10 points

### Scoring Formula
```
points = 0
If vote === majority:
  points = 10
```

### Notes
- Only majority voters receive points
- Round duration: 15 seconds
- No bonus for uniqueness (unlike Emoji Carol)

---

## 💰 Price Is Right

**File:** `apps/server/src/games/price-is-right.ts`

### Scoring Mechanics

- **Closest Guess:** 100 points
  - Awarded to the player with the closest guess to the actual price
- **Total Possible per Round:** 100 points

### Scoring Modes

#### Mode 1: Closest Without Over
- Only guesses that are less than or equal to the actual price are considered
- Among valid guesses, the closest one wins
- Classic "Price Is Right" rules

#### Mode 2: Closest Overall
- All guesses are considered
- The guess with the smallest absolute difference from the actual price wins
- Can be over or under the actual price

### Scoring Formula
```
For closest_without_over:
  validGuesses = guesses.filter(guess <= actualPrice)
  winner = validGuesses.reduce((best, current) => 
    actualPrice - current < actualPrice - best ? current : best
  )
  points = 100

For closest_overall:
  winner = guesses.reduce((best, current) => 
    Math.abs(actualPrice - current) < Math.abs(actualPrice - best) ? current : best
  )
  points = 100
```

### Notes
- Only one player wins per round
- Round duration: 30 seconds
- Scoring mode is configurable per game

---

## Scoring Comparison

| Game | Base Points | Max Bonus | Total Max | Notes |
|------|------------|-----------|-----------|-------|
| Trivia Royale | 100 | 150 | 250 | Speed-based bonus |
| Emoji Carol | 10 | 5 | 15 | Majority + uniqueness |
| Naughty or Nice | 10 | 0 | 10 | Majority only |
| Price Is Right | 100 | 0 | 100 | Closest guess wins |

---

## Observations

1. **Trivia Royale** has the highest potential points per round (250), making it significantly more valuable for leaderboard rankings.

2. **Emoji Carol** and **Naughty or Nice** have similar base scoring (10 points), but Emoji Carol offers an additional uniqueness bonus.

3. **Price Is Right** offers a fixed 100 points per round, but only one player wins per round.

4. There is a significant scoring imbalance between games:
   - Trivia Royale: Up to 250 points per question
   - Emoji Carol: Up to 15 points per round
   - Naughty or Nice: Up to 10 points per round
   - Price Is Right: 100 points per round (but only one winner)

---

## Recommendations for Future Balancing

If scoring balance is desired across games, consider:

1. **Reduce Trivia Royale speed bonus multiplier** from 1.5 to a lower value (e.g., 0.5-1.0)
2. **Increase Emoji Carol and Naughty or Nice base points** to make them more competitive
3. **Standardize point ranges** across all games (e.g., 50-150 points per round)
4. **Add difficulty multipliers** to Trivia Royale based on question difficulty

---

*Last Updated: After removal of Gift Grabber and Workshop Tycoon games*

