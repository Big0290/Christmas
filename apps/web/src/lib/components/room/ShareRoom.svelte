<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';

  export let roomCode: string;
  export let joinUrl: string = '';

  let copied = false;
  let shareSupported = false;

  onMount(() => {
    if (browser) {
      shareSupported = 'share' in navigator;
      if (!joinUrl) {
        joinUrl = `${window.location.origin}/join?code=${roomCode}`;
      }
    }
  });

  async function copyUrl() {
    if (!browser) return;
    
    try {
      await navigator.clipboard.writeText(joinUrl);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = joinUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        copied = true;
        setTimeout(() => {
          copied = false;
        }, 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  }

  async function shareUrl() {
    if (!browser || !shareSupported) return;

    try {
      await navigator.share({
        title: t('shareRoom.shareTitle', { code: roomCode }),
        text: t('shareRoom.shareText', { code: roomCode }),
        url: joinUrl,
      });
    } catch (err: any) {
      // User cancelled or error occurred
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
        // Fallback to copy
        copyUrl();
      }
    }
  }
</script>

<div class="share-room card frosted-glass">
  <h3 class="text-2xl md:text-3xl font-bold mb-4 text-center">🔗 {t('shareRoom.title')}</h3>
  
  <div class="space-y-4">
    <!-- Room Code Display -->
    <div class="text-center">
      <p class="text-lg md:text-xl text-white/70 mb-2">{t('shareRoom.roomCode')}</p>
      <div class="inline-flex items-center gap-3 bg-white/10 px-6 py-3 rounded-lg border-2 border-christmas-gold/50">
        <span class="text-3xl md:text-4xl font-mono font-bold text-christmas-gold">{roomCode}</span>
        <button
          on:click={copyUrl}
          class="text-2xl hover:scale-110 transition-transform"
          title={t('shareRoom.copyCode')}
        >
          📋
        </button>
      </div>
    </div>

    <!-- Join URL Display -->
    <div>
      <p class="text-lg md:text-xl text-white/70 mb-2">{t('shareRoom.joinUrl')}</p>
      <div class="flex gap-2">
        <input
          type="text"
          readonly
          value={joinUrl}
          class="input flex-1 text-sm md:text-base"
          id="join-url-input"
        />
        <button
          on:click={copyUrl}
          class="btn-secondary px-4 md:px-6 whitespace-nowrap min-w-[100px]"
        >
          {copied ? `✓ ${t('shareRoom.copied')}` : `📋 ${t('shareRoom.copy')}`}
        </button>
      </div>
    </div>

    <!-- Share Buttons -->
    <div class="flex flex-col sm:flex-row gap-3">
      {#if shareSupported}
        <button
          on:click={shareUrl}
          class="btn-primary flex-1 text-lg md:text-xl py-4 flex items-center justify-center gap-2"
        >
          📤 {t('shareRoom.shareVia')}
        </button>
      {/if}
      <button
        on:click={copyUrl}
        class="btn-secondary flex-1 text-lg md:text-xl py-4 flex items-center justify-center gap-2"
      >
        {copied ? `✓ ${t('shareRoom.copied')}` : `📋 ${t('shareRoom.copyUrl')}`}
      </button>
    </div>

    <!-- Visual feedback -->
    {#if copied}
      <div class="text-center text-green-400 text-lg font-semibold animate-pulse">
        ✓ {t('shareRoom.copiedToClipboard')}
      </div>
    {/if}
  </div>
</div>

<style>
  .share-room {
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>

