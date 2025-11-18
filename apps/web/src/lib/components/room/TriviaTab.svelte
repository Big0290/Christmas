<script lang="ts">
  import { GameType } from '@christmas/core';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';
  
  export let triviaTimePerQuestion: number;
  export let questionSets: Array<{ id: string; name: string; description?: string; questionCount: number }>;
  export let selectedQuestionSet: string | null;
  export let currentQuestions: Array<{ id: string; question: string; answers: string[]; correctIndex: number; difficulty: string; category?: string }>;
  export let loadingQuestions: boolean;
  export let addingQuestion: boolean;
  export let updatingQuestion: boolean;
  export let editingQuestion: { id: string; question: string; questionFr: string; answers: string[]; answersFr: string[]; correctIndex: number; difficulty: string; category?: string } | null;
  export let newQuestion: {
    question: string;
    questionFr: string;
    answers: string[];
    answersFr: string[];
    correctIndex: number;
    difficulty: 'easy' | 'medium' | 'hard';
    category: string;
  };
  
  export let onQuestionSetChange: (setId: string | null) => void;
  export let openCreateSetDialog: () => void;
  export let addQuestion: () => void;
  export let startEditingQuestion: (question: any) => void;
  export let updateQuestion: () => void;
  export let cancelEditing: () => void;
  export let deleteQuestion: (questionId: string) => void;
  export let deleteQuestionSet: (setId: string) => void;
  export let saveTimeSetting: (gameType: GameType, setting: string, value: number) => void;
</script>

<div class="tab-panel">
  <h3 class="text-xl font-bold mb-4">❓ {t('triviaTab.title')}</h3>
  <div class="space-y-4">
    <!-- Time Setting -->
    <div>
      <label class="block text-sm font-medium mb-2">{t('triviaTab.timePerQuestion')}</label>
      <input
        type="number"
        bind:value={triviaTimePerQuestion}
        min="5"
        max="60"
        class="input w-full"
        on:change={() => saveTimeSetting(GameType.TRIVIA_ROYALE, 'timePerQuestion', triviaTimePerQuestion)}
      />
      <p class="text-xs text-white/50 mt-1">{t('triviaTab.timeRange')}</p>
    </div>

    <!-- Question Set Selector -->
    <div>
      <label class="block text-sm font-medium mb-2">{t('triviaTab.questionSet')}</label>
      <div class="flex gap-2">
        <select
          bind:value={selectedQuestionSet}
          on:change={(e) => onQuestionSetChange(e.target.value || null)}
          class="input flex-1"
        >
          <option value={null}>{t('triviaTab.defaultQuestions')}</option>
          {#each questionSets as set}
            <option value={set.id}>
              {set.name} ({set.questionCount} {t('triviaTab.questions')})
            </option>
          {/each}
        </select>
        <button
          on:click={openCreateSetDialog}
          class="btn-secondary text-sm whitespace-nowrap"
        >
          + {t('triviaTab.newSet')}
        </button>
      </div>
    </div>

    {#if selectedQuestionSet}
      <!-- Questions List -->
      <div>
        <h4 class="font-bold mb-3 flex items-center gap-2">
          <span>❓ {t('triviaTab.questions')}</span>
          <span class="text-sm font-normal text-white/60">({currentQuestions.length})</span>
        </h4>
        {#if loadingQuestions}
          <p class="text-white/50 text-center py-4">{t('triviaTab.loadingQuestions')}</p>
        {:else if currentQuestions.length === 0}
          <p class="text-white/50 text-center py-4">{t('triviaTab.noQuestions')}</p>
        {:else}
          <div class="space-y-3 max-h-96 overflow-y-auto pr-2">
            {#each currentQuestions as question, index}
              {#if editingQuestion && editingQuestion.id === question.id}
                <!-- Edit Mode -->
                <div class="p-4 bg-white/10 rounded-lg border-2 border-christmas-gold/50 frosted-glass">
                  <div class="space-y-3">
                    <div>
                      <label class="block text-sm font-medium mb-1">🇬🇧 {t('triviaTab.question')} (English)</label>
                      <input
                        type="text"
                        bind:value={editingQuestion.question}
                        placeholder={t('triviaTab.questionPlaceholder')}
                        class="input w-full"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-medium mb-1">🇫🇷 {t('triviaTab.question')} (Français)</label>
                      <input
                        type="text"
                        bind:value={editingQuestion.questionFr}
                        placeholder="Entrez la question en français (optionnel)"
                        class="input w-full"
                      />
                    </div>
                    <div class="space-y-2">
                      {#each editingQuestion.answers as answer, i}
                        <div class="grid grid-cols-2 gap-2">
                          <div>
                            <label class="block text-sm font-medium mb-1">
                              🇬🇧 {t('triviaTab.answer', { letter: String.fromCharCode(65 + i) })} (English)
                              {#if i === editingQuestion.correctIndex}
                                <span class="text-green-400">✓ {t('triviaTab.correct')}</span>
                              {/if}
                            </label>
                            <div class="flex gap-1">
                              <input
                                type="text"
                                bind:value={editingQuestion.answers[i]}
                                placeholder={t('triviaTab.answerPlaceholder')}
                                class="input flex-1"
                              />
                              <button
                                on:click={() => editingQuestion.correctIndex = i}
                                class="btn-secondary text-xs px-2 {editingQuestion.correctIndex === i ? 'bg-green-500' : ''}"
                                title={t('triviaTab.markCorrect')}
                              >
                                ✓
                              </button>
                            </div>
                          </div>
                          <div>
                            <label class="block text-sm font-medium mb-1">
                              🇫🇷 {t('triviaTab.answer', { letter: String.fromCharCode(65 + i) })} (Français)
                            </label>
                            <input
                              type="text"
                              bind:value={editingQuestion.answersFr[i]}
                              placeholder="Réponse en français (optionnel)"
                              class="input w-full"
                            />
                          </div>
                        </div>
                      {/each}
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="block text-sm font-medium mb-1">{t('triviaTab.difficulty')}</label>
                        <select bind:value={editingQuestion.difficulty} class="input w-full">
                          <option value="easy">{t('triviaTab.difficultyEasy')}</option>
                          <option value="medium">{t('triviaTab.difficultyMedium')}</option>
                          <option value="hard">{t('triviaTab.difficultyHard')}</option>
                        </select>
                      </div>
                      <div>
                        <label class="block text-sm font-medium mb-1">{t('triviaTab.category')}</label>
                        <input
                          type="text"
                          bind:value={editingQuestion.category}
                          placeholder={t('triviaTab.categoryPlaceholder')}
                          class="input w-full"
                        />
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <button
                        on:click={updateQuestion}
                        disabled={updatingQuestion || !editingQuestion.question.trim()}
                        class="btn-primary flex-1"
                      >
                        {updatingQuestion ? `💾 ${t('triviaTab.saving')}` : `💾 ${t('triviaTab.saveChanges')}`}
                      </button>
                      <button
                        on:click={cancelEditing}
                        disabled={updatingQuestion}
                        class="btn-secondary"
                      >
                        {t('common.button.cancel')}
                      </button>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- Display Mode -->
                <div class="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-all frosted-glass">
                  <div class="flex justify-between items-start mb-3">
                    <div class="flex-1">
                      <div class="flex items-start gap-2 mb-2">
                        <span class="text-lg font-bold text-christmas-gold">{index + 1}.</span>
                        <p class="font-medium text-base flex-1">{question.question}</p>
                      </div>
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2 py-1 rounded text-xs font-semibold {
                          question.difficulty === 'easy' ? 'bg-green-500/30 text-green-300' :
                          question.difficulty === 'medium' ? 'bg-yellow-500/30 text-yellow-300' :
                          'bg-red-500/30 text-red-300'
                        }">
                          {question.difficulty.toUpperCase()}
                        </span>
                        {#if question.category}
                          <span class="px-2 py-1 rounded text-xs bg-white/10 text-white/70">
                            📁 {question.category}
                          </span>
                        {/if}
                      </div>
                    </div>
                    <div class="flex gap-2 ml-3">
                      <button
                        on:click={() => startEditingQuestion(question)}
                        class="text-blue-400 hover:text-blue-300 text-sm px-2 py-1 rounded hover:bg-blue-500/20 transition-colors"
                        title={t('triviaTab.editQuestion')}
                      >
                        ✏️
                      </button>
                      <button
                        on:click={() => deleteQuestion(question.id)}
                        class="text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded hover:bg-red-500/20 transition-colors"
                        title={t('triviaTab.deleteQuestion')}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2 mt-3">
                    {#each question.answers as answer, i}
                      <div class="p-2 rounded text-sm {
                        i === question.correctIndex 
                          ? 'bg-green-500/30 border-2 border-green-500/70 text-green-100' 
                          : 'bg-white/5 border border-white/10 text-white/80'
                      }">
                        <span class="font-bold text-christmas-gold mr-2">{String.fromCharCode(65 + i)}:</span>
                        <span>{answer}</span>
                        {#if i === question.correctIndex}
                          <span class="ml-2 text-green-300">✓</span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

      <!-- Add Question Form -->
      {#if !editingQuestion}
        <div class="p-4 bg-white/5 rounded-lg frosted-glass">
          <h4 class="font-bold mb-3 flex items-center gap-2">
            <span>➕</span>
            <span>{t('triviaTab.addNewQuestion')}</span>
          </h4>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">🇬🇧 {t('triviaTab.question')} (English) *</label>
            <input
              type="text"
              bind:value={newQuestion.question}
              placeholder={t('triviaTab.questionPlaceholder')}
              class="input w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">🇫🇷 {t('triviaTab.question')} (Français)</label>
            <input
              type="text"
              bind:value={newQuestion.questionFr}
              placeholder="Entrez la question en français (optionnel)"
              class="input w-full"
            />
          </div>
          <div class="space-y-2">
            {#each newQuestion.answers as answer, index}
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-sm font-medium mb-1">
                    🇬🇧 {t('triviaTab.answer', { letter: String.fromCharCode(65 + index) })} (English) *
                    {#if index === newQuestion.correctIndex}
                      <span class="text-green-400">✓ {t('triviaTab.correct')}</span>
                    {/if}
                  </label>
                  <div class="flex gap-1">
                    <input
                      type="text"
                      bind:value={newQuestion.answers[index]}
                      placeholder={t('triviaTab.answerPlaceholder')}
                      class="input flex-1"
                    />
                    <button
                      on:click={() => newQuestion.correctIndex = index}
                      class="btn-secondary text-xs px-2 {newQuestion.correctIndex === index ? 'bg-green-500' : ''}"
                      title={t('triviaTab.markCorrect')}
                    >
                      ✓
                    </button>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">
                    🇫🇷 {t('triviaTab.answer', { letter: String.fromCharCode(65 + index) })} (Français)
                  </label>
                  <input
                    type="text"
                    bind:value={newQuestion.answersFr[index]}
                    placeholder="Réponse en français (optionnel)"
                    class="input w-full"
                  />
                </div>
              </div>
            {/each}
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-sm font-medium mb-1">{t('triviaTab.difficulty')}</label>
              <select bind:value={newQuestion.difficulty} class="input w-full">
                <option value="easy">{t('triviaTab.difficultyEasy')}</option>
                <option value="medium">{t('triviaTab.difficultyMedium')}</option>
                <option value="hard">{t('triviaTab.difficultyHard')}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">{t('triviaTab.category')}</label>
              <input
                type="text"
                bind:value={newQuestion.category}
                placeholder={t('triviaTab.categoryPlaceholder')}
                class="input w-full"
              />
            </div>
          </div>
          <button
            on:click={addQuestion}
            disabled={addingQuestion || !newQuestion.question.trim()}
            class="btn-primary w-full"
          >
            {addingQuestion ? `✨ ${t('triviaTab.adding')}` : `✨ ${t('triviaTab.addQuestion')}`}
          </button>
        </div>
        </div>
      {/if}

      <!-- Delete Set Button -->
      <button
        on:click={() => {
          if (selectedQuestionSet) {
            deleteQuestionSet(selectedQuestionSet);
          }
        }}
        class="btn-secondary w-full text-red-400 hover:bg-red-500/20"
      >
        🗑️ {t('triviaTab.deleteSet')}
      </button>
    {/if}
  </div>
</div>

