<script lang="ts">
  import { language } from '$lib/i18n';
  import type { Language } from '$lib/i18n';

  function toggleLanguage() {
    language.update((current) => (current === 'en' ? 'fr' : 'en'));
  }
</script>

<button
  on:click={toggleLanguage}
  class="language-switcher"
  title={$language === 'en' ? 'Switch to French' : 'Passer à l\'anglais'}
  aria-label={$language === 'en' ? 'Switch to French' : 'Passer à l\'anglais'}
>
  <span class="language-code">{$language === 'en' ? 'EN' : 'FR'}</span>
</button>

<style>
  .language-switcher {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    padding: 0.375rem 0.75rem;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 3rem;
  }

  .language-switcher:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .language-switcher:active {
    transform: scale(0.95);
  }

  .language-code {
    user-select: none;
  }
</style>

