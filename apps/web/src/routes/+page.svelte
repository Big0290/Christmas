<script lang="ts">
  import { goto } from '$app/navigation';
  import { socket, connectSocket, players, connected } from '$lib/socket';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let playerName = '';
  let roomCode = '';
  let loading = false;
  let error = '';
  let roomHistory: Array<{ code: string; name?: string; lastAccessed: number; isHost: boolean }> = [];
  let publicRooms: Array<{ code: string; name?: string; description?: string; playerCount: number }> = [];
  let loadingPublicRooms = false;
  let activeTab: 'join' | 'history' | 'public' = 'join';

  function loadRoomHistory() {
    if (browser) {
      const historyJson = localStorage.getItem('christmas_roomHistory');
      if (historyJson) {
        try {
          roomHistory = JSON.parse(historyJson);
          // Sort by last accessed, most recent first
          roomHistory.sort((a, b) => b.lastAccessed - a.lastAccessed);
        } catch (e) {
          roomHistory = [];
        }
      }
    }
  }

  function saveRoomToHistory(roomCode: string, isHost: boolean, roomName?: string) {
    if (browser) {
      loadRoomHistory();
      
      // Remove existing entry for this room code if it exists
      roomHistory = roomHistory.filter(r => r.code !== roomCode);
      
      // Add new entry at the beginning
      roomHistory.unshift({
        code: roomCode,
        name: roomName,
        lastAccessed: Date.now(),
        isHost
      });
      
      // Keep only last 10 rooms
      roomHistory = roomHistory.slice(0, 10);
      
      localStorage.setItem('christmas_roomHistory', JSON.stringify(roomHistory));
    }
  }

  function loadPublicRooms() {
    if (!$socket || !$connected) return;
    
    loadingPublicRooms = true;
    $socket.emit('list_public_rooms', (response: any) => {
      loadingPublicRooms = false;
      if (response && response.success) {
        publicRooms = response.rooms || [];
      }
    });
  }

  onMount(() => {
    connectSocket();
    
    // Load saved player name from localStorage
    if (browser) {
      const savedName = localStorage.getItem('christmas_playerName');
      if (savedName) {
        playerName = savedName;
      }
      loadRoomHistory();
    }

    // Show connection error if socket fails to connect
    const unsubscribe = connected.subscribe((isConnected) => {
      if (!isConnected && $socket && browser) {
        // Give it a moment to connect
        setTimeout(() => {
          if (!$connected) {
            error = 'Unable to connect to server. Please check your connection.';
          }
        }, 3000);
      } else if (isConnected) {
        error = ''; // Clear error when connected
        // Load public rooms when connected
        if (activeTab === 'public') {
          loadPublicRooms();
        }
      }
    });

    return () => unsubscribe();
  });

  $: {
    if ($connected && activeTab === 'public') {
      loadPublicRooms();
    }
  }

  async function createRoom() {
    if (!playerName.trim()) {
      error = 'Please enter your name';
      return;
    }

    // Check if socket is connected
    if (!$socket || !$connected) {
      error = 'Not connected to server. Please wait and try again.';
      // Try to reconnect
      connectSocket();
      return;
    }

    loading = true;
    error = '';

    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      loading = false;
      error = 'Request timed out. Please check your connection and try again.';
    }, 10000); // 10 second timeout

    $socket.emit('create_room', playerName, (response: any) => {
      clearTimeout(timeout);
      loading = false;
      
      if (response && response.success) {
        // Store player name and room code for persistence
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          sessionStorage.setItem('christmas_roomCode', response.roomCode);
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
          
          // Save to room history
          saveRoomToHistory(response.roomCode, true, response.roomName);
        }
        
        // Store host status - host is not in players list
        if (response.isHost) {
          sessionStorage.setItem(`host_${response.roomCode}`, 'true');
        }
        // Host doesn't join as a player - players list stays empty
        goto(`/room/${response.roomCode}`);
      } else {
        error = response?.error || 'Failed to create room';
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

    // Check if socket is connected
    if (!$socket || !$connected) {
      error = 'Not connected to server. Please wait and try again.';
      // Try to reconnect
      connectSocket();
      return;
    }

    loading = true;
    error = '';

    // Set a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      loading = false;
      error = 'Request timed out. Please check your connection and try again.';
    }, 10000); // 10 second timeout

    $socket.emit('join_room', roomCode.toUpperCase(), playerName, (response: any) => {
      clearTimeout(timeout);
      loading = false;
      
      if (response && response.success) {
        // Store player name and room code for persistence
        if (browser) {
          localStorage.setItem('christmas_playerName', playerName);
          sessionStorage.setItem('christmas_roomCode', roomCode.toUpperCase());
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
          
          // Save to room history
          saveRoomToHistory(roomCode.toUpperCase(), false, response.roomName);
        }
        goto(`/play/${roomCode.toUpperCase()}`);
      } else {
        error = response?.error || 'Failed to join room';
      }
    });
  }

  function quickRejoin(roomCode: string, isHost: boolean) {
    if (!playerName.trim()) {
      error = 'Please enter your name first';
      activeTab = 'join';
      return;
    }

    if (!$socket || !$connected) {
      error = 'Not connected to server. Please wait and try again.';
      connectSocket();
      return;
    }

    loading = true;
    error = '';

    const timeout = setTimeout(() => {
      loading = false;
      error = 'Request timed out. Please check your connection and try again.';
    }, 10000);

    $socket.emit('join_room', roomCode, playerName, (response: any) => {
      clearTimeout(timeout);
      loading = false;
      
      if (response && response.success) {
        if (browser) {
          sessionStorage.setItem('christmas_roomCode', roomCode);
          sessionStorage.setItem('christmas_playerId', $socket?.id || '');
          
          if (isHost) {
            sessionStorage.setItem(`host_${roomCode}`, 'true');
          }
          
          // Update room history
          saveRoomToHistory(roomCode, isHost);
        }
        
        if (isHost) {
          goto(`/room/${roomCode}`);
        } else {
          goto(`/play/${roomCode}`);
        }
      } else {
        error = response?.error || 'Failed to rejoin room';
      }
    });
  }

  function formatLastAccessed(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
</script>

<svelte:head>
  <title>Christmas Party Games 🎄</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4">
  <div class="card max-w-2xl w-full space-y-8">
    <div class="text-center">
      <h1 class="text-5xl font-bold mb-2">🎄</h1>
      <h2 class="text-3xl font-bold text-christmas-gold mb-2">
        Christmas Party Games
      </h2>
      <p class="text-white/80">
        Multiplayer games for 30-50 players!
      </p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 border-b border-white/20">
      <button
        on:click={() => activeTab = 'join'}
        class="px-4 py-2 font-medium transition-colors {activeTab === 'join' ? 'text-christmas-gold border-b-2 border-christmas-gold' : 'text-white/60'}"
      >
        Join
      </button>
      <button
        on:click={() => activeTab = 'history'}
        class="px-4 py-2 font-medium transition-colors {activeTab === 'history' ? 'text-christmas-gold border-b-2 border-christmas-gold' : 'text-white/60'}"
      >
        History ({roomHistory.length})
      </button>
      <button
        on:click={() => { activeTab = 'public'; if ($connected) loadPublicRooms(); }}
        class="px-4 py-2 font-medium transition-colors {activeTab === 'public' ? 'text-christmas-gold border-b-2 border-christmas-gold' : 'text-white/60'}"
      >
        Public Rooms
      </button>
    </div>

    <!-- Join Tab -->
    {#if activeTab === 'join'}
    <div class="space-y-4">
      {#if !$connected && $socket}
        <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm flex items-center gap-2">
          <span>🟡</span>
          <span>Connecting to server...</span>
        </div>
      {:else if $connected}
        <div class="bg-green-500/20 border border-green-500 rounded-lg p-2 text-xs flex items-center justify-center gap-2">
          <span>🟢</span>
          <span>Connected</span>
        </div>
      {/if}

      <input
        type="text"
        placeholder="Your Name"
        bind:value={playerName}
        class="input"
        maxlength="20"
        disabled={loading || !$connected}
      />

      {#if error}
        <div class="bg-red-500/20 border border-red-500 rounded-lg p-3 text-sm">
          {error}
        </div>
      {/if}

      <button
        on:click={createRoom}
        disabled={loading || !playerName.trim() || !$connected}
        class="btn-primary w-full text-lg"
      >
        {loading ? 'Creating...' : !$connected ? 'Connecting...' : '🎮 Create New Room'}
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
          disabled={loading || !playerName.trim() || roomCode.length !== 4 || !$connected}
          class="btn-secondary w-full text-lg"
        >
          {loading ? 'Joining...' : !$connected ? 'Connecting...' : '🚪 Join Room'}
        </button>
      </div>
    </div>
    {/if}

    <!-- History Tab -->
    {#if activeTab === 'history'}
    <div class="space-y-4">
      {#if roomHistory.length === 0}
        <div class="text-center py-8 text-white/60">
          <p class="text-lg mb-2">No room history</p>
          <p class="text-sm">Rooms you join will appear here for easy rejoin</p>
        </div>
      {:else}
        <div class="space-y-2 max-h-96 overflow-y-auto">
          {#each roomHistory as room}
            <button
              on:click={() => quickRejoin(room.code, room.isHost)}
              disabled={loading || !playerName.trim() || !$connected}
              class="w-full p-4 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-lg">{room.code}</span>
                    {#if room.isHost}
                      <span class="text-xs bg-christmas-gold text-black px-2 py-1 rounded">Host</span>
                    {/if}
                  </div>
                  {#if room.name}
                    <p class="text-sm text-white/70">{room.name}</p>
                  {/if}
                  <p class="text-xs text-white/50 mt-1">{formatLastAccessed(room.lastAccessed)}</p>
                </div>
                <span class="text-2xl">→</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    {/if}

    <!-- Public Rooms Tab -->
    {#if activeTab === 'public'}
    <div class="space-y-4">
      {#if !$connected}
        <div class="bg-yellow-500/20 border border-yellow-500 rounded-lg p-3 text-sm text-center">
          Connect to server to see public rooms
        </div>
      {:else if loadingPublicRooms}
        <div class="text-center py-8 text-white/60">
          <div class="text-4xl mb-2 animate-spin">⏳</div>
          <p>Loading public rooms...</p>
        </div>
      {:else if publicRooms.length === 0}
        <div class="text-center py-8 text-white/60">
          <p class="text-lg mb-2">No public rooms available</p>
          <p class="text-sm">Hosts can mark their rooms as public to make them discoverable</p>
        </div>
      {:else}
        <div class="space-y-2 max-h-96 overflow-y-auto">
          {#each publicRooms as room}
            <button
              on:click={() => { roomCode = room.code; activeTab = 'join'; }}
              class="w-full p-4 bg-white/5 hover:bg-white/10 rounded-lg text-left transition-all"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-lg">{room.code}</span>
                    <span class="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">Public</span>
                  </div>
                  {#if room.name}
                    <p class="font-medium text-white/90">{room.name}</p>
                  {/if}
                  {#if room.description}
                    <p class="text-sm text-white/70 mt-1">{room.description}</p>
                  {/if}
                  <p class="text-xs text-white/50 mt-1">{room.playerCount} player{room.playerCount !== 1 ? 's' : ''}</p>
                </div>
                <span class="text-2xl">→</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    {/if}

    <div class="text-center text-xs text-white/50 pt-4">
      <p>6 Games | 50 Players | Real-time Multiplayer</p>
    </div>
  </div>
</div>
