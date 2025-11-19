<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import QRCode from 'qrcode';
  import { t } from '$lib/i18n';

  export let url: string;
  export let title: string = '';

  let qrCodeDataUrl = '';
  let copied = false;

  onMount(async () => {
    if (browser && url) {
      try {
        qrCodeDataUrl = await QRCode.toDataURL(url, {
          width: 300,
          margin: 3,
          color: { dark: '#c41e3a', light: '#ffffff' },
        });
      } catch (error) {
        console.error('[QRCode] Error generating QR code:', error);
      }
    }
  });

  $: if (browser && url && !qrCodeDataUrl) {
    QRCode.toDataURL(url, {
      width: 300,
      margin: 3,
      color: { dark: '#c41e3a', light: '#ffffff' },
    }).then((dataUrl) => {
      qrCodeDataUrl = dataUrl;
    }).catch((error) => {
      console.error('[QRCode] Error generating QR code:', error);
    });
  }

  async function copyLink() {
    if (!browser || !url) return;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (error) {
      console.error('[QRCode] Error copying link:', error);
    }
  }
</script>

<div class="qrcode-container">
  {#if title}
    <h4 class="qrcode-title">{title}</h4>
  {/if}

  {#if qrCodeDataUrl}
    <div class="qrcode-image-wrapper">
      <img src={qrCodeDataUrl} alt="QR Code" class="qrcode-image" />
    </div>
  {:else}
    <div class="qrcode-loading">
      <div class="spinner"></div>
      <p>{t('guessing.qrcode.generating')}</p>
    </div>
  {/if}

  <div class="qrcode-url">
    <input type="text" value={url} readonly class="url-input" data-sveltekit-preload-data="off" />
    <button type="button" on:click={copyLink} class="copy-btn" class:copied={copied}>
      {#if copied}
        ✓ {t('common.button.copied')}
      {:else}
        📋 {t('common.button.copy')}
      {/if}
    </button>
  </div>
</div>

<style>
  .qrcode-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.75rem;
  }

  .qrcode-title {
    margin: 0;
    font-size: 1rem;
    color: #ffd700;
    font-weight: bold;
    text-align: center;
  }

  .qrcode-image-wrapper {
    background: white;
    padding: 1rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  }

  .qrcode-image {
    display: block;
    max-width: 250px;
    height: auto;
  }

  .qrcode-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(255, 215, 0, 0.3);
    border-top-color: #ffd700;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .qrcode-url {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    max-width: 400px;
  }

  .url-input {
    flex: 1;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
    font-family: 'Courier New', monospace;
  }

  .url-input:focus {
    outline: none;
    border-color: #ffd700;
  }

  .copy-btn {
    padding: 0.5rem 1rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .copy-btn:hover {
    background: rgba(255, 215, 0, 0.3);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
  }

  .copy-btn.copied {
    background: rgba(15, 134, 68, 0.3);
    border-color: #0f8644;
    color: #0f8644;
  }

  @media (max-width: 640px) {
    .qrcode-image {
      max-width: 200px;
    }

    .qrcode-url {
      flex-direction: column;
    }

    .copy-btn {
      width: 100%;
    }
  }
</style>

