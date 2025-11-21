<script lang="ts">
  import { language } from '$lib/i18n';
  import { t } from '$lib/i18n';
  import { browser } from '$app/environment';

  export let show: boolean = false;
  export let onLanguageSelected: (lang: 'en' | 'fr') => void;

  let selectedLanguage: 'en' | 'fr' = $language;

  // Load saved language preference
  if (browser) {
    const savedLang = localStorage.getItem('christmas_language');
    if (savedLang === 'en' || savedLang === 'fr') {
      selectedLanguage = savedLang;
    }
  }

  // Make translations reactive by subscribing to language changes
  // Include $language in each reactive statement so Svelte knows to re-run when language changes
  $: titleText = $language && t('languageModal.title');
  $: subtitleText = $language && t('languageModal.subtitle');
  $: englishText = $language && t('languageModal.english');
  $: frenchText = $language && t('languageModal.french');
  $: continueText = $language && t('languageModal.continue');

  function selectLanguage(lang: 'en' | 'fr') {
    selectedLanguage = lang;
    language.set(lang);
    
    // Save to localStorage
    if (browser) {
      localStorage.setItem('christmas_language', lang);
    }
    
    // Call the callback
    onLanguageSelected(lang);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      // Don't allow closing without selecting
      return;
    }
  }
</script>

{#if show}
  <div
    class="language-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="language-modal-title"
    on:keydown={handleKeydown}
    tabindex="-1"
  >
    <div
      class="language-modal-content frosted-glass"
      on:click|stopPropagation
      role="dialog"
      tabindex="-1"
    >
      <div class="language-modal-header">
        <h2 id="language-modal-title" class="text-3xl font-bold text-christmas-gold mb-2">
          🌍 {titleText}
        </h2>
        <p class="text-white/70 text-sm">
          {subtitleText}
        </p>
      </div>

      <div class="language-options">
        <button
          on:click={() => selectLanguage('en')}
          class="language-option"
          class:selected={selectedLanguage === 'en'}
          type="button"
        >
          <div class="language-flag">🇬🇧</div>
          <div class="language-info">
            <div class="language-name">English</div>
            <div class="language-subtitle">{englishText}</div>
          </div>
          {#if selectedLanguage === 'en'}
            <div class="language-check">✓</div>
          {/if}
        </button>

        <button
          on:click={() => selectLanguage('fr')}
          class="language-option"
          class:selected={selectedLanguage === 'fr'}
          type="button"
        >
          <div class="language-flag">🇫🇷</div>
          <div class="language-info">
            <div class="language-name">Français</div>
            <div class="language-subtitle">{frenchText}</div>
          </div>
          {#if selectedLanguage === 'fr'}
            <div class="language-check">✓</div>
          {/if}
        </button>
      </div>

      <div class="language-modal-footer">
        <button
          on:click={() => selectLanguage(selectedLanguage)}
          class="btn-primary w-full text-lg py-3"
          type="button"
        >
          {continueText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .language-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .language-modal-content {
    max-width: 500px;
    width: 100%;
    padding: 2.5rem;
    border-radius: 1.5rem;
    border: 3px solid var(--christmas-gold);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 40px rgba(255, 215, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    background: linear-gradient(
      135deg,
      rgba(196, 30, 58, 0.2) 0%,
      rgba(15, 134, 68, 0.2) 50%,
      rgba(0, 52, 96, 0.2) 100%
    );
    animation: slideUp 0.4s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(30px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .language-modal-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .language-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .language-option {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.08);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 1rem;
    cursor: pointer;
    transition: all 0.3s ease;
    text-align: left;
    width: 100%;
  }

  .language-option:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 215, 0, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.2);
  }

  .language-option.selected {
    background: linear-gradient(
      135deg,
      rgba(255, 215, 0, 0.2) 0%,
      rgba(196, 30, 58, 0.2) 100%
    );
    border: 2px solid var(--christmas-gold);
    box-shadow: 
      0 4px 15px rgba(255, 215, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
  }

  .language-flag {
    font-size: 3rem;
    flex-shrink: 0;
  }

  .language-info {
    flex: 1;
  }

  .language-name {
    font-size: 1.5rem;
    font-weight: bold;
    color: white;
    margin-bottom: 0.25rem;
  }

  .language-subtitle {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .language-check {
    font-size: 1.5rem;
    color: var(--christmas-gold);
    font-weight: bold;
    flex-shrink: 0;
  }

  .language-modal-footer {
    margin-top: 1.5rem;
  }

  @media (max-width: 640px) {
    .language-modal-content {
      padding: 2rem;
    }

    .language-option {
      padding: 1.25rem;
    }

    .language-flag {
      font-size: 2.5rem;
    }

    .language-name {
      font-size: 1.25rem;
    }
  }
</style>

