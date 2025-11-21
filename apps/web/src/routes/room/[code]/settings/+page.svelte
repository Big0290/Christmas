<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { socket, connectSocket, connected } from '$lib/socket';
  import { GameType } from '@christmas/core';
  import { loadRoomTheme, roomTheme, updateRoomTheme, applyRoomTheme } from '$lib/theme';

  // Tab Components
  import RoomSettingsTab from '$lib/components/room/RoomSettingsTab.svelte';
  import TriviaTab from '$lib/components/room/TriviaTab.svelte';
  import PriceIsRightTab from '$lib/components/room/PriceIsRightTab.svelte';
  import NaughtyOrNiceTab from '$lib/components/room/NaughtyOrNiceTab.svelte';
  import EmojiCarolTab from '$lib/components/room/EmojiCarolTab.svelte';
  import GeneralSettingsTab from '$lib/components/room/GeneralSettingsTab.svelte';
  import CreateSetDialog from '$lib/components/room/CreateSetDialog.svelte';
  import { t, translate, language } from '$lib/i18n';

  const roomCode = $page.params.code;
  
  // Make translations reactive by subscribing to language changes
  $: currentLang = $language;
  $: _ = currentLang; // Force reactivity
  let isHost = false;
  let roomName = '';
  let roomDescription = '';
  let loadingSettings = false;

  // Trivia Questions Management
  let questionSets: Array<{
    id: string;
    name: string;
    description?: string;
    questionCount: number;
  }> = [];
  let selectedQuestionSet: string | null = null;
  let currentQuestions: Array<{
    id: string;
    question: string;
    answers: string[];
    correctIndex: number;
    difficulty: string;
    category?: string;
  }> = [];
  let loadingSets = false;
  let loadingQuestions = false;
  let creatingSet = false;
  let addingQuestion = false;
  let updatingQuestion = false;
  let editingQuestion: { id: string; question: string; questionFr: string; answers: string[]; answersFr: string[]; correctIndex: number; difficulty: string; category?: string } | null = null;
  let newSetName = '';
  let newSetDescription = '';
  let newQuestion = {
    question: '',
    questionFr: '',
    answers: ['', '', '', ''],
    answersFr: ['', '', '', ''],
    correctIndex: 0,
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    category: '',
  };

  // Tab navigation
  type TabType = 'room' | 'trivia' | 'price' | 'naughty' | 'emoji' | 'general';
  let activeTab: TabType = 'room';

  // Load active tab from sessionStorage
  if (browser) {
    const savedTab = sessionStorage.getItem(`room_tab_${roomCode}`);
    if (savedTab && ['room', 'trivia', 'price', 'naughty', 'emoji', 'general'].includes(savedTab)) {
      activeTab = savedTab as TabType;
    }
  }

  function setActiveTab(tab: TabType) {
    activeTab = tab;
    if (browser) {
      sessionStorage.setItem(`room_tab_${roomCode}`, tab);
    }
  }

  // General settings - synced with store
  let backgroundMusic = true;
  let snowEffect = true;
  
  // Sync local variables with store
  $: {
    const theme = get(roomTheme);
    if (theme) {
      backgroundMusic = theme.backgroundMusic ?? true;
      snowEffect = theme.snowEffect ?? true;
    }
  }

  // Price Is Right state
  let itemSets: Array<{ id: string; name: string; description?: string; itemCount: number }> = [];
  let selectedItemSet: string | null = null;
  let currentItems: Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    category: string;
  }> = [];
  let loadingItemSets = false;
  let loadingItems = false;
  let creatingItemSet = false;
  let addingItem = false;
  let newItemSetName = '';
  let newItemSetDescription = '';
  let newItem = {
    name: '',
    nameFr: '',
    description: '',
    descriptionFr: '',
    price: 0,
    imageUrl: '',
    category: '',
  };
  let priceTimePerRound = 30;

  // Naughty or Nice state
  let promptSets: Array<{ id: string; name: string; description?: string; promptCount: number }> = [];
  let selectedPromptSet: string | null = null;
  let currentPrompts: Array<{
    id: string;
    prompt: string;
    category: string;
    contentRating: string;
  }> = [];
  let loadingPromptSets = false;
  let loadingPrompts = false;
  let creatingPromptSet = false;
  let addingPrompt = false;
  let newPromptSetName = '';
  let newPromptSetDescription = '';
  let newPrompt = {
    prompt: '',
    promptFr: '',
    category: '',
    contentRating: 'pg' as 'pg' | 'pg13',
  };
  let naughtyTimePerRound = 15;

  // Emoji Carol state
  let emojiTimePerRound = 15;

  // Trivia time setting
  let triviaTimePerQuestion = 15;

  onMount(() => {
    connectSocket();

    // Check if we're the host
    if (browser) {
      const storedIsHost = sessionStorage.getItem(`host_${roomCode}`);
      if (storedIsHost === 'true') {
        isHost = true;
      } else {
        isHost = true; // Assume host for settings page
      }
    } else {
      isHost = true;
    }

    // Verify host connection
    const verifyHostConnection = () => {
      const isConnected = $connected;
      if (!$socket || !isConnected) {
        const unsubscribe = connected.subscribe((isConnectedNow) => {
          if (isConnectedNow && $socket) {
            unsubscribe();
            verifyHostConnection();
          }
        });
        return;
      }

      if (browser) {
        const hostToken = localStorage.getItem('christmas_hostToken');
        const savedRoomCode = localStorage.getItem('christmas_roomCode');

        if (hostToken && savedRoomCode === roomCode) {
          $socket.emit('reconnect_host', roomCode, hostToken, (response: any) => {
            if (response && response.success) {
            if (isHost && $socket) {
              loadRoomSettings();
              loadQuestionSets();
              loadItemSets();
              loadAllSettings();
            } else {
              loadRoomSettings();
            }
            }
          });
        } else {
          // Try to load settings anyway
          if (isHost && $socket) {
            loadRoomSettings();
            loadQuestionSets();
            loadItemSets();
            loadAllSettings();
          }
        }
      }
    };

    if ($socket && $connected) {
      verifyHostConnection();
    } else {
      const unsubscribe = connected.subscribe((isConnected) => {
        if (isConnected && $socket) {
          unsubscribe();
          verifyHostConnection();
        }
      });
    }

    // Listen for room settings updates
    if ($socket) {
      $socket.on('room_settings_updated', (settings: any) => {
        if (settings.roomName !== undefined) roomName = settings.roomName || '';
        if (settings.description !== undefined) roomDescription = settings.description || '';
        if (settings.backgroundMusic !== undefined) {
          backgroundMusic = settings.backgroundMusic;
        }
        if (settings.snowEffect !== undefined) {
          snowEffect = settings.snowEffect;
        }
        // Update theme store directly instead of reloading from server
        if (
          settings.sparkles !== undefined ||
          settings.icicles !== undefined ||
          settings.frostPattern !== undefined ||
          settings.colorScheme !== undefined ||
          settings.backgroundMusic !== undefined ||
          settings.snowEffect !== undefined ||
          settings.language !== undefined
        ) {
          roomTheme.update((theme) => {
            if (!theme) return theme;
            const updated = { ...theme };
            if (settings.backgroundMusic !== undefined) updated.backgroundMusic = settings.backgroundMusic;
            if (settings.snowEffect !== undefined) updated.snowEffect = settings.snowEffect;
            if (settings.sparkles !== undefined) updated.sparkles = settings.sparkles;
            if (settings.icicles !== undefined) updated.icicles = settings.icicles;
            if (settings.frostPattern !== undefined) updated.frostPattern = settings.frostPattern;
            if (settings.colorScheme !== undefined) updated.colorScheme = settings.colorScheme;
            if (settings.language !== undefined) {
              updated.language = settings.language;
              language.set(settings.language);
            }
            applyRoomTheme(updated);
            return updated;
          });
        }
      });
    }
  });

  function loadRoomSettings() {
    loadRoomTheme(roomCode).then((theme) => {
      if (theme) {
        backgroundMusic = theme.backgroundMusic;
        snowEffect = theme.snowEffect;
        // Ensure theme is applied after loading
        if (theme) {
          applyRoomTheme(theme);
        }
      }
    });
    roomName = '';
    roomDescription = '';
  }

  function saveRoomSettings() {
    if (!$socket || !isHost) return;
    loadingSettings = true;
    $socket.emit(
      'update_room_settings',
      roomCode,
      {
        roomName: roomName.trim() || undefined,
        description: roomDescription.trim() || undefined,
      },
      (response: any) => {
        loadingSettings = false;
        if (response.success) {
          showMessage(t('settings.saved'));
        } else {
          alert(response.error || t('settings.errors.failedUpdate'));
        }
      }
    );
  }

  onDestroy(() => {
    if ($socket) {
      $socket.off('room_settings_updated');
    }
  });

  function showMessage(message: string) {
    const msgEl = document.createElement('div');
    msgEl.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg z-50';
    msgEl.textContent = message;
    document.body.appendChild(msgEl);
    setTimeout(() => {
      msgEl.remove();
    }, 3000);
  }

  // Trivia Questions Management Functions
  function loadQuestionSets() {
    if (!$socket || !isHost) return;
    loadingSets = true;
    $socket.emit('list_question_sets', (response: any) => {
      loadingSets = false;
      if (response.success) {
        questionSets = response.sets;
        loadRoomQuestionSet();
      }
    });
  }

  function loadRoomQuestionSet() {
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
    $socket.emit(
      'create_question_set',
      newSetName.trim(),
      newSetDescription.trim() || undefined,
      (response: any) => {
        creatingSet = false;
        if (response.success) {
          newSetName = '';
          newSetDescription = '';
          
          // Close the dialog
          if (browser) {
            const dialog = document.getElementById('create-set-dialog');
            if (dialog instanceof HTMLDialogElement) {
              dialog.close();
            }
          }
          
          // Reload question sets list to refresh selection
          loadQuestionSets();
          
          // Set the newly created set as selected after reload
          setTimeout(() => {
            selectedQuestionSet = response.set.id;
            loadQuestionsForSet(response.set.id);
            saveRoomQuestionSet(response.set.id);
          }, 100);
          
          showMessage(t('triviaTab.success.setCreated'));
        } else {
          alert(response.error || t('triviaTab.errors.failedCreateSet'));
        }
      }
    );
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
        currentQuestions = [];
      }
    });
  }

  function onQuestionSetChange(setId: string | null) {
    selectedQuestionSet = setId;
    if (setId) {
      loadQuestionsForSet(setId);
      saveRoomQuestionSet(setId);
    } else {
      currentQuestions = [];
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
      alert(t('triviaTab.errors.selectSetFirst'));
      return;
    }
    if (!newQuestion.question.trim() || newQuestion.answers.filter((a) => a.trim()).length < 2) {
      alert(t('triviaTab.errors.fillQuestionAndAnswers'));
      return;
    }
    const question = {
      question: newQuestion.question.trim(),
      answers: newQuestion.answers.filter((a) => a.trim()),
      correctIndex: newQuestion.correctIndex,
      difficulty: newQuestion.difficulty,
      category: newQuestion.category.trim() || undefined,
      translations: {
        en: {
          question: newQuestion.question.trim(),
          answers: newQuestion.answers.filter((a) => a.trim()),
        },
        ...(newQuestion.questionFr.trim() || newQuestion.answersFr.some(a => a.trim()) ? {
          fr: {
            question: newQuestion.questionFr.trim() || newQuestion.question.trim(),
            answers: newQuestion.answersFr.map((a, i) => a.trim() || newQuestion.answers[i].trim()),
          }
        } : {}),
      },
    };
    addingQuestion = true;
    $socket.emit('add_question_to_set', selectedQuestionSet, question, (response: any) => {
      addingQuestion = false;
      if (response.success) {
        currentQuestions.push(response.question);
        newQuestion = {
          question: '',
          questionFr: '',
          answers: ['', '', '', ''],
          answersFr: ['', '', '', ''],
          correctIndex: 0,
          difficulty: 'medium',
          category: '',
        };
        showMessage(t('triviaTab.success.questionAdded'));
      } else {
        alert(response.error || t('triviaTab.errors.failedAddQuestion'));
      }
    });
  }

  function startEditingQuestion(question: any) {
    const translations = question.translations || {};
    editingQuestion = {
      id: question.id,
      question: question.question,
      questionFr: translations?.fr?.question || '',
      answers: [...question.answers],
      answersFr: translations?.fr?.answers || ['', '', '', ''],
      correctIndex: question.correctIndex,
      difficulty: question.difficulty,
      category: question.category || '',
    };
  }

  function cancelEditing() {
    editingQuestion = null;
  }

  function updateQuestion() {
    if (!$socket || !isHost || !editingQuestion) return;
    if (!editingQuestion.question.trim() || editingQuestion.answers.filter((a) => a.trim()).length < 2) {
      alert(t('triviaTab.errors.fillQuestionAndAnswers'));
      return;
    }
    const question = {
      question: editingQuestion.question.trim(),
      answers: editingQuestion.answers.filter((a) => a.trim()),
      correctIndex: editingQuestion.correctIndex,
      difficulty: editingQuestion.difficulty,
      category: editingQuestion.category?.trim() || undefined,
      translations: {
        en: {
          question: editingQuestion.question.trim(),
          answers: editingQuestion.answers.filter((a) => a.trim()),
        },
        ...(editingQuestion.questionFr.trim() || editingQuestion.answersFr.some(a => a.trim()) ? {
          fr: {
            question: editingQuestion.questionFr.trim() || editingQuestion.question.trim(),
            answers: editingQuestion.answersFr.map((a, i) => a.trim() || editingQuestion.answers[i].trim()),
          }
        } : {}),
      },
    };
    updatingQuestion = true;
    $socket.emit('update_question', editingQuestion.id, question, (response: any) => {
      updatingQuestion = false;
      if (response.success) {
        const index = currentQuestions.findIndex((q) => q.id === editingQuestion!.id);
        if (index !== -1) {
          currentQuestions[index] = response.question;
        }
        editingQuestion = null;
        showMessage(t('triviaTab.success.questionUpdated'));
      } else {
        alert(response.error || t('triviaTab.errors.failedUpdateQuestion'));
      }
    });
  }

  function deleteQuestion(questionId: string) {
    if (!$socket || !isHost || !confirm(t('triviaTab.confirm.deleteQuestion'))) return;
    $socket.emit('delete_custom_question', questionId, (response: any) => {
      if (response.success) {
        currentQuestions = currentQuestions.filter((q) => q.id !== questionId);
        if (editingQuestion?.id === questionId) {
          editingQuestion = null;
        }
        showMessage(t('triviaTab.success.questionDeleted'));
        if (selectedQuestionSet) {
          loadQuestionsForSet(selectedQuestionSet);
        }
      } else {
        alert(response.error || t('triviaTab.errors.failedDeleteQuestion'));
      }
    });
  }

  function deleteQuestionSet(setId: string) {
    if (!$socket || !isHost || !confirm(t('triviaTab.confirm.deleteSet'))) return;
    $socket.emit('delete_question_set', setId, (response: any) => {
      if (response.success) {
        questionSets = questionSets.filter((s) => s.id !== setId);
        if (selectedQuestionSet === setId) {
          selectedQuestionSet = null;
          currentQuestions = [];
          saveRoomQuestionSet(null);
        }
        showMessage(t('triviaTab.success.setDeleted'));
      } else {
        alert(response.error || t('triviaTab.errors.failedDeleteSet'));
      }
    });
  }

  function openCreateSetDialog() {
    newSetName = '';
    newSetDescription = '';
    creatingSet = false;
    if (browser) {
      const dialog = document.getElementById('create-set-dialog');
      if (dialog instanceof HTMLDialogElement) {
        dialog.showModal();
      }
    }
  }

  function loadAllSettings() {
    if (!$socket || !isHost) return;
    $socket.emit('get_game_settings', roomCode, GameType.TRIVIA_ROYALE, (response: any) => {
      if (response.success && response.settings?.timePerQuestion) {
        triviaTimePerQuestion = response.settings.timePerQuestion;
      }
    });
    $socket.emit('get_game_settings', roomCode, GameType.PRICE_IS_RIGHT, (response: any) => {
      if (response.success && response.settings?.timeLimit) {
        priceTimePerRound = response.settings.timeLimit;
      }
    });
    $socket.emit('get_game_settings', roomCode, GameType.NAUGHTY_OR_NICE, (response: any) => {
      if (response.success && response.settings?.timePerRound) {
        naughtyTimePerRound = response.settings.timePerRound;
      }
    });
    $socket.emit('get_game_settings', roomCode, GameType.EMOJI_CAROL, (response: any) => {
      if (response.success && response.settings?.timePerRound) {
        emojiTimePerRound = response.settings.timePerRound;
      }
    });
  }

  // Price Is Right functions
  function loadItemSets() {
    if (!$socket || !isHost) return;
    loadingItemSets = true;
    $socket.emit('list_item_sets', (response: any) => {
      loadingItemSets = false;
      if (response.success) {
        itemSets = response.sets;
        loadRoomItemSet();
      }
    });
  }

  function loadRoomItemSet() {
    if (!$socket || !isHost) return;
    $socket.emit('get_game_settings', roomCode, GameType.PRICE_IS_RIGHT, (response: any) => {
      if (response.success && response.settings?.customItemSetId) {
        selectedItemSet = response.settings.customItemSetId;
        loadItemsForSet(selectedItemSet);
      } else {
        selectedItemSet = null;
        currentItems = [];
      }
    });
  }

  function loadItemsForSet(setId: string | null) {
    if (!$socket || !isHost || !setId) {
      currentItems = [];
      return;
    }
    loadingItems = true;
    $socket.emit('get_items_for_set', setId, (response: any) => {
      loadingItems = false;
      if (response.success) {
        currentItems = response.items;
      }
    });
  }

  function createItemSet() {
    if (!$socket || !isHost || !newItemSetName.trim()) return;
    creatingItemSet = true;
    $socket.emit(
      'create_item_set',
      newItemSetName.trim(),
      newItemSetDescription.trim() || undefined,
      (response: any) => {
        creatingItemSet = false;
        if (response.success) {
          newItemSetName = '';
          newItemSetDescription = '';
          
          // Close the dialog
          const dialog = document.getElementById('create-item-set-dialog');
          if (dialog instanceof HTMLDialogElement) dialog.close();
          
          // Reload item sets list to refresh selection
          loadItemSets();
          
          // Set the newly created set as selected after reload
          setTimeout(() => {
            selectedItemSet = response.set.id;
            loadItemsForSet(response.set.id);
            saveRoomItemSet(response.set.id);
          }, 100);
          
          showMessage(t('priceTab.success.setCreated'));
        } else {
          alert(response.error || t('priceTab.errors.failedCreateSet'));
        }
      }
    );
  }

  function saveRoomItemSet(setId: string | null) {
    if (!$socket || !isHost) return;
    $socket.emit('set_room_item_set', roomCode, setId, () => {});
  }

  function onItemSetChange(setId: string | null) {
    selectedItemSet = setId;
    if (setId) {
      loadItemsForSet(setId);
      saveRoomItemSet(setId);
    } else {
      currentItems = [];
      saveRoomItemSet(null);
    }
  }

  function addItem() {
    if (!$socket || !isHost || !selectedItemSet) {
      alert(t('priceTab.errors.selectSetFirst'));
      return;
    }
    if (!newItem.name.trim() || !newItem.imageUrl.trim() || newItem.price <= 0) {
      alert(t('priceTab.errors.fillRequiredFields'));
      return;
    }
    const item = {
      ...newItem,
      translations: {
        en: {
          name: newItem.name.trim(),
          description: newItem.description.trim() || '',
        },
        ...(newItem.nameFr.trim() || newItem.descriptionFr.trim() ? {
          fr: {
            name: newItem.nameFr.trim() || newItem.name.trim(),
            description: newItem.descriptionFr.trim() || newItem.description.trim() || '',
          }
        } : {}),
      },
    };
    addingItem = true;
    $socket.emit('add_item_to_set', selectedItemSet, item, (response: any) => {
      addingItem = false;
      if (response.success) {
        currentItems.push(response.item);
        newItem = { name: '', nameFr: '', description: '', descriptionFr: '', price: 0, imageUrl: '', category: '' };
        showMessage(t('priceTab.success.itemAdded'));
      } else {
        alert(response.error || t('priceTab.errors.failedAddItem'));
      }
    });
  }

  function deleteItem(itemId: string) {
    if (!$socket || !isHost || !confirm(t('priceTab.confirm.deleteItem'))) return;
    $socket.emit('delete_item', itemId, (response: any) => {
      if (response.success) {
        currentItems = currentItems.filter((i) => i.id !== itemId);
        showMessage(t('priceTab.success.itemDeleted'));
      } else {
        alert(response.error || t('priceTab.errors.failedDeleteItem'));
      }
    });
  }

  function deleteItemSet(setId: string) {
    if (!$socket || !isHost || !confirm(t('priceTab.confirm.deleteSet'))) return;
    $socket.emit('delete_item_set', setId, (response: any) => {
      if (response.success) {
        itemSets = itemSets.filter((s) => s.id !== setId);
        if (selectedItemSet === setId) {
          selectedItemSet = null;
          currentItems = [];
          saveRoomItemSet(null);
        }
        showMessage(t('priceTab.success.setDeleted'));
      } else {
        alert(response.error || t('priceTab.errors.failedDeleteSet'));
      }
    });
  }

  function handleImageUpload(event: CustomEvent<{ imageUrl: string }>) {
    newItem.imageUrl = event.detail.imageUrl;
  }

  // Naughty or Nice functions
  function loadPromptSets() {
    if (!$socket || !isHost) return;
    loadingPromptSets = true;
    $socket.emit('list_prompt_sets', (response: any) => {
      loadingPromptSets = false;
      if (response.success) {
        promptSets = response.sets;
        loadRoomPromptSet();
      }
    });
  }

  function loadRoomPromptSet() {
    if (!$socket || !isHost) return;
    $socket.emit('get_game_settings', roomCode, GameType.NAUGHTY_OR_NICE, (response: any) => {
      if (response.success && response.settings?.customPromptSetId) {
        selectedPromptSet = response.settings.customPromptSetId;
        loadPromptsForSet(selectedPromptSet);
      } else {
        selectedPromptSet = null;
        currentPrompts = [];
      }
    });
  }

  function loadPromptsForSet(setId: string | null) {
    if (!$socket || !isHost || !setId) {
      currentPrompts = [];
      return;
    }
    loadingPrompts = true;
    $socket.emit('get_prompts_for_set', setId, (response: any) => {
      loadingPrompts = false;
      if (response.success) {
        currentPrompts = response.prompts;
      }
    });
  }

  function createPromptSet() {
    if (!$socket || !isHost || !newPromptSetName.trim()) return;
    creatingPromptSet = true;
    $socket.emit(
      'create_prompt_set',
      newPromptSetName.trim(),
      newPromptSetDescription.trim() || undefined,
      (response: any) => {
        creatingPromptSet = false;
        if (response.success) {
          newPromptSetName = '';
          newPromptSetDescription = '';
          
          // Close the dialog
          const dialog = document.getElementById('create-prompt-set-dialog');
          if (dialog instanceof HTMLDialogElement) dialog.close();
          
          // Reload prompt sets list to refresh selection
          loadPromptSets();
          
          // Set the newly created set as selected after reload
          setTimeout(() => {
            selectedPromptSet = response.set.id;
            loadPromptsForSet(response.set.id);
            saveRoomPromptSet(response.set.id);
          }, 100);
          
          showMessage(t('naughtyTab.success.setCreated'));
        } else {
          alert(response.error || t('naughtyTab.errors.failedCreateSet'));
        }
      }
    );
  }

  function saveRoomPromptSet(setId: string | null) {
    if (!$socket || !isHost) return;
    $socket.emit('set_room_prompt_set', roomCode, setId, () => {});
  }

  function onPromptSetChange(setId: string | null) {
    selectedPromptSet = setId;
    if (setId) {
      loadPromptsForSet(setId);
      saveRoomPromptSet(setId);
    } else {
      currentPrompts = [];
      saveRoomPromptSet(null);
    }
  }

  function addPrompt() {
    if (!$socket || !isHost || !selectedPromptSet) {
      alert(t('naughtyTab.errors.selectSetFirst'));
      return;
    }
    if (!newPrompt.prompt.trim()) {
      alert(t('naughtyTab.errors.enterPrompt'));
      return;
    }
    const prompt = {
      ...newPrompt,
      translations: {
        en: {
          prompt: newPrompt.prompt.trim(),
        },
        ...(newPrompt.promptFr.trim() ? {
          fr: {
            prompt: newPrompt.promptFr.trim(),
          }
        } : {}),
      },
    };
    addingPrompt = true;
    $socket.emit('add_prompt_to_set', selectedPromptSet, prompt, (response: any) => {
      addingPrompt = false;
      if (response.success) {
        currentPrompts.push(response.prompt);
        newPrompt = { prompt: '', promptFr: '', category: '', contentRating: 'pg' };
        showMessage(t('naughtyTab.success.promptAdded'));
      } else {
        alert(response.error || t('naughtyTab.errors.failedAddPrompt'));
      }
    });
  }

  function deletePrompt(promptId: string) {
    if (!$socket || !isHost || !confirm(t('naughtyTab.confirm.deletePrompt'))) return;
    $socket.emit('delete_prompt', promptId, (response: any) => {
      if (response.success) {
        currentPrompts = currentPrompts.filter((p) => p.id !== promptId);
        showMessage(t('naughtyTab.success.promptDeleted'));
      } else {
        alert(response.error || t('naughtyTab.errors.failedDeletePrompt'));
      }
    });
  }

  function deletePromptSet(setId: string) {
    if (!$socket || !isHost || !confirm(t('naughtyTab.confirm.deleteSet'))) return;
    $socket.emit('delete_prompt_set', setId, (response: any) => {
      if (response.success) {
        promptSets = promptSets.filter((s) => s.id !== setId);
        if (selectedPromptSet === setId) {
          selectedPromptSet = null;
          currentPrompts = [];
          saveRoomPromptSet(null);
        }
        showMessage(t('naughtyTab.success.setDeleted'));
      } else {
        alert(response.error || t('naughtyTab.errors.failedDeleteSet'));
      }
    });
  }

  function saveTimeSetting(gameType: GameType, settingKey: string, value: number) {
    if (!$socket || !isHost) return;
    $socket.emit(
      'update_game_time_settings',
      roomCode,
      gameType,
      { [settingKey]: value },
      (response: any) => {
        if (response.success) {
          showMessage(t('settings.timeSettingSaved'));
        } else {
          alert(response.error || t('settings.errors.failedSaveTime'));
        }
      }
    );
  }

  async function saveGeneralSettings() {
    if (!$socket || !isHost) return;
    loadingSettings = true;
    
    // Load theme if not already loaded
    let currentTheme = get(roomTheme);
    if (!currentTheme) {
      // Try to load theme first
      currentTheme = await loadRoomTheme(roomCode);
      if (!currentTheme) {
        loadingSettings = false;
        alert(t('settings.errors.themeNotLoaded'));
        return;
      }
    }
    
    const themeUpdates: any = {
      backgroundMusic: currentTheme.backgroundMusic ?? true,
      snowEffect: currentTheme.snowEffect ?? true,
      sparkles: currentTheme.sparkles ?? true,
      icicles: currentTheme.icicles ?? false,
      frostPattern: currentTheme.frostPattern ?? true,
      colorScheme: currentTheme.colorScheme ?? 'mixed',
      language: currentTheme.language ?? $language ?? 'en',
    };
    
    updateRoomTheme(roomCode, themeUpdates).then((success) => {
      loadingSettings = false;
      if (success) {
        console.log('[Settings] Theme saved successfully');
        showMessage(t('settings.saved'));
      } else {
        console.error('[Settings] Save failed: updateRoomTheme returned false');
        alert(t('settings.errors.failedSave'));
      }
    }).catch((error) => {
      loadingSettings = false;
      console.error('[Settings] Save error:', error);
      alert(t('settings.errors.failedSave') + ': ' + (error?.message || 'Unknown error'));
    });
  }

  // Load item sets and prompt sets when switching to those tabs
  $: if (activeTab === 'price' && isHost && itemSets.length === 0) {
    loadItemSets();
  }
  $: if (activeTab === 'naughty' && isHost && promptSets.length === 0) {
    loadPromptSets();
  }
</script>

<svelte:head>
  <title>{t('settings.title')} - {roomCode} | {t('home.title')}</title>
</svelte:head>

<div class="min-h-screen p-4 md:p-8">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-5xl font-bold text-christmas-gold mb-2">⚙️ {t('settings.title')}</h1>
        <p class="text-xl text-white/70">{t('room.room')}: <span class="font-mono text-christmas-gold">{roomCode}</span></p>
      </div>
      <a href="/room/{roomCode}" class="btn-secondary text-lg px-6 py-3">
        ← {t('settings.backToRoom')}
      </a>
    </div>

    {#if !isHost}
      <div class="card text-center p-8">
        <p class="text-xl text-white/70">{t('settings.hostOnly')}</p>
        <a href="/room/{roomCode}" class="btn-primary mt-4 inline-block">{t('settings.goToRoom')}</a>
      </div>
    {:else}
      <!-- Tab Navigation -->
      <div class="card">
        <div class="tabs-container">
          <div class="tabs-nav" role="tablist">
            <button
              role="tab"
              class="tab-btn"
              class:active={activeTab === 'room'}
              on:click={() => setActiveTab('room')}
            >
              🏠 {t('settings.room')}
            </button>
            <button
              role="tab"
              class="tab-btn"
              class:active={activeTab === 'trivia'}
              on:click={() => setActiveTab('trivia')}
            >
              ❓ {t('settings.trivia')}
            </button>
            <button
              role="tab"
              class="tab-btn"
              class:active={activeTab === 'price'}
              on:click={() => setActiveTab('price')}
            >
              💰 {t('settings.price')}
            </button>
            <button
              role="tab"
              class="tab-btn"
              class:active={activeTab === 'naughty'}
              on:click={() => setActiveTab('naughty')}
            >
              😇 {t('settings.naughty')}
            </button>
            <button
              role="tab"
              class="tab-btn"
              class:active={activeTab === 'emoji'}
              on:click={() => setActiveTab('emoji')}
            >
              🎶 {t('settings.emoji')}
            </button>
            <button
              role="tab"
              class="tab-btn"
              class:active={activeTab === 'general'}
              on:click={() => setActiveTab('general')}
            >
              ⚙️ {t('settings.general')}
            </button>
          </div>

          <!-- Tab Content -->
          <div class="tab-content">
            {#if activeTab === 'room'}
              <RoomSettingsTab
                {roomName}
                {roomDescription}
                {loadingSettings}
                {saveRoomSettings}
              />
            {/if}

            {#if activeTab === 'trivia'}
              <TriviaTab
                {triviaTimePerQuestion}
                {questionSets}
                {selectedQuestionSet}
                {currentQuestions}
                {loadingQuestions}
                {addingQuestion}
                {updatingQuestion}
                editingQuestion={editingQuestion}
                {newQuestion}
                {onQuestionSetChange}
                {openCreateSetDialog}
                {addQuestion}
                startEditingQuestion={startEditingQuestion}
                updateQuestion={updateQuestion}
                cancelEditing={cancelEditing}
                {deleteQuestion}
                {deleteQuestionSet}
                {saveTimeSetting}
              />
            {/if}

            {#if activeTab === 'price'}
              <PriceIsRightTab
                {priceTimePerRound}
                {itemSets}
                {selectedItemSet}
                {currentItems}
                {loadingItems}
                {addingItem}
                {newItem}
                {newItemSetName}
                {newItemSetDescription}
                {onItemSetChange}
                {addItem}
                {deleteItem}
                {deleteItemSet}
                {handleImageUpload}
                {saveTimeSetting}
              />
            {/if}

            {#if activeTab === 'naughty'}
              <NaughtyOrNiceTab
                {naughtyTimePerRound}
                {promptSets}
                {selectedPromptSet}
                {currentPrompts}
                {loadingPrompts}
                {addingPrompt}
                {newPrompt}
                {newPromptSetName}
                {newPromptSetDescription}
                {onPromptSetChange}
                {addPrompt}
                {deletePrompt}
                {deletePromptSet}
                {saveTimeSetting}
              />
            {/if}

            {#if activeTab === 'emoji'}
              <EmojiCarolTab {emojiTimePerRound} {saveTimeSetting} />
            {/if}

            {#if activeTab === 'general'}
              <GeneralSettingsTab
                {backgroundMusic}
                {snowEffect}
                {loadingSettings}
                {saveGeneralSettings}
              />
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Create Set Dialogs -->
<CreateSetDialog
  dialogId="create-set-dialog"
  title={t('triviaTab.createNewSet')}
  bind:setName={newSetName}
  bind:setDescription={newSetDescription}
  creating={creatingSet}
  onCreate={createQuestionSet}
/>

<CreateSetDialog
  dialogId="create-item-set-dialog"
  title={t('priceTab.createNewSet')}
  bind:setName={newItemSetName}
  bind:setDescription={newItemSetDescription}
  creating={creatingItemSet}
  onCreate={createItemSet}
/>

<CreateSetDialog
  dialogId="create-prompt-set-dialog"
  title={t('naughtyTab.createNewSet')}
  bind:setName={newPromptSetName}
  bind:setDescription={newPromptSetDescription}
  creating={creatingPromptSet}
  onCreate={createPromptSet}
/>

<style>
  .tabs-container {
    width: 100%;
  }

  .tabs-nav {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
    margin-bottom: 1.5rem;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .tabs-nav::-webkit-scrollbar {
    height: 4px;
  }

  .tabs-nav::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }

  .tabs-nav::-webkit-scrollbar-thumb {
    background: rgba(255, 215, 0, 0.5);
    border-radius: 2px;
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    transition: all 0.3s ease;
    position: relative;
    border-radius: 0.5rem 0.5rem 0 0;
  }

  .tab-btn:hover {
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
  }

  .tab-btn.active {
    color: #ffd700;
    border-bottom-color: #ffd700;
    font-weight: 700;
    background: rgba(255, 215, 0, 0.15);
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }

  .tab-btn.active::before {
    content: '';
    position: absolute;
    bottom: -3px;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, #ffd700, transparent);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
  }

  .tab-content {
    min-height: 300px;
  }

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
</style>

