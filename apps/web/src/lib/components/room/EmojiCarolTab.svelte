<script lang="ts">
  import { GameType } from '@christmas/core';
  import { t } from '$lib/i18n';
  
  export let emojiTimePerRound: number;
  export let saveTimeSetting: (gameType: GameType, setting: string, value: number) => void;
</script>

<div class="tab-panel">
  <h3 class="text-xl font-bold mb-4">🎶 {t('emojiTab.title')}</h3>
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium mb-2">{t('emojiTab.timePerRound')}</label>
      <input
        type="number"
        bind:value={emojiTimePerRound}
        min="10"
        max="30"
        class="input w-full"
        on:change={() => saveTimeSetting(GameType.EMOJI_CAROL, 'timePerRound', emojiTimePerRound)}
      />
      <p class="text-xs text-white/50 mt-1">{t('emojiTab.timeRange')}</p>
    </div>
  </div>
</div>

