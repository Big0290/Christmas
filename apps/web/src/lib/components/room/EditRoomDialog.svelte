<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { socket } from '$lib/socket';
  import { getAccessToken } from '$lib/supabase';
  import { t } from '$lib/i18n';

  export let room: {
    code: string;
    room_name: string | null;
    description: string | null;
  };

  const dispatch = createEventDispatcher();

  let roomName = room.room_name || '';
  let description = room.description || '';
  let loading = false;
  let error = '';

  async function save() {
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

      $socket.emit('update_room', room.code, {
        room_name: roomName.trim() || undefined,
        description: description.trim() || undefined,
      }, (response: any) => {
        loading = false;
        if (response && response.success) {
          dispatch('updated', {
            room_name: roomName.trim() || null,
            description: description.trim() || null,
          });
        } else {
          error = response?.error || t('common.errors.failedToUpdateRoom');
        }
      });
    } catch (err: any) {
      loading = false;
      error = err.message || t('common.errors.failedToUpdateRoom');
    }
  }
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" on:click={() => dispatch('close')}>
  <div class="card max-w-md w-full" on:click|stopPropagation>
    <h2 class="text-2xl font-bold mb-4">✏️ {t('roomManagement.editRoom')}</h2>

    {#if error}
      <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-sm">
        {error}
      </div>
    {/if}

    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2">{t('roomManagement.roomName')}</label>
        <input
          type="text"
          bind:value={roomName}
          placeholder={t('roomManagement.roomNamePlaceholder')}
          class="input"
          maxlength="100"
          disabled={loading}
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">{t('roomManagement.description')}</label>
        <textarea
          bind:value={description}
          placeholder={t('roomManagement.descriptionPlaceholder')}
          class="input"
          rows="3"
          maxlength="500"
          disabled={loading}
        ></textarea>
      </div>


      <div class="flex gap-2">
        <button
          on:click={save}
          disabled={loading}
          class="btn-primary flex-1"
        >
          {loading ? t('common.status.saving') : `💾 ${t('common.button.save')}`}
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
</div>

