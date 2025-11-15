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
  let showRoomSettings = false;
  let roomName = '';
  let roomDescription = '';
  let isPublic = false;
  let loadingSettings = false;
  
  // Trivia Questions Management
  let showTriviaQuestions = false;
  let questionSets: Array<{ id: string; name: string; description?: string; questionCount: number }> = [];
  let selectedQuestionSet: string | null = null; // null means use default questions
  let currentQuestions: Array<{ id: string; question: string; answers: string[]; correctIndex: number; difficulty: string; category?: string }> = [];
  let loadingSets = false;
  let loadingQuestions = false;
  let creatingSet = false;
  let addingQuestion = false;
  let newSetName = '';
  let newSetDescription = '';
  let newQuestion = {
    question: '',
    answers: ['', '', '', ''],
    correctIndex: 0,
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    category: '',
  };

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

    // Listen for room settings updates
    $socket.on('room_settings_updated', (settings: any) => {
      if (settings.roomName !== undefined) roomName = settings.roomName || '';
      if (settings.description !== undefined) roomDescription = settings.description || '';
      if (settings.isPublic !== undefined) isPublic = settings.isPublic;
    });

    // Load room settings if host
    if (isHost && $socket) {
      loadRoomSettings();
      loadQuestionSets();
    }
  });

  function loadRoomSettings() {
    // Settings will be loaded from socket events or we can emit a get_room_settings event
    // For now, initialize with defaults
    roomName = '';
    roomDescription = '';
    isPublic = false;
  }

  function saveRoomSettings() {
    if (!$socket || !isHost) return;
    
    loadingSettings = true;
    $socket.emit('update_room_settings', {
      roomName: roomName.trim() || undefined,
      description: roomDescription.trim() || undefined,
      isPublic: isPublic,
    }, (response: any) => {
      loadingSettings = false;
      if (response.success) {
        showRoomSettings = false;
        // Settings will be updated via socket event
      } else {
        alert(response.error || 'Failed to update room settings');
      }
    });
  }

  onDestroy(() => {
    $socket.off('game_started');
    $socket.off('room_settings_updated');
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

  // Trivia Questions Management Functions
  function loadQuestionSets() {
    if (!$socket || !isHost) return;
    
    loadingSets = true;
    $socket.emit('list_question_sets', (response: any) => {
      loadingSets = false;
      if (response.success) {
        questionSets = response.sets;
        // Load the currently selected set for this room if available
        loadRoomQuestionSet();
      } else {
        console.error('Failed to load question sets:', response.error);
      }
    });
  }

  function loadRoomQuestionSet() {
    // Load the question set currently assigned to this room from game_settings
    if (!$socket || !isHost) return;
    
    $socket.emit('get_game_settings', roomCode, GameType.TRIVIA_ROYALE, (response: any) => {
      if (response.success && response.settings?.customQuestionSetId) {
        selectedQuestionSet = response.settings.customQuestionSetId;
        loadQuestionsForSet(selectedQuestionSet);
      } else {
        selectedQuestionSet = null;
        currentQuestions = [];
      }
    });
  }

  function createQuestionSet() {
    if (!$socket || !isHost || !newSetName.trim()) return;
    
    creatingSet = true;
    $socket.emit('create_question_set', newSetName.trim(), newSetDescription.trim() || undefined, (response: any) => {
      creatingSet = false;
      if (response.success) {
        questionSets.push(response.set);
        selectedQuestionSet = response.set.id;
        newSetName = '';
        newSetDescription = '';
        // Close dialog
        const dialog = document.getElementById('create-set-dialog') as HTMLDialogElement;
        dialog?.close();
        // Load questions and save selection
        loadQuestionsForSet(response.set.id);
        saveRoomQuestionSet(response.set.id);
        showMessage('Question set created!');
      } else {
        alert(response.error || 'Failed to create question set');
      }
    });
  }

  function loadQuestionsForSet(setId: string | null) {
    if (!$socket || !isHost || !setId) {
      currentQuestions = [];
      return;
    }
    
    loadingQuestions = true;
    $socket.emit('get_questions_for_set', setId, (response: any) => {
      loadingQuestions = false;
      if (response.success) {
        currentQuestions = response.questions;
      } else {
        console.error('Failed to load questions:', response.error);
        currentQuestions = [];
      }
    });
  }

  function onQuestionSetChange(setId: string | null) {
    selectedQuestionSet = setId;
    if (setId) {
      loadQuestionsForSet(setId);
      // Save selection to room settings
      saveRoomQuestionSet(setId);
    } else {
      currentQuestions = [];
      // Clear selection (use default questions)
      saveRoomQuestionSet(null);
    }
  }

  function saveRoomQuestionSet(setId: string | null) {
    if (!$socket || !isHost) return;
    
    $socket.emit('set_room_question_set', roomCode, setId, (response: any) => {
      if (!response.success) {
        console.error('Failed to save question set selection:', response.error);
      }
    });
  }

  function addQuestion() {
    if (!$socket || !isHost || !selectedQuestionSet) {
      alert('Please select a question set first');
      return;
    }

    if (!newQuestion.question.trim() || newQuestion.answers.filter(a => a.trim()).length < 2) {
      alert('Please fill in the question and at least 2 answers');
      return;
    }

    const question = {
      question: newQuestion.question.trim(),
      answers: newQuestion.answers.filter(a => a.trim()),
      correctIndex: newQuestion.correctIndex,
      difficulty: newQuestion.difficulty,
      category: newQuestion.category.trim() || undefined,
    };

    addingQuestion = true;
    $socket.emit('add_question_to_set', selectedQuestionSet, question, (response: any) => {
      addingQuestion = false;
      if (response.success) {
        currentQuestions.push(response.question);
        // Reset form
        newQuestion = {
          question: '',
          answers: ['', '', '', ''],
          correctIndex: 0,
          difficulty: 'medium',
          category: '',
        };
        showMessage('Question added!');
      } else {
        alert(response.error || 'Failed to add question');
      }
    });
  }

  function deleteQuestion(questionId: string) {
    if (!$socket || !isHost || !confirm('Delete this question?')) return;
    
    $socket.emit('delete_custom_question', questionId, (response: any) => {
      if (response.success) {
        currentQuestions = currentQuestions.filter(q => q.id !== questionId);
        showMessage('Question deleted');
        // Reload questions to update count
        if (selectedQuestionSet) {
          loadQuestionsForSet(selectedQuestionSet);
        }
      } else {
        alert(response.error || 'Failed to delete question');
      }
    });
  }

  function deleteQuestionSet(setId: string) {
    if (!$socket || !isHost || !confirm('Delete this question set and all its questions? This cannot be undone.')) return;
    
    $socket.emit('delete_question_set', setId, (response: any) => {
      if (response.success) {
        questionSets = questionSets.filter(s => s.id !== setId);
        if (selectedQuestionSet === setId) {
          selectedQuestionSet = null;
          currentQuestions = [];
          saveRoomQuestionSet(null);
        }
        showMessage('Question set deleted');
      } else {
        alert(response.error || 'Failed to delete question set');
      }
    });
  }

  function showMessage(message: string) {
    // Simple toast message - could be enhanced with a proper toast component
    const msgEl = document.createElement('div');
    msgEl.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg z-50';
    msgEl.textContent = message;
    document.body.appendChild(msgEl);
    setTimeout(() => {
      msgEl.remove();
    }, 3000);
  }

  // Watch for selectedGame changes to show/hide trivia panel
  $: if (selectedGame === GameType.TRIVIA_ROYALE && isHost) {
    // Auto-show trivia questions panel when Trivia Royale is selected
    if (!showTriviaQuestions) {
      showTriviaQuestions = true;
    }
  } else if (selectedGame !== GameType.TRIVIA_ROYALE) {
    showTriviaQuestions = false;
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
              <div class="flex gap-2">
                <button on:click={() => showRoomSettings = !showRoomSettings} class="text-sm btn-secondary">
                  {showRoomSettings ? '📋 Hide Settings' : '⚙️ Room Settings'}
                </button>
                <button on:click={openGameMaster} class="text-sm btn-secondary">
                  🎛️ Game Settings
                </button>
              </div>
            {/if}
          </div>

          {#if isHost && showRoomSettings}
            <div class="room-settings-panel">
              <h3 class="text-xl font-bold mb-4">🏠 Room Settings</h3>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium mb-2">Room Name (optional)</label>
                  <input
                    type="text"
                    bind:value={roomName}
                    placeholder="e.g., Christmas Party 2024"
                    class="input"
                    maxlength="100"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-2">Description (optional)</label>
                  <textarea
                    bind:value={roomDescription}
                    placeholder="Describe your room..."
                    class="input"
                    rows="3"
                    maxlength="500"
                  ></textarea>
                </div>

                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isPublic"
                    bind:checked={isPublic}
                    class="w-5 h-5"
                  />
                  <label for="isPublic" class="text-sm font-medium cursor-pointer">
                    Make this room public (appears in public rooms list)
                  </label>
                </div>

                <button
                  on:click={saveRoomSettings}
                  disabled={loadingSettings}
                  class="btn-primary w-full"
                >
                  {loadingSettings ? 'Saving...' : '💾 Save Settings'}
                </button>
              </div>
            </div>
          {/if}

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

          {#if isHost && selectedGame === GameType.TRIVIA_ROYALE}
            <!-- Trivia Questions Management Panel -->
            <div class="trivia-questions-panel mt-4">
              <button
                on:click={() => showTriviaQuestions = !showTriviaQuestions}
                class="w-full p-3 bg-christmas-gold/20 hover:bg-christmas-gold/30 rounded-lg text-left transition-all mb-4"
              >
                <div class="flex items-center justify-between">
                  <span class="font-bold">❓ Manage Trivia Questions</span>
                  <span class="text-sm">{showTriviaQuestions ? '▼' : '▶'}</span>
                </div>
              </button>

              {#if showTriviaQuestions}
                <div class="trivia-panel-content space-y-4">
                  <!-- Question Set Selector -->
                  <div>
                    <label class="block text-sm font-medium mb-2">Question Set</label>
                    <div class="flex gap-2">
                      <select
                        bind:value={selectedQuestionSet}
                        on:change={(e) => onQuestionSetChange(e.target.value || null)}
                        class="input flex-1"
                      >
                        <option value={null}>Default Questions</option>
                        {#each questionSets as set}
                          <option value={set.id}>
                            {set.name} ({set.questionCount} questions)
                          </option>
                        {/each}
                      </select>
                      <button
                        on:click={() => {
                          newSetName = '';
                          newSetDescription = '';
                          creatingSet = false;
                          const dialog = document.getElementById('create-set-dialog') as HTMLDialogElement;
                          dialog?.showModal();
                        }}
                        class="btn-secondary text-sm whitespace-nowrap"
                      >
                        + New Set
                      </button>
                    </div>
                  </div>

                  {#if selectedQuestionSet}
                    <!-- Questions List -->
                    <div>
                      <h4 class="font-bold mb-2">Questions ({currentQuestions.length})</h4>
                      {#if loadingQuestions}
                        <p class="text-white/50 text-center py-4">Loading questions...</p>
                      {:else if currentQuestions.length === 0}
                        <p class="text-white/50 text-center py-4">No questions yet. Add your first question below!</p>
                      {:else}
                        <div class="space-y-2 max-h-64 overflow-y-auto">
                          {#each currentQuestions as question, index}
                            <div class="p-3 bg-white/5 rounded-lg">
                              <div class="flex justify-between items-start mb-2">
                                <div class="flex-1">
                                  <p class="font-medium">{index + 1}. {question.question}</p>
                                  {#if question.category}
                                    <span class="text-xs text-white/50">{question.category}</span>
                                  {/if}
                                </div>
                                <button
                                  on:click={() => deleteQuestion(question.id)}
                                  class="text-red-400 hover:text-red-300 text-sm ml-2"
                                >
                                  🗑️
                                </button>
                              </div>
                              <div class="grid grid-cols-2 gap-2 mt-2">
                                {#each question.answers as answer, i}
                                  <div class="text-xs p-2 rounded {i === question.correctIndex ? 'bg-green-500/20 border border-green-500' : 'bg-white/5'}">
                                    {String.fromCharCode(65 + i)}: {answer}
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>

                    <!-- Add Question Form -->
                    <div class="p-4 bg-white/5 rounded-lg">
                      <h4 class="font-bold mb-3">Add New Question</h4>
                      <div class="space-y-3">
                        <div>
                          <label class="block text-sm font-medium mb-1">Question</label>
                          <input
                            type="text"
                            bind:value={newQuestion.question}
                            placeholder="Enter your question..."
                            class="input w-full"
                          />
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                          {#each newQuestion.answers as answer, index}
                            <div>
                              <label class="block text-sm font-medium mb-1">
                                Answer {String.fromCharCode(65 + index)}
                                {#if index === newQuestion.correctIndex}
                                  <span class="text-green-400">✓ Correct</span>
                                {/if}
                              </label>
                              <div class="flex gap-1">
                                <input
                                  type="text"
                                  bind:value={newQuestion.answers[index]}
                                  placeholder="Answer text"
                                  class="input flex-1"
                                />
                                <button
                                  on:click={() => newQuestion.correctIndex = index}
                                  class="btn-secondary text-xs px-2 {newQuestion.correctIndex === index ? 'bg-green-500' : ''}"
                                  title="Mark as correct"
                                >
                                  ✓
                                </button>
                              </div>
                            </div>
                          {/each}
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                          <div>
                            <label class="block text-sm font-medium mb-1">Difficulty</label>
                            <select bind:value={newQuestion.difficulty} class="input w-full">
                              <option value="easy">Easy</option>
                              <option value="medium">Medium</option>
                              <option value="hard">Hard</option>
                            </select>
                          </div>
                          <div>
                            <label class="block text-sm font-medium mb-1">Category (optional)</label>
                            <input
                              type="text"
                              bind:value={newQuestion.category}
                              placeholder="e.g., Christmas"
                              class="input w-full"
                            />
                          </div>
                        </div>
                        <button
                          on:click={addQuestion}
                          disabled={addingQuestion || !newQuestion.question.trim()}
                          class="btn-primary w-full"
                        >
                          {addingQuestion ? 'Adding...' : '+ Add Question'}
                        </button>
                      </div>
                    </div>

                    <!-- Delete Set Button -->
                    <button
                      on:click={() => deleteQuestionSet(selectedQuestionSet!)}
                      class="btn-secondary w-full text-red-400 hover:bg-red-500/20"
                    >
                      🗑️ Delete This Set
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

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

    <!-- Create Set Dialog -->
    <dialog id="create-set-dialog" class="create-set-dialog">
      <div class="dialog-content">
        <h3 class="text-xl font-bold mb-4">Create New Question Set</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">Set Name *</label>
            <input
              type="text"
              bind:value={newSetName}
              placeholder="e.g., Christmas Party 2024"
              class="input w-full"
              maxlength="255"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Description (optional)</label>
            <textarea
              bind:value={newSetDescription}
              placeholder="Describe this question set..."
              class="input w-full"
              rows="2"
            ></textarea>
          </div>
          <div class="flex gap-2">
            <button
              on:click={createQuestionSet}
              disabled={creatingSet || !newSetName.trim()}
              class="btn-primary flex-1"
            >
              {creatingSet ? 'Creating...' : 'Create Set'}
            </button>
            <button
              on:click={() => {
                const dialog = document.getElementById('create-set-dialog') as HTMLDialogElement;
                dialog?.close();
              }}
              class="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </dialog>
  </div>
</div>

<style>
  :global(body) {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  }

  .room-settings-panel {
    background: rgba(0, 0, 0, 0.3);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 1rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .room-settings-panel label {
    color: rgba(255, 255, 255, 0.9);
  }

  .room-settings-panel input[type="text"],
  .room-settings-panel textarea {
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.75rem;
    border-radius: 0.5rem;
    width: 100%;
    font-size: 1rem;
  }

  .room-settings-panel input[type="text"]:focus,
  .room-settings-panel textarea:focus {
    outline: none;
    border-color: #ffd700;
  }

  .room-settings-panel input[type="checkbox"] {
    cursor: pointer;
  }

  .trivia-questions-panel {
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
  }

  .trivia-panel-content {
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .create-set-dialog {
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid rgba(255, 215, 0, 0.5);
    border-radius: 1rem;
    padding: 0;
    max-width: 500px;
    width: 90%;
  }

  .create-set-dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }

  .dialog-content {
    padding: 2rem;
    color: white;
  }

  .dialog-content label {
    color: rgba(255, 255, 255, 0.9);
  }

  .dialog-content input,
  .dialog-content textarea {
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.75rem;
    border-radius: 0.5rem;
    width: 100%;
  }

  .dialog-content input:focus,
  .dialog-content textarea:focus {
    outline: none;
    border-color: #ffd700;
  }
</style>
