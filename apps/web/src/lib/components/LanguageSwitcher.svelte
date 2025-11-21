<script lang="ts">
  import { language } from '$lib/i18n';
  import type { Language } from '$lib/i18n';

  function toggleLanguage() {
    const newLang = $language === 'en' ? 'fr' : 'en';
    language.set(newLang);
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
    background: rgba(0, 0, 0, 0.4);
    border: 2px solid #ffd700;
    border-radius: clamp(6px, 0.8vw, 8px);
    padding: clamp(0.4rem, 0.8vh, 0.5rem) clamp(0.6rem, 1vw, 0.75rem);
    color: white;
    font-size: clamp(0.7rem, 1vw, 0.8rem);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 10px rgba(255, 215, 0, 0.2);
    backdrop-filter: blur(5px);
  }

  .language-switcher:hover {
    background: rgba(0, 0, 0, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 215, 0, 0.3);
  }

  .language-switcher:active {
    transform: translateY(0);
  }

  .language-code {
    user-select: none;
    text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
  }
</style>

