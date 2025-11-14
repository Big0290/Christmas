<script lang="ts">
  import { goto } from '$app/navigation';
  import { socket, connectSocket, players } from '$lib/socket';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let playerName = '';
  let roomCode = '';
  let loading = false;
  let error = '';

  onMount(() => {
    connectSocket();
    
    // Load saved player name from localStorage
    if (browser) {
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = savedName;
      }
    }
  });

  async function createRoom() {
    if (!playerName.trim()) {
      error = 'Please enter your name';
      return;
    }

    loading = true;
    error = '';

    $socket.emit('create_room', playerName, (response: any) => {
      loading = false;
      
      if (response.success) {
        // Store player name and room code for persistence
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          sessionStorage.setItem('christmas_roomCode', response.roomCode);
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
        }
        
        // Store host status and initial players list
        if (response.isHost) {
          sessionStorage.setItem(`host_${response.roomCode}`, 'true');
        }
        if (response.player) {
          // Add the host to the players list
          players.set([response.player]);
        }
        goto(`/room/${response.roomCode}`);
      } else {
        error = response.error || 'Failed to create room';
      }
    });
  }

  async function joinRoom() {
    if (!playerName.trim()) {
      error = 'Please enter your name';
      return;
    }

    if (!roomCode.trim() || roomCode.length !== 4) {
      error = 'Please enter a valid 4-letter room code';
      return;
    }

    loading = true;
    error = '';

    $socket.emit('join_room', roomCode.toUpperCase(), playerName, (response: any) => {
      loading = false;
      
      if (response.success) {
        // Store player name and room code for persistence
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          sessionStorage.setItem('christmas_roomCode', roomCode.toUpperCase());
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
        }
        goto(`/play/${roomCode.toUpperCase()}`);
      } else {
        error = response.error || 'Failed to join room';
      }
    });
  }
</script>

<svelte:head>
  <title>Christmas Party Games 🎄</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="card max-w-md w-full space-y-8">
    <div class="text-center">
      <h1 class="text-5xl font-bold mb-2">🎄</h1>
      <h2 class="text-3xl font-bold text-christmas-gold mb-2">
        Christmas Party Games
      </h2>
      <p class="text-white/80">
        Multiplayer games for 30-50 players!
      </p>
    </div>

    <div class="space-y-4">
      <input
        type="text"
        placeholder="Your Name"
        bind:value={playerName}
        class="input"
        maxlength="20"
        disabled={loading}
      />

      {#if error}
        <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm">
          {error}
        </div>
      {/if}

      <button
        on:click={createRoom}
        disabled={loading || !playerName.trim()}
        class="btn-primary w-full text-lg"
      >
        {loading ? 'Creating...' : '🎮 Create New Room'}
      </button>

      <div class="relative">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-white/30"></div>
        </div>
        <div class="relative flex justify-center text-sm">
          <span class="px-4 bg-white/10 text-white/60">OR</span>
        </div>
      </div>

      <div class="space-y-3">
        <input
          type="text"
          placeholder="Room Code (e.g., ABC7)"
          bind:value={roomCode}
          class="input text-center text-2xl tracking-widest"
          maxlength="4"
          disabled={loading}
          on:input={(e) => {
            roomCode = e.currentTarget.value.toUpperCase();
          }}
        />

        <button
          on:click={joinRoom}
          disabled={loading || !playerName.trim() || roomCode.length !== 4}
          class="btn-secondary w-full text-lg"
        >
          {loading ? 'Joining...' : '🚪 Join Room'}
        </button>
      </div>
    </div>

    <div class="text-center text-xs text-white/50 pt-4">
      <p>6 Games | 50 Players | Real-time Multiplayer</p>
    </div>
  </div>
</div>
