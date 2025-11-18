<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { socket } from '$lib/socket';
  import { getAccessToken } from '$lib/supabase';
  import { t } from '$lib/i18n';

  export let room: {
    code: string;
    room_name: string | null;
  };

  const dispatch = createEventDispatcher();

  let loading = false;
  let error = '';

  async function confirmDelete() {
    if (!$socket) {
      error = t('common.errors.notConnected');
      return;
    }

    loading = true;
    error = '';

    try {
      const authToken = await getAccessToken();
      if (!authToken) {
        error = t('common.errors.authenticationRequired');
        loading = false;
        return;
      }

      $socket.emit('delete_room', room.code, (response: any) => {
        loading = false;
        if (response && response.success) {
          dispatch('deleted');
        } else {
          error = response?.error || t('common.errors.failedToDeleteRoom');
        }
      });
    } catch (err: any) {
      loading = false;
      error = err.message || t('common.errors.failedToDeleteRoom');
    }
  }
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click={() => dispatch('close')}>
  <div class="card max-w-md w-full" on:click|stopPropagation>
    <h2 class="text-2xl font-bold mb-4 text-red-400">🗑️ {t('roomManagement.deleteRoom')}</h2>

    {#if error}
      <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-sm">
        {error}
      </div>
    {/if}

    <p class="mb-6 text-white/80">
      {t('roomManagement.deleteConfirm', { code: room.code, name: room.room_name || room.code })}
    </p>

    <div class="flex gap-2">
      <button
        on:click={confirmDelete}
        disabled={loading}
        class="btn-primary flex-1 bg-red-500 hover:bg-red-600"
      >
        {loading ? t('common.status.loading') : `🗑️ ${t('common.button.delete')}`}
      </button>
      <button
        on:click={() => dispatch('close')}
        disabled={loading}
        class="btn-secondary"
      >
        {t('common.button.cancel')}
      </button>
    </div>
  </div>
</div>

