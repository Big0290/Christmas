<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { socket, connectSocket, players } from '$lib/socket';
  import QRCode from 'qrcode';
  import { GameType } from '@christmas/core';
  import { playSound } from '$lib/audio';

  const roomCode = $page.params.code;
  let qrCodeDataUrl = '';
  let isHost = false;
  let selectedGame: GameType | null = null;
  let origin = '';

  const games = [
    { type: GameType.TRIVIA_ROYALE, name: '🎄 Christmas Trivia Royale', desc: 'Fast-paced quiz' },
    { type: GameType.GIFT_GRABBER, name: '🎁 Gift Grabber', desc: 'Collect presents' },
    { type: GameType.WORKSHOP_TYCOON, name: '🏭 Workshop Tycoon', desc: 'Build your empire' },
    { type: GameType.EMOJI_CAROL, name: '🎶 Emoji Carol Battle', desc: 'Strategic voting' },
    { type: GameType.NAUGHTY_OR_NICE, name: '😇 Naughty or Nice', desc: 'Social voting' },
    { type: GameType.PRICE_IS_RIGHT, name: '💰 Price Is Right', desc: 'Guess the price' },
  ];

  onMount(async () => {
    connectSocket();

    // Set origin for display
    if (browser) {
      origin = window.location.origin;
    }

    // Generate QR code for joining
    if (browser) {
      const joinUrl = `${window.location.origin}/join?code=${roomCode}`;
      qrCodeDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#c41e3a', light: '#ffffff' },
      });
    }

    // Check if we're the host by checking URL params or sessionStorage
    // If we created the room, we should have isHost info
    if (browser) {
      const storedIsHost = sessionStorage.getItem(`host_${roomCode}`);
      if (storedIsHost === 'true') {
        isHost = true;
      } else {
        // If not stored, assume we're the host (this page is for hosts)
        // In production, you'd verify this with the server
        isHost = true;
      }
    } else {
      // SSR fallback
      isHost = true;
    }

    // If players list is empty, we might need to rejoin to get it
    // But if we just created the room, we should already be in it
    // The players list should be populated via socket events

    // Listen for game start
    $socket.on('game_started', (gameType: GameType) => {
      playSound('gameStart');
      goto(`/host/${roomCode}`);
    });
  });

  onDestroy(() => {
    $socket.off('game_started');
  });

  function startGame() {
    if (selectedGame && isHost) {
      $socket.emit('start_game', selectedGame);
    }
  }

  function copyRoomCode() {
    if (browser && navigator.clipboard) {
      navigator.clipboard.writeText(roomCode);
      alert('Room code copied!');
    }
  }

  function openGameMaster() {
    if (browser) {
      window.open(`/gamemaster`, '_blank');
    }
  }
</script>

<svelte:head>
  <title>Room {roomCode} | Christmas Party Games</title>
</svelte:head>

<div class="min-h-screen p-4 md:p-8">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-6xl font-bold text-christmas-gold mb-4">
        Room {roomCode}
      </h1>
      <button on:click={copyRoomCode} class="btn-secondary">
        📋 Copy Code
      </button>
    </div>

    <div class="grid md:grid-cols-2 gap-8">
      <!-- Left Column: QR Code & Info -->
      <div class="space-y-6">
        <!-- QR Code Card -->
        <div class="card text-center">
          <h2 class="text-2xl font-bold mb-4">📱 Join with Phone</h2>
          {#if qrCodeDataUrl}
            <div class="bg-white p-4 rounded-lg inline-block mb-4">
              <img src={qrCodeDataUrl} alt="QR Code" class="w-64 h-64" />
            </div>
          {/if}
          <p class="text-white/70 text-sm">
            Scan QR code or visit:<br />
            {#if origin}
              <code class="text-christmas-gold">{origin}/join</code>
            {:else}
              <code class="text-christmas-gold">/join</code>
            {/if}
          </p>
        </div>

        <!-- Players Card -->
        <div class="card">
          <h2 class="text-2xl font-bold mb-4">
            👥 Players ({$players.length})
          </h2>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            {#each $players as player}
              <div class="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <span class="text-3xl">{player.avatar}</span>
                <span class="font-medium">{player.name}</span>
                {#if player.id === $socket?.id}
                  <span class="ml-auto text-xs bg-christmas-gold text-black px-2 py-1 rounded">
                    You
                  </span>
                {/if}
              </div>
            {:else}
              <p class="text-white/50 text-center py-8">
                Waiting for players to join...
              </p>
            {/each}
          </div>
        </div>
      </div>

      <!-- Right Column: Game Selection -->
      <div class="space-y-6">
        <div class="card">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold">🎮 Select Game</h2>
            {#if isHost}
              <button on:click={openGameMaster} class="text-sm btn-secondary">
                ⚙️ Settings
              </button>
            {/if}
          </div>

          <div class="space-y-3">
            {#each games as game}
              <button
                on:click={() => (selectedGame = game.type)}
                class="w-full p-4 rounded-lg text-left transition-all {selectedGame === game.type ? 'bg-christmas-red ring-2 ring-christmas-gold' : 'bg-white/10'}"
              >
                <div class="font-bold text-lg mb-1">{game.name}</div>
                <div class="text-sm text-white/70">{game.desc}</div>
              </button>
            {/each}
          </div>

          {#if isHost}
            <button
              on:click={startGame}
              disabled={!selectedGame || $players.length < 2}
              class="btn-primary w-full mt-6 text-xl py-4"
            >
              🚀 Start Game
            </button>
            {#if $players.length < 2}
              <p class="text-center text-sm text-white/50 mt-2">
                Need at least 2 players to start
              </p>
            {/if}
          {:else}
            <div class="mt-6 p-4 bg-white/5 rounded-lg text-center">
              <p class="text-white/70">
                Waiting for host to start the game...
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  }
</style>
