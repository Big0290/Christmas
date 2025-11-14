<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { socket, connectSocket } from '$lib/socket';

  let roomCode = '';
  let playerName = '';
  let loading = false;
  let error = '';

  onMount(() => {
    connectSocket();
    
    // Check if code was provided in URL
    const urlCode = $page.url.searchParams.get('code');
    if (urlCode) {
      roomCode = urlCode.toUpperCase();
    }
  });

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
        goto(`/play/${roomCode.toUpperCase()}`);
      } else {
        error = response.error || 'Failed to join room';
      }
    });
  }
</script>

<svelte:head>
  <title>Join Room | Christmas Party Games</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="card max-w-md w-full space-y-6">
    <div class="text-center">
      <h1 class="text-4xl font-bold mb-2">🎄 Join Game</h1>
      <p class="text-white/70">
        Enter your name and room code
      </p>
    </div>

    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-2">Your Name</label>
        <input
          type="text"
          placeholder="Enter your name"
          bind:value={playerName}
          class="input"
          maxlength="20"
          disabled={loading}
          on:keydown={(e) => e.key === 'Enter' && joinRoom()}
        />
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">Room Code</label>
        <input
          type="text"
          placeholder="ABCD"
          bind:value={roomCode}
          class="input text-center text-2xl tracking-widest"
          maxlength="4"
          disabled={loading}
          on:input={(e) => {
            roomCode = e.currentTarget.value.toUpperCase();
          }}
          on:keydown={(e) => e.key === 'Enter' && joinRoom()}
        />
      </div>

      {#if error}
        <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm">
          {error}
        </div>
      {/if}

      <button
        on:click={joinRoom}
        disabled={loading || !playerName.trim() || roomCode.length !== 4}
        class="btn-primary w-full text-xl py-4"
      >
        {loading ? 'Joining...' : '🎮 Join Game'}
      </button>
    </div>

    <div class="text-center text-sm text-white/50">
      <p>No code? Ask the host to share it!</p>
    </div>
  </div>
</div>

<style>
  :global(body) {
    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  }
</style>
