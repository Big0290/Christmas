<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { socket } from '$lib/socket';
  import { getAccessToken } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';

  export let room: {
    code: string;
    room_name: string | null;
  };

  const dispatch = createEventDispatcher();

  let loading = false;
  let error = '';

  async function reactivate() {
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

      $socket.emit('reactivate_room', room.code, (response: any) => {
        loading = false;
        if (response && response.success && response.token) {
          // Save token to localStorage
          if (browser) {
            localStorage.setItem('christmas_hostToken', response.token);
            localStorage.setItem('christmas_roomCode', room.code);
          }
          dispatch('reactivated', response.token);
          // Navigate to room
          goto(`/room/${room.code}`);
        } else {
          error = response?.error || t('common.errors.failedToReactivateRoom');
        }
      });
    } catch (err: any) {
      loading = false;
      error = err.message || t('common.errors.failedToReactivateRoom');
    }
  }
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click={() => dispatch('close')}>
  <div class="card max-w-md w-full" on:click|stopPropagation>
    <h2 class="text-2xl font-bold mb-4 text-green-400">♻️ {t('roomManagement.reactivateRoom')}</h2>

    {#if error}
      <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-sm">
        {error}
      </div>
    {/if}

    <p class="mb-6 text-white/80">
      {t('roomManagement.reactivateConfirm', { code: room.code, name: room.room_name || room.code })}
    </p>

    <div class="flex gap-2">
      <button
        on:click={reactivate}
        disabled={loading}
        class="btn-primary flex-1 bg-green-500 hover:bg-green-600"
      >
        {loading ? t('common.status.loading') : `♻️ ${t('roomManagement.reactivate')}`}
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

