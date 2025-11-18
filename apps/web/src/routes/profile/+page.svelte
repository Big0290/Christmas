<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { GameType } from '@christmas/core';
  import { t } from '$lib/i18n';

  let playerName = '';
  let profile: any = null;
  let stats: any[] = [];
  let achievements: any[] = [];
  let loading = true;
  let error = '';
  let editing = false;
  let editDisplayName = '';
  let editBio = '';
  let editPreferredAvatar = '';
  let editAvatarStyle: 'festive' | 'emoji' = 'festive';

  const festiveAvatars = [
    '🎅', '🤶', '🎄', '⛄', '🦌', '🎁', '🔔', '⭐', '🕯️', '🎿',
    '🧝', '🧙', '👼', '🎺', '🎻', '🎸', '🥁', '🎷', '🎉', '🎊'
  ];

  const emojiAvatars = [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
    '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗'
  ];

  onMount(() => {
    connectSocket();
    
    if (browser) {
      playerName = localStorage.getItem('christmas_playerName') || '';
      if (playerName) {
        loadProfile();
      } else {
        error = t('profile.errors.noPlayerName');
        loading = false;
      }
    }
  });

  function loadProfile() {
    if (!$socket || !$connected || !playerName) return;
    
    loading = true;
    error = '';

    // Load profile
    $socket.emit('get_player_profile', playerName, (response: any) => {
      if (response.success) {
        profile = response.profile;
        editDisplayName = profile.displayName || '';
        editBio = profile.bio || '';
        editPreferredAvatar = profile.preferredAvatar || '';
        editAvatarStyle = profile.avatarStyle || 'festive';
      } else {
        error = response.error || t('profile.errors.failedLoad');
      }
    });

    // Load stats
    $socket.emit('get_player_stats', playerName, (response: any) => {
      if (response.success) {
        stats = response.stats;
      }
    });

    // Load achievements
    $socket.emit('get_player_achievements', playerName, (response: any) => {
      if (response.success) {
        achievements = response.achievements;
      }
      loading = false;
    });
  }

  function startEditing() {
    editing = true;
    editDisplayName = profile?.displayName || '';
    editBio = profile?.bio || '';
    editPreferredAvatar = profile?.preferredAvatar || '';
    editAvatarStyle = profile?.avatarStyle || 'festive';
  }

  function cancelEditing() {
    editing = false;
  }

  function saveProfile() {
    if (!$socket || !$connected) return;

    $socket.emit('update_player_profile', {
      displayName: editDisplayName || undefined,
      bio: editBio || undefined,
      preferredAvatar: editPreferredAvatar || undefined,
      avatarStyle: editAvatarStyle,
    }, (response: any) => {
      if (response.success) {
        profile = { ...profile, ...response.profile };
        editing = false;
      } else {
        error = response.error || t('profile.errors.failedUpdate');
      }
    });
  }

  function getGameTypeName(gameType: string): string {
    const names: Record<string, string> = {
      [GameType.TRIVIA_ROYALE]: `🎄 ${t('room.games.triviaRoyale.name')}`,
      [GameType.EMOJI_CAROL]: `🎶 ${t('room.games.emojiCarol.name')}`,
      [GameType.NAUGHTY_OR_NICE]: `😇 ${t('room.games.naughtyOrNice.name')}`,
      [GameType.PRICE_IS_RIGHT]: `💰 ${t('room.games.priceIsRight.name')}`,
    };
    return names[gameType] || gameType;
  }
</script>

<svelte:head>
  <title>{t('profile.title')} | {t('home.title')}</title>
</svelte:head>

<div class="min-h-screen p-4 md:p-8">
  <div class="max-w-4xl mx-auto">
    {#if loading}
      <div class="card text-center py-12">
        <div class="text-6xl mb-4 animate-spin">⏳</div>
        <p class="text-white/70">{t('profile.loading')}</p>
      </div>
    {:else if error}
      <div class="card">
        <div class="bg-red-500/20 border border-red-500 rounded-lg p-4">
          <p class="text-red-400">{error}</p>
        </div>
      </div>
    {:else if profile}
      <!-- Profile Header -->
      <div class="card mb-6">
        <div class="flex items-center gap-6">
          <div class="text-8xl">{profile.preferredAvatar || '🎄'}</div>
          <div class="flex-1">
            <h1 class="text-4xl font-bold mb-2">
              {profile.displayName || profile.playerName}
            </h1>
            <p class="text-white/70 mb-4">@{profile.playerName}</p>
            {#if profile.bio}
              <p class="text-white/80">{profile.bio}</p>
            {:else if !editing}
              <p class="text-white/50 italic">{t('profile.noBio')}</p>
            {/if}
          </div>
          {#if !editing}
            <button on:click={startEditing} class="btn-secondary">
              ✏️ {t('profile.editProfile')}
            </button>
          {/if}
        </div>
      </div>

      <!-- Edit Profile Form -->
      {#if editing}
        <div class="card mb-6">
          <h2 class="text-2xl font-bold mb-4">{t('profile.editProfile')}</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">{t('profile.displayName')}</label>
              <input
                type="text"
                bind:value={editDisplayName}
                placeholder={t('profile.displayNamePlaceholder')}
                class="input"
                maxlength="100"
              />
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">{t('profile.bio')}</label>
              <textarea
                bind:value={editBio}
                placeholder={t('profile.bioPlaceholder')}
                class="input"
                rows="3"
                maxlength="500"
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">{t('profile.avatarStyle')}</label>
              <select bind:value={editAvatarStyle} class="input">
                <option value="festive">{t('home.avatarStyles.festive')}</option>
                <option value="emoji">{t('home.avatarStyles.emoji')}</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">{t('profile.chooseAvatar')}</label>
              <div class="grid grid-cols-10 gap-2 max-h-64 overflow-y-auto p-2 bg-white/5 rounded-lg">
                {#each (editAvatarStyle === 'festive' ? festiveAvatars : emojiAvatars) as avatar}
                  <button
                    on:click={() => editPreferredAvatar = avatar}
                    class="text-3xl p-2 rounded {editPreferredAvatar === avatar ? 'bg-christmas-gold ring-2 ring-christmas-red' : 'bg-white/5 hover:bg-white/10'}"
                  >
                    {avatar}
                  </button>
                {/each}
              </div>
            </div>

            <div class="flex gap-2">
              <button on:click={saveProfile} class="btn-primary">
                💾 {t('profile.saveChanges')}
              </button>
              <button on:click={cancelEditing} class="btn-secondary">
                {t('common.button.cancel')}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <div class="grid md:grid-cols-2 gap-6">
        <!-- Statistics -->
        <div class="card">
          <h2 class="text-2xl font-bold mb-4">📊 {t('profile.statistics')}</h2>
          <div class="space-y-4">
            <div class="bg-white/5 rounded-lg p-4">
              <div class="text-sm text-white/70">{t('profile.totalScore')}</div>
              <div class="text-3xl font-bold text-christmas-gold">{profile.totalScore.toLocaleString()}</div>
            </div>
            <div class="bg-white/5 rounded-lg p-4">
              <div class="text-sm text-white/70">{t('profile.gamesPlayed')}</div>
              <div class="text-3xl font-bold">{profile.gamesPlayed}</div>
            </div>
            <div class="bg-white/5 rounded-lg p-4">
              <div class="text-sm text-white/70">{t('profile.bestGameScore')}</div>
              <div class="text-3xl font-bold text-christmas-gold">{profile.bestGameScore.toLocaleString()}</div>
            </div>
            {#if profile.favoriteGameType}
              <div class="bg-white/5 rounded-lg p-4">
                <div class="text-sm text-white/70">{t('profile.favoriteGame')}</div>
                <div class="text-xl font-bold">{getGameTypeName(profile.favoriteGameType)}</div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Achievements -->
        <div class="card">
          <h2 class="text-2xl font-bold mb-4">🏆 {t('profile.achievements')}</h2>
          {#if achievements.length > 0}
            <div class="space-y-2 max-h-96 overflow-y-auto">
              {#each achievements as achievement}
                <div class="bg-white/5 rounded-lg p-3 flex items-center gap-3">
                  <span class="text-3xl">🏅</span>
                  <div class="flex-1">
                    <div class="font-bold">{achievement.achievementName}</div>
                    <div class="text-sm text-white/70">
                      {t('profile.unlocked')} {new Date(achievement.unlockedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-white/50 text-center py-8">{t('profile.noAchievements')}</p>
          {/if}
        </div>
      </div>

      <!-- Per-Game Statistics -->
      {#if stats.length > 0}
        <div class="card mt-6">
          <h2 class="text-2xl font-bold mb-4">🎮 {t('profile.gameStatistics')}</h2>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-white/20">
                  <th class="text-left p-3">{t('profile.game')}</th>
                  <th class="text-right p-3">{t('profile.games')}</th>
                  <th class="text-right p-3">{t('profile.wins')}</th>
                  <th class="text-right p-3">{t('profile.totalScore')}</th>
                  <th class="text-right p-3">{t('profile.bestScore')}</th>
                  <th class="text-right p-3">{t('profile.avgScore')}</th>
                </tr>
              </thead>
              <tbody>
                {#each stats as stat}
                  <tr class="border-b border-white/10">
                    <td class="p-3 font-medium">{getGameTypeName(stat.gameType)}</td>
                    <td class="p-3 text-right">{stat.gamesPlayed}</td>
                    <td class="p-3 text-right text-christmas-gold">{stat.wins}</td>
                    <td class="p-3 text-right">{stat.totalScore.toLocaleString()}</td>
                    <td class="p-3 text-right text-christmas-gold">{stat.bestScore.toLocaleString()}</td>
                    <td class="p-3 text-right">{stat.averageScore.toFixed(0)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  :global(body) {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  }
</style>

