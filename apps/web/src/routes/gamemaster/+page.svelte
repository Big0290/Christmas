<script lang="ts">
  import { GameType, GlobalSettingsSchema, TriviaRoyaleSettingsSchema, GiftGrabberSettingsSchema, WorkshopTycoonSettingsSchema, EmojiCarolSettingsSchema, NaughtyOrNiceSettingsSchema, PriceIsRightSettingsSchema, type GlobalSettings, type TriviaRoyaleSettings, type GiftGrabberSettings, type WorkshopTycoonSettings, type EmojiCarolSettings, type NaughtyOrNiceSettings, type PriceIsRightSettings } from '@christmas/core';
  import { onMount } from 'svelte';
  import { socket, connectSocket } from '$lib/socket';

  let currentTab: GameType | 'global' = 'global';
  let password = '';
  let authenticated = false;
  let saving = false;
  let saveMessage = '';
  let roomCode = '';
  let connectedToRoom = false;

  // Global Settings State
  let globalSettings: GlobalSettings = GlobalSettingsSchema.parse({ theme: {} });

  // Game-specific Settings State
  let triviaSettings: TriviaRoyaleSettings = TriviaRoyaleSettingsSchema.parse({});
  let giftGrabberSettings: GiftGrabberSettings = GiftGrabberSettingsSchema.parse({});
  let workshopSettings: WorkshopTycoonSettings = WorkshopTycoonSettingsSchema.parse({});
  let emojiSettings: EmojiCarolSettings = EmojiCarolSettingsSchema.parse({});
  let naughtySettings: NaughtyOrNiceSettings = NaughtyOrNiceSettingsSchema.parse({});
  let priceSettings: PriceIsRightSettings = PriceIsRightSettingsSchema.parse({});

  const tabs = [
    { id: 'global', name: '🌍 Global Settings', icon: '⚙️' },
    { id: 'custom', name: '📝 Custom Content', icon: '📝' },
    { id: GameType.TRIVIA_ROYALE, name: '🎄 Trivia Royale', icon: '❓' },
    { id: GameType.GIFT_GRABBER, name: '🎁 Gift Grabber', icon: '🎁' },
    { id: GameType.WORKSHOP_TYCOON, name: '🏭 Workshop Tycoon', icon: '🏭' },
    { id: GameType.EMOJI_CAROL, name: '🎶 Emoji Carol', icon: '😊' },
    { id: GameType.NAUGHTY_OR_NICE, name: '😇 Naughty or Nice', icon: '👼' },
    { id: GameType.PRICE_IS_RIGHT, name: '💰 Price Is Right', icon: '💵' },
  ];

  // Custom Content State
  let customContentTab: 'questions' | 'items' = 'questions';
  let customQuestions: any[] = [];
  let customItems: any[] = [];
  let currentSetId = '';
  let newSetName = '';
  let loadingCustom = false;
  
  // Form state for adding questions/items
  let newQuestion = {
    question: '',
    answers: ['', '', '', ''],
    correctIndex: 0,
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    category: '',
    imageUrl: '',
  };
  
  let newItem = {
    name: '',
    description: '',
    price: 0,
    imageUrl: '',
    category: '',
  };

  onMount(() => {
    connectSocket();
    
    // Listen for settings updates
    $socket.on('settings_updated', (data) => {
      showMessage('Settings updated successfully!');
      console.log('Settings updated:', data);
    });
  });

  function authenticate() {
    // Simple password check - in production, use proper auth
    if (password === 'admin') {
      authenticated = true;
    } else {
      alert('Invalid password');
    }
  }

  function showMessage(message: string) {
    saveMessage = message;
    setTimeout(() => {
      saveMessage = '';
    }, 3000);
  }

  function connectToRoom() {
    if (!roomCode || roomCode.length !== 4) {
      showMessage('Please enter a valid 4-character room code');
      return;
    }
    
    // In a real implementation, you'd verify room access here
    // For now, we'll just mark as connected
    connectedToRoom = true;
    showMessage(`Connected to room ${roomCode.toUpperCase()}`);
  }

  function exportSettings() {
    const allSettings = {
      global: globalSettings,
      trivia_royale: triviaSettings,
      gift_grabber: giftGrabberSettings,
      workshop_tycoon: workshopSettings,
      emoji_carol: emojiSettings,
      naughty_or_nice: naughtySettings,
      price_is_right: priceSettings,
    };
    
    const json = JSON.stringify(allSettings, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    
    showMessage('Settings exported successfully!');
  }

  function importSettings(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        
        if (imported.global) {
          globalSettings = GlobalSettingsSchema.parse(imported.global);
        }
        if (imported.trivia_royale) {
          triviaSettings = TriviaRoyaleSettingsSchema.parse(imported.trivia_royale);
        }
        if (imported.gift_grabber) {
          giftGrabberSettings = GiftGrabberSettingsSchema.parse(imported.gift_grabber);
        }
        if (imported.workshop_tycoon) {
          workshopSettings = WorkshopTycoonSettingsSchema.parse(imported.workshop_tycoon);
        }
        if (imported.emoji_carol) {
          emojiSettings = EmojiCarolSettingsSchema.parse(imported.emoji_carol);
        }
        if (imported.naughty_or_nice) {
          naughtySettings = NaughtyOrNiceSettingsSchema.parse(imported.naughty_or_nice);
        }
        if (imported.price_is_right) {
          priceSettings = PriceIsRightSettingsSchema.parse(imported.price_is_right);
        }
        
        showMessage('Settings imported successfully!');
      } catch (error) {
        showMessage('Error: Invalid settings file');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
  }

  function saveGlobalSettings() {
    if (!authenticated) return;
    
    saving = true;
    try {
      // Validate settings
      const validated = GlobalSettingsSchema.parse(globalSettings);
      
      if (connectedToRoom && $socket) {
        // Send to server if connected to a room
        // Note: Global settings might need a different endpoint
        showMessage('Global settings saved! (Note: Room connection required for live updates)');
      } else {
        showMessage('Global settings saved successfully!');
      }
      
      console.log('Global settings:', validated);
    } catch (error) {
      showMessage('Error: Invalid settings');
      console.error('Validation error:', error);
    } finally {
      saving = false;
    }
  }

  function saveGameSettings(gameType: GameType) {
    if (!authenticated) return;
    
    saving = true;
    try {
      let validated: any;
      
      switch (gameType) {
        case GameType.TRIVIA_ROYALE:
          validated = TriviaRoyaleSettingsSchema.parse(triviaSettings);
          break;
        case GameType.GIFT_GRABBER:
          validated = GiftGrabberSettingsSchema.parse(giftGrabberSettings);
          break;
        case GameType.WORKSHOP_TYCOON:
          validated = WorkshopTycoonSettingsSchema.parse(workshopSettings);
          break;
        case GameType.EMOJI_CAROL:
          validated = EmojiCarolSettingsSchema.parse(emojiSettings);
          break;
        case GameType.NAUGHTY_OR_NICE:
          validated = NaughtyOrNiceSettingsSchema.parse(naughtySettings);
          break;
        case GameType.PRICE_IS_RIGHT:
          validated = PriceIsRightSettingsSchema.parse(priceSettings);
          break;
      }
      
      // Send to server if connected to a room
      if (connectedToRoom && $socket) {
        $socket.emit('update_settings', gameType, validated);
        showMessage(`${tabs.find(t => t.id === gameType)?.name} settings saved and sent to room!`);
      } else {
        showMessage(`${tabs.find(t => t.id === gameType)?.name} settings saved! (Connect to room for live updates)`);
      }
      
      console.log(`${gameType} settings:`, validated);
    } catch (error) {
      showMessage('Error: Invalid settings');
      console.error('Validation error:', error);
    } finally {
      saving = false;
    }
  }

  function generateSetId(): string {
    return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function createNewSet() {
    if (!newSetName.trim()) {
      showMessage('Please enter a set name');
      return;
    }
    currentSetId = generateSetId();
    showMessage(`Created new set: ${newSetName}`);
    newSetName = '';
  }

  function addQuestion() {
    if (!newQuestion.question.trim() || newQuestion.answers.filter(a => a.trim()).length < 2) {
      showMessage('Please fill in question and at least 2 answers');
      return;
    }
    
    const question = {
      ...newQuestion,
      answers: newQuestion.answers.filter(a => a.trim()),
    };
    
    customQuestions.push(question);
    
    // Reset form
    newQuestion = {
      question: '',
      answers: ['', '', '', ''],
      correctIndex: 0,
      difficulty: 'medium',
      category: '',
      imageUrl: '',
    };
    
    showMessage('Question added!');
  }

  function addItem() {
    if (!newItem.name.trim() || !newItem.imageUrl.trim() || newItem.price <= 0) {
      showMessage('Please fill in name, image URL, and valid price');
      return;
    }
    
    customItems.push({ ...newItem });
    
    // Reset form
    newItem = {
      name: '',
      description: '',
      price: 0,
      imageUrl: '',
      category: '',
    };
    
    showMessage('Item added!');
  }

  function removeQuestion(index: number) {
    customQuestions.splice(index, 1);
    showMessage('Question removed');
  }

  function removeItem(index: number) {
    customItems.splice(index, 1);
    showMessage('Item removed');
  }

  function saveCustomQuestions() {
    if (!currentSetId) {
      showMessage('Please create or select a set first');
      return;
    }
    
    if (customQuestions.length === 0) {
      showMessage('Please add at least one question');
      return;
    }
    
    loadingCustom = true;
    $socket.emit('save_custom_questions', customQuestions, currentSetId, (response: any) => {
      loadingCustom = false;
      if (response.success) {
        showMessage(`Saved ${response.count} questions to set ${currentSetId}`);
        // Update trivia settings to use this set
        triviaSettings.customQuestionSetId = currentSetId;
      } else {
        showMessage(`Error: ${response.error}`);
      }
    });
  }

  function saveCustomItems() {
    if (!currentSetId) {
      showMessage('Please create or select a set first');
      return;
    }
    
    if (customItems.length === 0) {
      showMessage('Please add at least one item');
      return;
    }
    
    loadingCustom = true;
    $socket.emit('save_custom_items', customItems, currentSetId, (response: any) => {
      loadingCustom = false;
      if (response.success) {
        showMessage(`Saved ${response.count} items to set ${currentSetId}`);
        // Update price settings to use this set
        priceSettings.customItemSetId = currentSetId;
      } else {
        showMessage(`Error: ${response.error}`);
      }
    });
  }

  function loadCustomQuestions() {
    if (!currentSetId) {
      showMessage('Please enter a set ID');
      return;
    }
    
    loadingCustom = true;
    $socket.emit('get_custom_questions', currentSetId, (response: any) => {
      loadingCustom = false;
      if (response.success) {
        customQuestions = response.questions;
        showMessage(`Loaded ${response.questions.length} questions`);
      } else {
        showMessage(`Error: ${response.error}`);
      }
    });
  }

  function loadCustomItems() {
    if (!currentSetId) {
      showMessage('Please enter a set ID');
      return;
    }
    
    loadingCustom = true;
    $socket.emit('get_custom_items', currentSetId, (response: any) => {
      loadingCustom = false;
      if (response.success) {
        customItems = response.items;
        showMessage(`Loaded ${response.items.length} items`);
      } else {
        showMessage(`Error: ${response.error}`);
      }
    });
  }

  function importQuestionsJSON(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) {
          customQuestions = imported;
          showMessage(`Imported ${imported.length} questions`);
        } else {
          showMessage('Error: Invalid JSON format. Expected an array of questions.');
        }
      } catch (error) {
        showMessage('Error: Invalid JSON file');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
  }

  function importItemsJSON(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) {
          customItems = imported;
          showMessage(`Imported ${imported.length} items`);
        } else {
          showMessage('Error: Invalid JSON format. Expected an array of items.');
        }
      } catch (error) {
        showMessage('Error: Invalid JSON file');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
  }

  function exportQuestionsJSON() {
    const json = JSON.stringify(customQuestions, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-questions.json';
    a.click();
    URL.revokeObjectURL(url);
    showMessage('Questions exported!');
  }

  function exportItemsJSON() {
    const json = JSON.stringify(customItems, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-items.json';
    a.click();
    URL.revokeObjectURL(url);
    showMessage('Items exported!');
  }
</script>

<svelte:head>
  <title>Game Master Dashboard | Christmas Party Games</title>
</svelte:head>

<div class="min-h-screen p-8">
  {#if !authenticated}
    <div class="max-w-md mx-auto mt-32">
      <div class="card">
        <h1 class="text-3xl font-bold text-center mb-6">🎮 Game Master</h1>
        <div class="space-y-4">
          <input
            type="password"
            placeholder="Enter password"
            bind:value={password}
            class="input"
            on:keydown={(e) => e.key === 'Enter' && authenticate()}
          />
          <button on:click={authenticate} class="btn-primary w-full">
            Authenticate
          </button>
        </div>
      </div>
    </div>
  {:else}
    <div class="max-w-7xl mx-auto">
      <div class="mb-8">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h1 class="text-4xl font-bold text-christmas-gold mb-2">
              🎮 Game Master Dashboard
            </h1>
            <p class="text-white/70">Configure games and manage settings</p>
          </div>
          <div class="flex gap-2">
            <button on:click={exportSettings} class="btn-secondary text-sm">
              📥 Export
            </button>
            <label class="btn-secondary text-sm cursor-pointer">
              📤 Import
              <input type="file" accept=".json" on:change={importSettings} class="hidden" />
            </label>
          </div>
        </div>
        
        <!-- Room Connection -->
        <div class="bg-white/5 rounded-lg p-4 mb-4">
          <div class="flex items-center gap-4">
            <div class="flex-1">
              <label class="block text-sm font-medium mb-2">Connect to Room (Optional)</label>
              <div class="flex gap-2">
                <input
                  type="text"
                  placeholder="Room Code (e.g., ABCD)"
                  bind:value={roomCode}
                  maxlength="4"
                  class="input text-center text-xl tracking-widest"
                  on:input={(e) => {
                    roomCode = e.currentTarget.value.toUpperCase();
                  }}
                  disabled={connectedToRoom}
                />
                {#if !connectedToRoom}
                  <button on:click={connectToRoom} class="btn-primary">
                    Connect
                  </button>
                {:else}
                  <button on:click={() => connectedToRoom = false} class="btn-secondary">
                    Disconnect
                  </button>
                {/if}
              </div>
            </div>
            {#if connectedToRoom}
              <div class="flex items-center gap-2 text-green-400">
                <span>●</span>
                <span>Connected to {roomCode}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      {#if saveMessage}
        <div class="mb-4 p-4 rounded-lg {saveMessage.includes('Error') ? 'bg-red-500/20 border border-red-500' : 'bg-green-500/20 border border-green-500'}">
          <p class="text-white">{saveMessage}</p>
        </div>
      {/if}

      <!-- Tabs -->
      <div class="flex space-x-2 mb-6 overflow-x-auto pb-2">
        {#each tabs as tab}
          <button
            on:click={() => (currentTab = tab.id)}
            class="px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all {currentTab === tab.id ? 'bg-christmas-red text-white' : 'bg-white/10 text-white/70'}"
          >
            {tab.icon} {tab.name}
          </button>
        {/each}
      </div>

      <!-- Content -->
      <div class="card">
        {#if currentTab === 'custom'}
          <h2 class="text-2xl font-bold mb-6">📝 Custom Content Management</h2>
          
          <!-- Set Management -->
          <div class="mb-6 p-4 bg-white/5 rounded-lg">
            <h3 class="text-lg font-bold mb-4">Set Management</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium mb-2">Set ID</label>
                <input
                  type="text"
                  bind:value={currentSetId}
                  placeholder="Enter or create set ID"
                  class="input"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2">New Set Name</label>
                <div class="flex gap-2">
                  <input
                    type="text"
                    bind:value={newSetName}
                    placeholder="Set name"
                    class="input"
                  />
                  <button on:click={createNewSet} class="btn-primary">
                    Create
                  </button>
                </div>
              </div>
            </div>
            {#if currentSetId}
              <p class="text-sm text-white/60">Current Set: <code class="text-christmas-gold">{currentSetId}</code></p>
            {/if}
          </div>

          <!-- Content Type Tabs -->
          <div class="flex space-x-2 mb-6">
            <button
              on:click={() => (customContentTab = 'questions')}
              class="px-4 py-2 rounded-lg font-medium {customContentTab === 'questions' ? 'bg-christmas-red text-white' : 'bg-white/10 text-white/70'}"
            >
              ❓ Trivia Questions
            </button>
            <button
              on:click={() => (customContentTab = 'items')}
              class="px-4 py-2 rounded-lg font-medium {customContentTab === 'items' ? 'bg-christmas-red text-white' : 'bg-white/10 text-white/70'}"
            >
              💰 Price Items
            </button>
          </div>

          {#if customContentTab === 'questions'}
            <!-- Questions Management -->
            <div class="space-y-6">
              <div class="flex justify-between items-center">
                <h3 class="text-xl font-bold">Trivia Questions ({customQuestions.length})</h3>
                <div class="flex gap-2">
                  <label class="btn-secondary text-sm cursor-pointer">
                    📤 Import JSON
                    <input type="file" accept=".json" on:change={importQuestionsJSON} class="hidden" />
                  </label>
                  <button on:click={exportQuestionsJSON} class="btn-secondary text-sm" disabled={customQuestions.length === 0}>
                    📥 Export JSON
                  </button>
                  <button on:click={loadCustomQuestions} class="btn-secondary text-sm" disabled={!currentSetId || loadingCustom}>
                    {loadingCustom ? 'Loading...' : '📥 Load from DB'}
                  </button>
                  <button on:click={saveCustomQuestions} class="btn-primary text-sm" disabled={!currentSetId || customQuestions.length === 0 || loadingCustom}>
                    {loadingCustom ? 'Saving...' : '💾 Save to DB'}
                  </button>
                </div>
              </div>

              <!-- Add Question Form -->
              <div class="p-4 bg-white/5 rounded-lg">
                <h4 class="font-bold mb-4">Add New Question</h4>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium mb-2">Question</label>
                    <input type="text" bind:value={newQuestion.question} class="input" placeholder="Enter question text" />
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    {#each newQuestion.answers as answer, index}
                      <div>
                        <label class="block text-sm font-medium mb-2">
                          Answer {String.fromCharCode(65 + index)}
                          {#if index === newQuestion.correctIndex}
                            <span class="text-green-400">✓ Correct</span>
                          {/if}
                        </label>
                        <div class="flex gap-2">
                          <input
                            type="text"
                            bind:value={newQuestion.answers[index]}
                            class="input"
                            placeholder="Answer text"
                          />
                          <button
                            on:click={() => (newQuestion.correctIndex = index)}
                            class="btn-secondary text-xs px-2"
                            class:bg-green-500={newQuestion.correctIndex === index}
                          >
                            ✓
                          </button>
                        </div>
                      </div>
                    {/each}
                  </div>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium mb-2">Difficulty</label>
                      <select bind:value={newQuestion.difficulty} class="input">
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-sm font-medium mb-2">Category</label>
                      <input type="text" bind:value={newQuestion.category} class="input" placeholder="e.g., Christmas" />
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium mb-2">Image URL (Optional)</label>
                    <input type="text" bind:value={newQuestion.imageUrl} class="input" placeholder="https://..." />
                  </div>
                  <button on:click={addQuestion} class="btn-primary w-full">
                    ➕ Add Question
                  </button>
                </div>
              </div>

              <!-- Questions List -->
              <div class="space-y-3 max-h-96 overflow-y-auto">
                {#each customQuestions as question, index}
                  <div class="p-4 bg-white/5 rounded-lg">
                    <div class="flex justify-between items-start mb-2">
                      <div class="flex-1">
                        <p class="font-bold">{question.question}</p>
                        <p class="text-sm text-white/60 mt-1">
                          {question.difficulty} • {question.category || 'No category'}
                        </p>
                      </div>
                      <button
                        on:click={() => removeQuestion(index)}
                        class="text-red-400 hover:text-red-300 text-xl"
                      >
                        🗑️
                      </button>
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                      {#each question.answers as answer, i}
                        <div class="text-sm p-2 rounded {i === question.correctIndex ? 'bg-green-500/20 border border-green-500' : 'bg-white/5'}">
                          {String.fromCharCode(65 + i)}: {answer}
                        </div>
                      {/each}
                    </div>
                  </div>
                {:else}
                  <p class="text-center text-white/50 py-8">No questions added yet</p>
                {/each}
              </div>
            </div>

          {:else if customContentTab === 'items'}
            <!-- Items Management -->
            <div class="space-y-6">
              <div class="flex justify-between items-center">
                <h3 class="text-xl font-bold">Price Items ({customItems.length})</h3>
                <div class="flex gap-2">
                  <label class="btn-secondary text-sm cursor-pointer">
                    📤 Import JSON
                    <input type="file" accept=".json" on:change={importItemsJSON} class="hidden" />
                  </label>
                  <button on:click={exportItemsJSON} class="btn-secondary text-sm" disabled={customItems.length === 0}>
                    📥 Export JSON
                  </button>
                  <button on:click={loadCustomItems} class="btn-secondary text-sm" disabled={!currentSetId || loadingCustom}>
                    {loadingCustom ? 'Loading...' : '📥 Load from DB'}
                  </button>
                  <button on:click={saveCustomItems} class="btn-primary text-sm" disabled={!currentSetId || customItems.length === 0 || loadingCustom}>
                    {loadingCustom ? 'Saving...' : '💾 Save to DB'}
                  </button>
                </div>
              </div>

              <!-- Add Item Form -->
              <div class="p-4 bg-white/5 rounded-lg">
                <h4 class="font-bold mb-4">Add New Item</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium mb-2">Name</label>
                    <input type="text" bind:value={newItem.name} class="input" placeholder="Item name" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium mb-2">Price</label>
                    <input type="number" bind:value={newItem.price} class="input" placeholder="0.00" step="0.01" min="0" />
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-sm font-medium mb-2">Description</label>
                    <input type="text" bind:value={newItem.description} class="input" placeholder="Item description" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium mb-2">Image URL</label>
                    <input type="text" bind:value={newItem.imageUrl} class="input" placeholder="https://..." />
                  </div>
                  <div>
                    <label class="block text-sm font-medium mb-2">Category</label>
                    <input type="text" bind:value={newItem.category} class="input" placeholder="e.g., Electronics" />
                  </div>
                </div>
                <button on:click={addItem} class="btn-primary w-full mt-4">
                  ➕ Add Item
                </button>
              </div>

              <!-- Items List -->
              <div class="space-y-3 max-h-96 overflow-y-auto">
                {#each customItems as item, index}
                  <div class="p-4 bg-white/5 rounded-lg">
                    <div class="flex justify-between items-start">
                      <div class="flex-1">
                        <div class="flex items-center gap-3">
                          {#if item.imageUrl}
                            <img src={item.imageUrl} alt={item.name} class="w-16 h-16 object-cover rounded" />
                          {/if}
                          <div>
                            <p class="font-bold">{item.name}</p>
                            <p class="text-sm text-white/60">{item.description}</p>
                            <p class="text-christmas-gold font-bold mt-1">${item.price.toFixed(2)}</p>
                            {#if item.category}
                              <span class="text-xs text-white/50">{item.category}</span>
                            {/if}
                          </div>
                        </div>
                      </div>
                      <button
                        on:click={() => removeItem(index)}
                        class="text-red-400 hover:text-red-300 text-xl"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                {:else}
                  <p class="text-center text-white/50 py-8">No items added yet</p>
                {/each}
              </div>
            </div>
          {/if}

        {:else if currentTab === 'global'}
          <h2 class="text-2xl font-bold mb-6">Global Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Room Code Length</label>
              <input 
                type="number" 
                min="4" 
                max="8" 
                bind:value={globalSettings.roomCodeLength} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">4-8 characters</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Room Expiration (Hours)</label>
              <input 
                type="number" 
                min="1" 
                max="168" 
                bind:value={globalSettings.roomExpirationHours} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">1-168 hours</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Max Players</label>
              <input 
                type="number" 
                min="5" 
                max="100" 
                bind:value={globalSettings.maxPlayers} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">5-100 players</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Avatar Style</label>
              <select bind:value={globalSettings.avatarStyle} class="input">
                <option value="festive">Festive</option>
                <option value="emoji">Emoji</option>
                <option value="random">Random</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Primary Color</label>
              <input 
                type="color" 
                bind:value={globalSettings.theme.primaryColor} 
                class="input h-12" 
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Secondary Color</label>
              <input 
                type="color" 
                bind:value={globalSettings.theme.secondaryColor} 
                class="input h-12" 
              />
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="snow" 
                bind:checked={globalSettings.theme.snowEffect} 
                class="mr-2" 
              />
              <label for="snow">Enable Snow Effect</label>
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="sound" 
                bind:checked={globalSettings.theme.soundEnabled} 
                class="mr-2" 
              />
              <label for="sound">Enable Sound</label>
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="spectator" 
                bind:checked={globalSettings.spectatorMode} 
                class="mr-2" 
              />
              <label for="spectator">Enable Spectator Mode</label>
            </div>
          </div>
          <button 
            on:click={saveGlobalSettings} 
            disabled={saving}
            class="btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Global Settings'}
          </button>

        {:else if currentTab === GameType.TRIVIA_ROYALE}
          <h2 class="text-2xl font-bold mb-6">🎄 Trivia Royale Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Question Count</label>
              <input 
                type="number" 
                min="5" 
                max="50" 
                bind:value={triviaSettings.questionCount} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">5-50 questions</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Time Per Question (seconds)</label>
              <input 
                type="number" 
                min="5" 
                max="60" 
                bind:value={triviaSettings.timePerQuestion} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">5-60 seconds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Difficulty</label>
              <select bind:value={triviaSettings.difficulty} class="input">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Scoring Strategy</label>
              <select bind:value={triviaSettings.scoringStrategy} class="input">
                <option value="speed">Speed</option>
                <option value="accuracy">Accuracy</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Speed Bonus Multiplier</label>
              <input 
                type="number" 
                min="1" 
                max="3" 
                step="0.1"
                bind:value={triviaSettings.speedBonusMultiplier} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">1.0-3.0x</p>
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="trivia-images" 
                bind:checked={triviaSettings.imagesEnabled} 
                class="mr-2" 
              />
              <label for="trivia-images">Enable Images</label>
            </div>
          </div>
          <button 
            on:click={() => saveGameSettings(GameType.TRIVIA_ROYALE)} 
            disabled={saving}
            class="btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Trivia Royale Settings'}
          </button>

        {:else if currentTab === GameType.GIFT_GRABBER}
          <h2 class="text-2xl font-bold mb-6">🎁 Gift Grabber Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Map Size</label>
              <select bind:value={giftGrabberSettings.mapSize} class="input">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Session Duration (seconds)</label>
              <input 
                type="number" 
                min="60" 
                max="300" 
                bind:value={giftGrabberSettings.sessionDuration} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">60-300 seconds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Gift Spawn Rate</label>
              <input 
                type="number" 
                min="1" 
                max="10" 
                bind:value={giftGrabberSettings.giftSpawnRate} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">1-10 per interval</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Coal Spawn Rate</label>
              <input 
                type="number" 
                min="0" 
                max="5" 
                bind:value={giftGrabberSettings.coalSpawnRate} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">0-5 per interval</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Player Speed</label>
              <input 
                type="number" 
                min="0.5" 
                max="2" 
                step="0.1"
                bind:value={giftGrabberSettings.playerSpeed} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">0.5-2.0x</p>
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="gift-collisions" 
                bind:checked={giftGrabberSettings.collisionsEnabled} 
                class="mr-2" 
              />
              <label for="gift-collisions">Enable Collisions</label>
            </div>
          </div>
          <button 
            on:click={() => saveGameSettings(GameType.GIFT_GRABBER)} 
            disabled={saving}
            class="btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Gift Grabber Settings'}
          </button>

        {:else if currentTab === GameType.WORKSHOP_TYCOON}
          <h2 class="text-2xl font-bold mb-6">🏭 Workshop Tycoon Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Starting Resources</label>
              <input 
                type="number" 
                min="0" 
                max="1000" 
                bind:value={workshopSettings.startingResources} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">0-1000 resources</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Session Duration (seconds)</label>
              <input 
                type="number" 
                min="120" 
                max="600" 
                bind:value={workshopSettings.sessionDuration} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">120-600 seconds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Upgrade Cost Curve</label>
              <select bind:value={workshopSettings.upgradeCostCurve} class="input">
                <option value="linear">Linear</option>
                <option value="exponential">Exponential</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Boost Frequency (seconds)</label>
              <input 
                type="number" 
                min="10" 
                max="60" 
                bind:value={workshopSettings.boostFrequency} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">10-60 seconds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Production Multiplier</label>
              <input 
                type="number" 
                min="0.5" 
                max="3" 
                step="0.1"
                bind:value={workshopSettings.productionMultiplier} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">0.5-3.0x</p>
            </div>
          </div>
          <button 
            on:click={() => saveGameSettings(GameType.WORKSHOP_TYCOON)} 
            disabled={saving}
            class="btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Workshop Tycoon Settings'}
          </button>

        {:else if currentTab === GameType.EMOJI_CAROL}
          <h2 class="text-2xl font-bold mb-6">🎶 Emoji Carol Battle Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Round Count</label>
              <input 
                type="number" 
                min="3" 
                max="15" 
                bind:value={emojiSettings.roundCount} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">3-15 rounds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Time Per Round (seconds)</label>
              <input 
                type="number" 
                min="10" 
                max="30" 
                bind:value={emojiSettings.timePerRound} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">10-30 seconds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Unique Pick Bonus</label>
              <input 
                type="number" 
                min="0" 
                max="10" 
                bind:value={emojiSettings.uniquePickBonus} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">0-10 bonus points</p>
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="emoji-duplicates" 
                bind:checked={emojiSettings.allowDuplicates} 
                class="mr-2" 
              />
              <label for="emoji-duplicates">Allow Duplicate Picks</label>
            </div>
          </div>
          <button 
            on:click={() => saveGameSettings(GameType.EMOJI_CAROL)} 
            disabled={saving}
            class="btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Emoji Carol Settings'}
          </button>

        {:else if currentTab === GameType.NAUGHTY_OR_NICE}
          <h2 class="text-2xl font-bold mb-6">😇 Naughty or Nice Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Prompt Count</label>
              <input 
                type="number" 
                min="5" 
                max="30" 
                bind:value={naughtySettings.promptCount} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">5-30 prompts</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Content Filter</label>
              <select bind:value={naughtySettings.contentFilter} class="input">
                <option value="pg">PG</option>
                <option value="pg13">PG-13</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Vote Mode</label>
              <select bind:value={naughtySettings.voteMode} class="input">
                <option value="majority">Majority</option>
                <option value="weighted">Weighted</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Reveal Speed</label>
              <select bind:value={naughtySettings.revealSpeed} class="input">
                <option value="slow">Slow</option>
                <option value="medium">Medium</option>
                <option value="fast">Fast</option>
              </select>
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="naughty-anonymous" 
                bind:checked={naughtySettings.anonymousVoting} 
                class="mr-2" 
              />
              <label for="naughty-anonymous">Anonymous Voting</label>
            </div>
          </div>
          <button 
            on:click={() => saveGameSettings(GameType.NAUGHTY_OR_NICE)} 
            disabled={saving}
            class="btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Naughty or Nice Settings'}
          </button>

        {:else if currentTab === GameType.PRICE_IS_RIGHT}
          <h2 class="text-2xl font-bold mb-6">💰 Price Is Right Settings</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium mb-2">Round Count</label>
              <input 
                type="number" 
                min="3" 
                max="20" 
                bind:value={priceSettings.roundCount} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">3-20 rounds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Time Limit (seconds)</label>
              <input 
                type="number" 
                min="10" 
                max="60" 
                bind:value={priceSettings.timeLimit} 
                class="input" 
              />
              <p class="text-xs text-white/50 mt-1">10-60 seconds</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Scoring Mode</label>
              <select bind:value={priceSettings.scoringMode} class="input">
                <option value="closest_without_over">Closest Without Over</option>
                <option value="closest_overall">Closest Overall</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Item Selection</label>
              <select bind:value={priceSettings.itemSelection} class="input">
                <option value="random">Random</option>
                <option value="sequential">Sequential</option>
                <option value="category">Category</option>
              </select>
            </div>
            <div class="flex items-center">
              <input 
                type="checkbox" 
                id="price-hints" 
                bind:checked={priceSettings.showHints} 
                class="mr-2" 
              />
              <label for="price-hints">Show Hints</label>
            </div>
          </div>
          <button 
            on:click={() => saveGameSettings(GameType.PRICE_IS_RIGHT)} 
            disabled={saving}
            class="btn-primary mt-6"
          >
            {saving ? 'Saving...' : 'Save Price Is Right Settings'}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }
</style>
