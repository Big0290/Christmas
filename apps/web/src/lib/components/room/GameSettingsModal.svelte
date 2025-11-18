<script lang="ts">
  import { GameType } from '@christmas/core';
  import type { TriviaRoyaleSettings, EmojiCarolSettings, PriceIsRightSettings, NaughtyOrNiceSettings } from '@christmas/core';
  import { socket } from '$lib/socket';
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';

  export let gameType: GameType;
  export let open: boolean = false;
  export let onClose: () => void;
  export let onStart: (settings: any) => void;

  // Settings state for each game type
  let triviaSettings: TriviaRoyaleSettings = {
    questionCount: 10,
    timePerQuestion: 15,
    difficulty: 'mixed',
    imagesEnabled: true,
    scoringStrategy: 'both',
    speedBonusMultiplier: 1.5,
    customQuestionSetId: null,
  };

  let emojiSettings: EmojiCarolSettings = {
    roundCount: 8,
    allowDuplicates: false,
    uniquePickBonus: 5,
    customEmojiSetId: null,
    timePerRound: 15,
  };

  let priceSettings: PriceIsRightSettings = {
    roundCount: 10,
    scoringMode: 'closest_without_over',
    itemSelection: 'random',
    selectedCategories: [],
    timeLimit: 30,
    customItemSetId: null,
    showHints: false,
  };

  let naughtySettings: NaughtyOrNiceSettings = {
    promptCount: 10,
    contentFilter: 'pg',
    voteMode: 'majority',
    revealSpeed: 'medium',
    timePerRound: 15,
    customPromptSetId: null,
    anonymousVoting: true,
  };

  // Sets for dropdowns
  let questionSets: Array<{ id: string; name: string; description?: string; questionCount: number }> = [];
  let itemSets: Array<{ id: string; name: string; description?: string; itemCount: number }> = [];
  let promptSets: Array<{ id: string; name: string; description?: string; promptCount: number }> = [];
  let loadingSets = false;

  // Get current settings based on game type
  $: currentSettings = (() => {
    switch (gameType) {
      case GameType.TRIVIA_ROYALE:
        return triviaSettings;
      case GameType.EMOJI_CAROL:
        return emojiSettings;
      case GameType.PRICE_IS_RIGHT:
        return priceSettings;
      case GameType.NAUGHTY_OR_NICE:
        return naughtySettings;
      default:
        return null;
    }
  })();

  // Load sets when modal opens
  $: if (open && $socket) {
    loadSets();
  }

  async function loadSets() {
    if (!$socket || loadingSets) return;
    loadingSets = true;

    try {
      if (gameType === GameType.TRIVIA_ROYALE) {
        $socket.emit('list_question_sets', (response: any) => {
          if (response?.success) {
            questionSets = response.sets || [];
          }
          loadingSets = false;
        });
      } else if (gameType === GameType.PRICE_IS_RIGHT) {
        $socket.emit('list_item_sets', (response: any) => {
          if (response?.success) {
            itemSets = response.sets || [];
          }
          loadingSets = false;
        });
      } else if (gameType === GameType.NAUGHTY_OR_NICE) {
        $socket.emit('list_prompt_sets', (response: any) => {
          if (response?.success) {
            promptSets = response.sets || [];
          }
          loadingSets = false;
        });
      } else {
        loadingSets = false;
      }
    } catch (error) {
      console.error('[GameSettingsModal] Error loading sets:', error);
      loadingSets = false;
    }
  }

  function handleStart() {
    if (!currentSettings) return;
    onStart(currentSettings);
  }

  function handleCancel() {
    onClose();
  }

  // Prevent modal from closing when clicking inside
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  }
</script>

{#if open}
  <div class="modal-backdrop" on:click={handleBackdropClick} role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">
          {#if gameType === GameType.TRIVIA_ROYALE}
            🎄 {t('gameSettings.trivia.title')}
          {:else if gameType === GameType.EMOJI_CAROL}
            🎶 {t('gameSettings.emoji.title')}
          {:else if gameType === GameType.PRICE_IS_RIGHT}
            💰 {t('gameSettings.price.title')}
          {:else if gameType === GameType.NAUGHTY_OR_NICE}
            😇 {t('gameSettings.naughty.title')}
          {/if}
        </h2>
        <button class="close-button" on:click={handleCancel} aria-label={t('common.button.close')}>
          ✕
        </button>
      </div>

      <div class="modal-body">
        {#if gameType === GameType.TRIVIA_ROYALE}
          <!-- Trivia Royale Settings -->
          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.trivia.questionCount')}
              <input
                type="number"
                min="5"
                max="50"
                bind:value={triviaSettings.questionCount}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.trivia.timePerQuestion')} (seconds)
              <input
                type="number"
                min="5"
                max="60"
                bind:value={triviaSettings.timePerQuestion}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.trivia.difficulty')}
              <select bind:value={triviaSettings.difficulty} class="settings-select">
                <option value="easy">{t('gameSettings.trivia.difficultyEasy')}</option>
                <option value="medium">{t('gameSettings.trivia.difficultyMedium')}</option>
                <option value="hard">{t('gameSettings.trivia.difficultyHard')}</option>
                <option value="mixed">{t('gameSettings.trivia.difficultyMixed')}</option>
              </select>
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.trivia.scoringStrategy')}
              <select bind:value={triviaSettings.scoringStrategy} class="settings-select">
                <option value="speed">{t('gameSettings.trivia.scoringSpeed')}</option>
                <option value="accuracy">{t('gameSettings.trivia.scoringAccuracy')}</option>
                <option value="both">{t('gameSettings.trivia.scoringBoth')}</option>
              </select>
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.trivia.questionSet')}
              <select bind:value={triviaSettings.customQuestionSetId} class="settings-select">
                <option value={null}>{t('gameSettings.defaultSet')}</option>
                {#each questionSets as set}
                  <option value={set.id}>{set.name} ({set.questionCount} {t('gameSettings.questions')})</option>
                {/each}
              </select>
            </label>
          </div>

        {:else if gameType === GameType.EMOJI_CAROL}
          <!-- Emoji Carol Settings -->
          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.emoji.roundCount')}
              <input
                type="number"
                min="3"
                max="15"
                bind:value={emojiSettings.roundCount}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.emoji.timePerRound')} (seconds)
              <input
                type="number"
                min="10"
                max="30"
                bind:value={emojiSettings.timePerRound}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.emoji.uniquePickBonus')}
              <input
                type="number"
                min="0"
                max="10"
                bind:value={emojiSettings.uniquePickBonus}
                class="settings-input"
              />
            </label>
          </div>

        {:else if gameType === GameType.PRICE_IS_RIGHT}
          <!-- Price Is Right Settings -->
          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.price.roundCount')}
              <input
                type="number"
                min="3"
                max="20"
                bind:value={priceSettings.roundCount}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.price.timeLimit')} (seconds)
              <input
                type="number"
                min="10"
                max="60"
                bind:value={priceSettings.timeLimit}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.price.scoringMode')}
              <select bind:value={priceSettings.scoringMode} class="settings-select">
                <option value="closest_without_over">{t('gameSettings.price.scoringClosestWithoutOver')}</option>
                <option value="closest_overall">{t('gameSettings.price.scoringClosestOverall')}</option>
              </select>
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.price.itemSet')}
              <select bind:value={priceSettings.customItemSetId} class="settings-select">
                <option value={null}>{t('gameSettings.defaultSet')}</option>
                {#each itemSets as set}
                  <option value={set.id}>{set.name} ({set.itemCount} {t('gameSettings.items')})</option>
                {/each}
              </select>
            </label>
          </div>

        {:else if gameType === GameType.NAUGHTY_OR_NICE}
          <!-- Naughty or Nice Settings -->
          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.naughty.promptCount')}
              <input
                type="number"
                min="5"
                max="30"
                bind:value={naughtySettings.promptCount}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.naughty.timePerRound')} (seconds)
              <input
                type="number"
                min="5"
                max="60"
                bind:value={naughtySettings.timePerRound}
                class="settings-input"
              />
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.naughty.contentFilter')}
              <select bind:value={naughtySettings.contentFilter} class="settings-select">
                <option value="pg">{t('gameSettings.naughty.filterPG')}</option>
                <option value="pg13">{t('gameSettings.naughty.filterPG13')}</option>
                <option value="none">{t('gameSettings.naughty.filterNone')}</option>
              </select>
            </label>
          </div>

          <div class="settings-group">
            <label class="settings-label">
              {t('gameSettings.naughty.promptSet')}
              <select bind:value={naughtySettings.customPromptSetId} class="settings-select">
                <option value={null}>{t('gameSettings.defaultSet')}</option>
                {#each promptSets as set}
                  <option value={set.id}>{set.name} ({set.promptCount} {t('gameSettings.prompts')})</option>
                {/each}
              </select>
            </label>
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" on:click={handleCancel}>
          {t('common.button.cancel')}
        </button>
        <button class="btn-primary" on:click={handleStart}>
          🚀 {t('gameSettings.startGame')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 2rem;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    border-radius: 1.5rem;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 2px solid rgba(255, 215, 0, 0.3);
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2rem;
    border-bottom: 2px solid rgba(255, 215, 0, 0.2);
  }

  .modal-title {
    font-size: 2rem;
    font-weight: bold;
    color: #ffd700;
    margin: 0;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  }

  .close-button {
    background: transparent;
    border: none;
    color: white;
    font-size: 2rem;
    cursor: pointer;
    padding: 0.5rem;
    line-height: 1;
    transition: transform 0.2s;
  }

  .close-button:hover {
    transform: scale(1.2);
    color: #ffd700;
  }

  .modal-body {
    padding: 2rem;
    flex: 1;
    overflow-y: auto;
  }

  .settings-group {
    margin-bottom: 1.5rem;
  }

  .settings-label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 1.25rem;
    color: white;
    font-weight: 500;
  }

  .settings-input,
  .settings-select {
    padding: 0.75rem;
    font-size: 1.125rem;
    border-radius: 0.5rem;
    border: 2px solid rgba(255, 215, 0, 0.3);
    background: rgba(255, 255, 255, 0.1);
    color: white;
    transition: border-color 0.2s;
  }

  .settings-input:focus,
  .settings-select:focus {
    outline: none;
    border-color: #ffd700;
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.2);
  }

  .settings-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .settings-select option {
    background: #1a1a2e;
    color: white;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding: 2rem;
    border-top: 2px solid rgba(255, 215, 0, 0.2);
  }

  .btn-primary,
  .btn-secondary {
    padding: 1rem 2rem;
    font-size: 1.25rem;
    font-weight: bold;
    border-radius: 0.75rem;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
    box-shadow: 0 4px 15px rgba(196, 30, 58, 0.4);
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(196, 30, 58, 0.6);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.3);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.5);
  }

  @media (max-width: 768px) {
    .modal-content {
      max-width: 100%;
      margin: 1rem;
    }

    .modal-title {
      font-size: 1.5rem;
    }

    .settings-label {
      font-size: 1.125rem;
    }
  }
</style>

