<script lang="ts">
  import { t } from '$lib/i18n';
  
  export let roomName: string;
  export let roomDescription: string;
  export let loadingSettings: boolean;
  export let saveRoomSettings: () => void;
</script>

<div class="tab-panel">
  <h3 class="text-xl font-bold mb-4">🏠 {t('roomSettings.title')}</h3>
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium mb-2">{t('roomSettings.roomName')}</label>
      <input
        type="text"
        bind:value={roomName}
        placeholder={t('roomSettings.roomNamePlaceholder')}
        class="input"
        maxlength="100"
      />
    </div>
    <div>
      <label class="block text-sm font-medium mb-2">{t('roomSettings.description')}</label>
      <textarea
        bind:value={roomDescription}
        placeholder={t('roomSettings.descriptionPlaceholder')}
        class="input"
        rows="3"
        maxlength="500"
      ></textarea>
    </div>
    <button
      on:click={saveRoomSettings}
      disabled={loadingSettings}
      class="btn-primary w-full"
    >
      {loadingSettings ? t('roomSettings.saving') : `💾 ${t('roomSettings.saveSettings')}`}
    </button>
  </div>
</div>

