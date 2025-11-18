<script lang="ts">
  import { roomTheme } from '$lib/theme';
  import { get } from 'svelte/store';
  import { t } from '$lib/i18n';
  
  export let backgroundMusic: boolean;
  export let snowEffect: boolean;
  export let loadingSettings: boolean;
  export let saveGeneralSettings: () => void;
  
  // Get theme from store
  $: theme = get(roomTheme);
  // Derive all values from store (store is source of truth)
  $: backgroundMusicFromStore = theme?.backgroundMusic ?? backgroundMusic ?? true;
  $: snowEffectFromStore = theme?.snowEffect ?? snowEffect ?? true;
  $: sparkles = theme?.sparkles ?? true;
  $: icicles = theme?.icicles ?? false;
  $: frostPattern = theme?.frostPattern ?? true;
  $: colorScheme = theme?.colorScheme ?? 'mixed';
  
  function updateBackgroundMusic(value: boolean) {
    if (theme) {
      theme.backgroundMusic = value;
      roomTheme.set(theme);
    }
  }
  
  function updateSnowEffect(value: boolean) {
    if (theme) {
      theme.snowEffect = value;
      roomTheme.set(theme);
    }
  }
  
  function updateSparkles(value: boolean) {
    if (theme) {
      theme.sparkles = value;
      roomTheme.set(theme);
    }
  }
  
  function updateIcicles(value: boolean) {
    if (theme) {
      theme.icicles = value;
      roomTheme.set(theme);
    }
  }
  
  function updateFrostPattern(value: boolean) {
    if (theme) {
      theme.frostPattern = value;
      roomTheme.set(theme);
    }
  }
  
  function updateColorScheme(value: string) {
    if (theme && (value === 'traditional' || value === 'winter' || value === 'mixed')) {
      theme.colorScheme = value as 'traditional' | 'winter' | 'mixed';
      roomTheme.set(theme);
    }
  }
</script>

<div class="tab-panel">
  <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
    <span class="text-2xl">⚙️</span>
    <span>{t('generalSettings.title')}</span>
  </h3>
  <div class="space-y-4">
    <!-- Background Music -->
    <div class="setting-item frosted-glass">
      <div class="setting-content">
        <label class="setting-label">🎵 {t('generalSettings.backgroundMusic')}</label>
        <p class="setting-description">{t('generalSettings.backgroundMusicDesc')}</p>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={backgroundMusicFromStore}
          on:change={(e) => updateBackgroundMusic(e.currentTarget.checked)}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
    
    <!-- Snow Effects -->
    <div class="setting-item frosted-glass">
      <div class="setting-content">
        <label class="setting-label">❄️ {t('generalSettings.snowEffects')}</label>
        <p class="setting-description">{t('generalSettings.snowEffectsDesc')}</p>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={snowEffectFromStore}
          on:change={(e) => updateSnowEffect(e.currentTarget.checked)}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
    
    <!-- Sparkles -->
    <div class="setting-item frosted-glass">
      <div class="setting-content">
        <label class="setting-label">✨ {t('generalSettings.sparkles')}</label>
        <p class="setting-description">{t('generalSettings.sparklesDesc')}</p>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={sparkles}
          on:change={(e) => updateSparkles(e.currentTarget.checked)}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
    
    <!-- Icicles -->
    <div class="setting-item frosted-glass">
      <div class="setting-content">
        <label class="setting-label">🧊 {t('generalSettings.icicles')}</label>
        <p class="setting-description">{t('generalSettings.iciclesDesc')}</p>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={icicles}
          on:change={(e) => updateIcicles(e.currentTarget.checked)}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
    
    <!-- Frost Pattern -->
    <div class="setting-item frosted-glass">
      <div class="setting-content">
        <label class="setting-label">❄️ {t('generalSettings.frostPattern')}</label>
        <p class="setting-description">{t('generalSettings.frostPatternDesc')}</p>
      </div>
      <label class="toggle-switch">
        <input
          type="checkbox"
          checked={frostPattern}
          on:change={(e) => updateFrostPattern(e.currentTarget.checked)}
        />
        <span class="toggle-slider"></span>
      </label>
    </div>
    
    <!-- Color Scheme -->
    <div class="setting-item frosted-glass">
      <div class="setting-content">
        <label class="setting-label">🎨 {t('generalSettings.colorScheme')}</label>
        <p class="setting-description">{t('generalSettings.colorSchemeDesc')}</p>
      </div>
      <select
        value={colorScheme}
        on:change={(e) => updateColorScheme(e.currentTarget.value)}
        class="color-scheme-select"
      >
        <option value="traditional">🎄 {t('generalSettings.colorSchemeTraditional')}</option>
        <option value="winter">❄️ {t('generalSettings.colorSchemeWinter')}</option>
        <option value="mixed">🎅 {t('generalSettings.colorSchemeMixed')}</option>
      </select>
    </div>
    
    <button
      on:click={saveGeneralSettings}
      disabled={loadingSettings}
      class="btn-primary w-full mt-6"
    >
      {loadingSettings ? `💾 ${t('generalSettings.saving')}` : `💾 ${t('generalSettings.saveSettings')}`}
    </button>
  </div>
</div>

<style>
  .tab-panel {
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
  
  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-radius: 0.75rem;
    transition: all 0.3s ease;
  }
  
  .setting-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }
  
  .setting-content {
    flex: 1;
  }
  
  .setting-label {
    display: block;
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: rgba(255, 255, 255, 0.95);
  }
  
  .setting-description {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
  }
  
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 3.5rem;
    height: 2rem;
    margin-left: 1rem;
  }
  
  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 255, 255, 0.2);
    transition: 0.3s;
    border-radius: 2rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
  }
  
  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 1.25rem;
    width: 1.25rem;
    left: 0.25rem;
    bottom: 0.25rem;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  input:checked + .toggle-slider {
    background: linear-gradient(135deg, var(--christmas-gold), #ffed4e);
    border-color: var(--christmas-gold);
  }
  
  input:checked + .toggle-slider:before {
    transform: translateX(1.5rem);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
  }
  
  .color-scheme-select {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 255, 255, 0.3);
    color: white;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.3s ease;
    min-width: 200px;
  }
  
  .color-scheme-select:hover {
    border-color: var(--christmas-gold);
    box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  }
  
  .color-scheme-select:focus {
    outline: none;
    border-color: var(--christmas-gold);
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
  }
  
  .color-scheme-select option {
    background: #1a1a2e;
    color: white;
  }
</style>

