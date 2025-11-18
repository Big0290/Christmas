<script lang="ts">
  import { GameType } from '@christmas/core';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';
  
  export let naughtyTimePerRound: number;
  export let promptSets: Array<{ id: string; name: string; description?: string; promptCount: number }>;
  export let selectedPromptSet: string | null;
  export let currentPrompts: Array<{ id: string; prompt: string; category: string; contentRating: string }>;
  export let loadingPrompts: boolean;
  export let addingPrompt: boolean;
  export let newPrompt: {
    prompt: string;
    category: string;
    contentRating: 'pg' | 'pg13';
  };
  export let newPromptSetName: string;
  export let newPromptSetDescription: string;
  
  export let onPromptSetChange: (setId: string | null) => void;
  export let addPrompt: () => void;
  export let deletePrompt: (promptId: string) => void;
  export let deletePromptSet: (setId: string) => void;
  export let saveTimeSetting: (gameType: GameType, setting: string, value: number) => void;
  
  function openCreatePromptSetDialog() {
    newPromptSetName = '';
    newPromptSetDescription = '';
    if (browser) {
      const dialog = document.getElementById('create-prompt-set-dialog');
      if (dialog instanceof HTMLDialogElement) dialog.showModal();
    }
  }
</script>

<div class="tab-panel">
  <h3 class="text-xl font-bold mb-4">😇 {t('naughtyTab.title')}</h3>
  <div class="space-y-4">
    <!-- Time Setting -->
    <div>
      <label class="block text-sm font-medium mb-2">{t('naughtyTab.timePerRound')}</label>
      <input
        type="number"
        bind:value={naughtyTimePerRound}
        min="5"
        max="30"
        class="input w-full"
        on:change={() => saveTimeSetting(GameType.NAUGHTY_OR_NICE, 'timePerRound', naughtyTimePerRound)}
      />
      <p class="text-xs text-white/50 mt-1">{t('naughtyTab.timeRange')}</p>
    </div>

    <!-- Prompt Set Selector -->
    <div>
      <label class="block text-sm font-medium mb-2">{t('naughtyTab.promptSet')}</label>
      <div class="flex gap-2">
        <select
          bind:value={selectedPromptSet}
          on:change={(e) => onPromptSetChange(e.target.value || null)}
          class="input flex-1"
        >
          <option value={null}>{t('naughtyTab.defaultPrompts')}</option>
          {#each promptSets as set}
            <option value={set.id}>
              {set.name} ({set.promptCount} {t('naughtyTab.prompts')})
            </option>
          {/each}
        </select>
        <button
          on:click={openCreatePromptSetDialog}
          class="btn-secondary text-sm whitespace-nowrap"
        >
          + {t('naughtyTab.newSet')}
        </button>
      </div>
    </div>

    {#if selectedPromptSet}
      <!-- Prompts List -->
      <div>
        <h4 class="font-bold mb-2">{t('naughtyTab.prompts')} ({currentPrompts.length})</h4>
        {#if loadingPrompts}
          <p class="text-white/50 text-center py-4">{t('naughtyTab.loadingPrompts')}</p>
        {:else if currentPrompts.length === 0}
          <p class="text-white/50 text-center py-4">{t('naughtyTab.noPrompts')}</p>
        {:else}
          <div class="space-y-2 max-h-64 overflow-y-auto">
            {#each currentPrompts as prompt}
              <div class="p-3 bg-white/5 rounded-lg">
                <div class="flex justify-between items-start mb-2">
                  <div class="flex-1">
                    <p class="font-medium">{prompt.prompt}</p>
                    {#if prompt.category}
                      <span class="text-xs text-white/50">{prompt.category}</span>
                    {/if}
                    <span class="text-xs text-white/50 ml-2">{t('naughtyTab.rating')}: {prompt.contentRating}</span>
                  </div>
                  <button
                    on:click={() => deletePrompt(prompt.id)}
                    class="text-red-400 hover:text-red-300 text-sm ml-2"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Add Prompt Form -->
      <div class="p-4 bg-white/5 rounded-lg">
        <h4 class="font-bold mb-3">{t('naughtyTab.addNewPrompt')}</h4>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">{t('naughtyTab.prompt')}</label>
            <input
              type="text"
              bind:value={newPrompt.prompt}
              placeholder={t('naughtyTab.promptPlaceholder')}
              class="input w-full"
            />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-sm font-medium mb-1">{t('naughtyTab.category')}</label>
              <input
                type="text"
                bind:value={newPrompt.category}
                placeholder={t('naughtyTab.categoryPlaceholder')}
                class="input w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">{t('naughtyTab.contentRating')}</label>
              <select bind:value={newPrompt.contentRating} class="input w-full">
                <option value="pg">{t('naughtyTab.contentRatingPG')}</option>
                <option value="pg13">{t('naughtyTab.contentRatingPG13')}</option>
              </select>
            </div>
          </div>
          <button
            on:click={addPrompt}
            disabled={addingPrompt || !newPrompt.prompt.trim()}
            class="btn-primary w-full"
          >
            {addingPrompt ? t('naughtyTab.adding') : `+ ${t('naughtyTab.addPrompt')}`}
          </button>
        </div>
      </div>
    {/if}

    <!-- Delete Set Button -->
    {#if selectedPromptSet}
      <button
        on:click={() => {
          deletePromptSet(selectedPromptSet);
        }}
        class="btn-secondary w-full text-red-400 hover:bg-red-500/20"
      >
        🗑️ {t('naughtyTab.deleteSet')}
      </button>
    {/if}
  </div>
</div>

