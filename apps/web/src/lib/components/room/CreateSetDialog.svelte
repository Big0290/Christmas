<script lang="ts">
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';
  
  export let dialogId: string;
  export let title: string;
  export let setName: string;
  export let setDescription: string;
  export let creating: boolean;
  export let onCreate: () => void;
  
  function closeDialog() {
    if (browser) {
      const dialog = document.getElementById(dialogId);
      if (dialog instanceof HTMLDialogElement) {
        dialog.close();
      }
    }
  }
</script>

<dialog id={dialogId} class="create-set-dialog frosted-glass">
  <div class="dialog-content">
    <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
      <span class="text-2xl">✨</span>
      <span>{title}</span>
    </h3>
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2 text-white/90">{t('createSet.setName')}</label>
        <input
          type="text"
          bind:value={setName}
          placeholder={t('createSet.setNamePlaceholder')}
          class="input w-full"
          maxlength="255"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2 text-white/90">{t('createSet.description')}</label>
        <textarea
          bind:value={setDescription}
          placeholder={t('createSet.descriptionPlaceholder')}
          class="input w-full"
          rows="2"
        ></textarea>
      </div>
      <div class="flex gap-2">
        <button
          on:click={onCreate}
          disabled={creating || !setName.trim()}
          class="btn-primary flex-1"
        >
          {creating ? `✨ ${t('createSet.creating')}` : `✨ ${t('createSet.createSet')}`}
        </button>
        <button
          on:click={closeDialog}
          class="btn-secondary"
        >
          {t('common.button.cancel')}
        </button>
      </div>
    </div>
  </div>
</dialog>

