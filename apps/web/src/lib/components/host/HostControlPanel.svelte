<script lang="ts">
  import { socket, players, gameState } from '$lib/socket';
  import { GameState, PlayerStatus, GameType } from '@christmas/core';
  import SessionLeaderboard from '$lib/components/SessionLeaderboard.svelte';
  import GlobalLeaderboard from '$lib/components/GlobalLeaderboard.svelte';
  import GameSettingsModal from '$lib/components/room/GameSettingsModal.svelte';
  import Jukebox from '$lib/components/room/Jukebox.svelte';
  import TriviaTab from '$lib/components/room/TriviaTab.svelte';
  import PriceIsRightTab from '$lib/components/room/PriceIsRightTab.svelte';
  import GeneralSettingsTab from '$lib/components/room/GeneralSettingsTab.svelte';
  import CreateSetDialog from '$lib/components/room/CreateSetDialog.svelte';
  import { t, language } from '$lib/i18n';
  import { playSound, playSoundOnce } from '$lib/audio';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { roomTheme, loadRoomTheme, updateRoomTheme, applyRoomTheme } from '$lib/theme';

  export let controlPanelOpen: boolean = false;
  export let roomCode: string;
  export let origin: string;
  export let currentState: GameState | null | undefined;
  export let isPaused: boolean = false;
  export let round: number = 0;
  export let maxRounds: number = 0;
  export let leaderboardTab: 'session' | 'global' = 'session';
  export let showConfirmation: (message: string, action: () => void) => void;

  $: isGameActive = currentState === GameState.PLAYING || currentState === GameState.STARTING || currentState === GameState.ROUND_END;
  $: canPause = isGameActive && !isPaused;
  $: canResume = isPaused;

  // Make translations reactive by subscribing to language changes
  // Include $language in each reactive statement so Svelte knows to re-run when language changes
  $: controlPanelText = $language && t('host.controlPanel');
  $: gameControlsText = $language && t('host.gameControls');
  $: endGameText = $language && t('host.endGame');
  $: pauseText = $language && t('host.pause');
  $: resumeText = $language && t('host.resume');
  $: startNewGameText = $language && t('host.startNewGame');
  $: returnToLobbyText = $language && t('host.returnToLobby');
  $: playersText = $language && t('host.players');
  $: scoreLabel = $language && t('common.label.score');
  $: removePlayerTitleText = $language && t('host.removePlayerTitle');
  $: hostLabel = $language && t('common.label.host');
  $: roomManagementText = $language && t('host.roomManagement');
  $: copyRoomCodeText = $language && t('host.copyRoomCode');
  $: roomCodeLabel = $language && t('common.label.roomCode');
  $: joinUrlText = $language && t('host.joinUrl');
  $: gameStatusText = $language && t('host.gameStatus');
  $: stateLabel = $language && t('host.state');
  $: pausedIndicatorText = $language && t('host.gameState.paused');
  $: roundLabel = $language && t('common.label.round');
  $: leaderboardsText = $language && t('host.leaderboards');
  $: sessionLeaderboardText = $language && t('host.leaderboard.session');
  $: globalLeaderboardText = $language && t('host.leaderboard.global');
  $: gameSettingsText = $language && t('host.gameSettings');
  $: viewSettingsText = $language && t('host.viewSettings');
  $: editSettingsText = $language && t('host.editSettings');
  $: noGameActiveText = $language && (t('host.noGameActive') || 'No game active');
  
  // Reactive game state text - depends on both currentState and $language
  $: gameStateText = $language && (currentState
    ? t(`host.gameState.${String(currentState).toLowerCase()}`)
    : t('host.gameState.lobby'));
  
  // Reactive round text - depends on round, maxRounds, and $language
  $: roundText = $language && t('host.round', { round, maxRounds });

  // Game settings modal state
  let showSettingsModal = false;
  let currentGameType: GameType | null = null;

  // Get current game type from gameState
  $: currentGameType = $gameState?.gameType || null;
  $: hasActiveGame = currentGameType !== null && currentState !== GameState.LOBBY && currentState !== GameState.GAME_END;

  // Content & Theme tabs
  type ContentTabType = 'trivia' | 'price' | 'theme';
  let activeContentTab: ContentTabType = 'trivia';
  $: contentThemeText = $language && (t('host.contentTheme') || 'Content & Theme');
  $: triviaTabText = $language && (t('host.triviaTab') || 'Trivia');
  $: priceTabText = $language && (t('host.priceTab') || 'Price');
  $: themeTabText = $language && (t('host.themeTab') || 'Theme');

  // Trivia Questions state
  let questionSets: Array<{ id: string; name: string; description?: string; questionCount: number }> = [];
  let selectedQuestionSet: string | null = null;
  let currentQuestions: Array<{ id: string; question: string; answers: string[]; correctIndex: number; difficulty: string; category?: string }> = [];
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
  let triviaTimePerQuestion = 15;

  // Price Is Right state
  let itemSets: Array<{ id: string; name: string; description?: string; itemCount: number }> = [];
  let selectedItemSet: string | null = null;
  let currentItems: Array<{ id: string; name: string; description: string; price: number; imageUrl: string; category: string }> = [];
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

  // Theme settings state
  let backgroundMusic = true;
  let snowEffect = true;
  let loadingSettings = false;

  function toggleControlPanel() {
    controlPanelOpen = !controlPanelOpen;
  }

  function endGame() {
    if (!$socket) {
      alert(t('host.errors.noConnection') || 'Not connected to server');
      return;
    }
    showConfirmation(t('host.confirmEndGame'), () => {
      ($socket as any).emit('end_game', (response: any) => {
        if (response && response.success) {
          playSoundOnce('gameEnd', 1000);
          setTimeout(() => {
            // Always redirect to controller page
            goto(`/room/${roomCode}/control`);
          }, 1000);
        } else {
          const errorMsg = response?.error || t('host.errors.failedEndGame') || 'Failed to end game';
          alert(errorMsg);
          console.error('[HostControlPanel] Failed to end game:', response);
        }
      });
    });
  }

  function pauseGame() {
    if (!$socket || !canPause) return;
    $socket.emit('pause_game');
    isPaused = true;
    playSound('click');
  }

  function resumeGame() {
    if (!$socket || !canResume) return;
    $socket.emit('resume_game');
    isPaused = false;
    playSound('click');
  }

  function startNewGame() {
    // Clear gameState before navigating to prevent old state from persisting
    gameState.set({
      state: GameState.LOBBY,
      gameType: null,
      round: 0,
      maxRounds: 0,
      startedAt: 0,
      scores: {},
      scoreboard: [],
    });
    // Always redirect to controller page
    goto(`/room/${roomCode}/control`);
  }

  function returnToLobby() {
    // Always redirect to controller page
    goto(`/room/${roomCode}/control`);
  }

  function kickPlayer(playerId: string, playerName: string) {
    if (!$socket) return;
    showConfirmation(t('host.removePlayer', { name: playerName }), () => {
      ($socket as any).emit('kick_player', playerId, (response: any) => {
        if (response.success) {
          playSound('click');
        } else {
          alert(response.error || t('host.failedRemovePlayer'));
        }
      });
    });
  }

  function copyRoomCode() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(roomCode);
      playSound('click');
      alert(t('host.roomCodeCopied'));
    }
  }

  function openSettingsModal() {
    if (currentGameType) {
      showSettingsModal = true;
      playSound('click');
    }
  }

  function handleSettingsClose() {
    showSettingsModal = false;
  }

  function handleSettingsStart(settings: any) {
    // This is for starting a new game with settings
    // If a game is already active, we'd need to restart it
    if (currentGameType && $socket) {
      if (hasActiveGame) {
        // Show warning that changing settings requires restarting
        showConfirmation(
          t('host.confirmRestartGame') || 'Changing settings will restart the current game. Continue?',
          () => {
            // End current game first, then start new one
            ($socket as any).emit('end_game', (endResponse: any) => {
              if (endResponse && endResponse.success) {
                // Start new game with settings
                ($socket as any).emit('start_game', currentGameType, settings, (startResponse: any) => {
                  if (startResponse && startResponse.success) {
                    showSettingsModal = false;
                    playSound('click');
                  } else {
                    const errorMsg = startResponse?.error || 'Failed to start game';
                    alert(errorMsg);
                    console.error('[HostControlPanel] Failed to start game:', startResponse);
                  }
                });
              } else {
                alert(endResponse?.error || 'Failed to end current game');
              }
            });
          }
        );
      } else {
        // No active game, just start with settings
        ($socket as any).emit('start_game', currentGameType, settings, (response: any) => {
          if (response && response.success) {
            showSettingsModal = false;
            playSound('click');
          } else {
            const errorMsg = response?.error || 'Failed to start game';
            alert(errorMsg);
            console.error('[HostControlPanel] Failed to start game:', response);
          }
        });
      }
    }
  }

  // Content & Theme Management Functions
  function showMessage(message: string) {
    const msgEl = document.createElement('div');
    msgEl.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg z-50';
    msgEl.textContent = message;
    document.body.appendChild(msgEl);
    setTimeout(() => {
      msgEl.remove();
    }, 3000);
  }

  // Trivia Questions Functions
  function loadQuestionSets() {
    if (!$socket) return;
    loadingSets = true;
    $socket.emit('list_question_sets', (response: any) => {
      loadingSets = false;
      if (response?.success) {
        questionSets = response.sets || [];
        loadRoomQuestionSet();
      }
    });
  }

  function loadRoomQuestionSet() {
    if (!$socket) return;
    $socket.emit('get_game_settings', roomCode, GameType.TRIVIA_ROYALE, (response: any) => {
      if (response?.success && response.settings?.customQuestionSetId) {
        selectedQuestionSet = response.settings.customQuestionSetId;
        loadQuestionsForSet(selectedQuestionSet);
      } else {
        selectedQuestionSet = null;
        currentQuestions = [];
      }
      if (response?.success && response.settings?.timePerQuestion) {
        triviaTimePerQuestion = response.settings.timePerQuestion;
      }
    });
  }

  function loadQuestionsForSet(setId: string | null) {
    if (!$socket || !setId) {
      currentQuestions = [];
      return;
    }
    loadingQuestions = true;
    $socket.emit('get_questions_for_set', setId, (response: any) => {
      loadingQuestions = false;
      if (response?.success) {
        currentQuestions = response.questions || [];
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
    if (!$socket) return;
    $socket.emit('set_room_question_set', roomCode, setId, () => {});
  }

  function createQuestionSet() {
    if (!$socket || !newSetName.trim()) return;
    creatingSet = true;
    $socket.emit(
      'create_question_set',
      newSetName.trim(),
      newSetDescription.trim() || undefined,
      (response: any) => {
        creatingSet = false;
        if (response?.success) {
          newSetName = '';
          newSetDescription = '';
          
          // Close the dialog
          if (typeof document !== 'undefined') {
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
          
          showMessage(t('triviaTab.success.setCreated') || 'Question set created!');
        } else {
          alert(response?.error || t('triviaTab.errors.failedCreateSet') || 'Failed to create set');
        }
      }
    );
  }

  function openCreateSetDialog() {
    newSetName = '';
    newSetDescription = '';
    creatingSet = false;
    if (typeof document !== 'undefined') {
      const dialog = document.getElementById('create-set-dialog');
      if (dialog instanceof HTMLDialogElement) {
        dialog.showModal();
      }
    }
  }

  function addQuestion() {
    if (!$socket || !selectedQuestionSet) {
      alert(t('triviaTab.errors.selectSetFirst') || 'Please select a question set first');
      return;
    }
    if (!newQuestion.question.trim() || newQuestion.answers.filter((a) => a.trim()).length < 2) {
      alert(t('triviaTab.errors.fillQuestionAndAnswers') || 'Please fill in question and at least 2 answers');
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
      if (response?.success) {
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
        showMessage(t('triviaTab.success.questionAdded') || 'Question added!');
      } else {
        alert(response?.error || t('triviaTab.errors.failedAddQuestion') || 'Failed to add question');
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
    if (!$socket || !editingQuestion) return;
    if (!editingQuestion.question.trim() || editingQuestion.answers.filter((a) => a.trim()).length < 2) {
      alert(t('triviaTab.errors.fillQuestionAndAnswers') || 'Please fill in question and at least 2 answers');
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
      if (response?.success) {
        const index = currentQuestions.findIndex((q) => q.id === editingQuestion!.id);
        if (index !== -1) {
          currentQuestions[index] = response.question;
        }
        editingQuestion = null;
        showMessage(t('triviaTab.success.questionUpdated') || 'Question updated!');
      } else {
        alert(response?.error || t('triviaTab.errors.failedUpdateQuestion') || 'Failed to update question');
      }
    });
  }

  function deleteQuestion(questionId: string) {
    if (!$socket || !confirm(t('triviaTab.confirm.deleteQuestion') || 'Delete this question?')) return;
    $socket.emit('delete_custom_question', questionId, (response: any) => {
      if (response?.success) {
        currentQuestions = currentQuestions.filter((q) => q.id !== questionId);
        if (editingQuestion?.id === questionId) {
          editingQuestion = null;
        }
        showMessage(t('triviaTab.success.questionDeleted') || 'Question deleted!');
        if (selectedQuestionSet) {
          loadQuestionsForSet(selectedQuestionSet);
        }
      } else {
        alert(response?.error || t('triviaTab.errors.failedDeleteQuestion') || 'Failed to delete question');
      }
    });
  }

  function deleteQuestionSet(setId: string) {
    if (!$socket || !confirm(t('triviaTab.confirm.deleteSet') || 'Delete this question set?')) return;
    $socket.emit('delete_question_set', setId, (response: any) => {
      if (response?.success) {
        questionSets = questionSets.filter((s) => s.id !== setId);
        if (selectedQuestionSet === setId) {
          selectedQuestionSet = null;
          currentQuestions = [];
          saveRoomQuestionSet(null);
        }
        showMessage(t('triviaTab.success.setDeleted') || 'Set deleted!');
      } else {
        alert(response?.error || t('triviaTab.errors.failedDeleteSet') || 'Failed to delete set');
      }
    });
  }

  function saveTimeSetting(gameType: GameType, setting: string, value: number) {
    if (!$socket) return;
    $socket.emit(
      'update_game_time_settings',
      roomCode,
      gameType,
      { [setting]: value },
      (response: any) => {
        if (response?.success) {
          showMessage(t('settings.timeSettingSaved') || 'Time setting saved');
        } else {
          alert(response?.error || t('settings.errors.failedSaveTime') || 'Failed to save time setting');
        }
      }
    );
  }

  // Price Is Right Functions
  function loadItemSets() {
    if (!$socket) return;
    loadingItemSets = true;
    $socket.emit('list_item_sets', (response: any) => {
      loadingItemSets = false;
      if (response?.success) {
        itemSets = response.sets || [];
        loadRoomItemSet();
      }
    });
  }

  function loadRoomItemSet() {
    if (!$socket) return;
    $socket.emit('get_game_settings', roomCode, GameType.PRICE_IS_RIGHT, (response: any) => {
      if (response?.success && response.settings?.customItemSetId) {
        selectedItemSet = response.settings.customItemSetId;
        loadItemsForSet(selectedItemSet);
      } else {
        selectedItemSet = null;
        currentItems = [];
      }
      if (response?.success && response.settings?.timeLimit) {
        priceTimePerRound = response.settings.timeLimit;
      }
    });
  }

  function loadItemsForSet(setId: string | null) {
    if (!$socket || !setId) {
      currentItems = [];
      return;
    }
    loadingItems = true;
    $socket.emit('get_items_for_set', setId, (response: any) => {
      loadingItems = false;
      if (response?.success) {
        currentItems = response.items || [];
      } else {
        currentItems = [];
      }
    });
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

  function saveRoomItemSet(setId: string | null) {
    if (!$socket) return;
    $socket.emit('set_room_item_set', roomCode, setId, () => {});
  }

  function createItemSet() {
    if (!$socket || !newItemSetName.trim()) return;
    creatingItemSet = true;
    $socket.emit(
      'create_item_set',
      newItemSetName.trim(),
      newItemSetDescription.trim() || undefined,
      (response: any) => {
        creatingItemSet = false;
        if (response?.success) {
          newItemSetName = '';
          newItemSetDescription = '';
          
          // Close the dialog
          if (typeof document !== 'undefined') {
            const dialog = document.getElementById('create-item-set-dialog');
            if (dialog instanceof HTMLDialogElement) {
              dialog.close();
            }
          }
          
          // Reload item sets list to refresh selection
          loadItemSets();
          
          // Set the newly created set as selected after reload
          setTimeout(() => {
            selectedItemSet = response.set.id;
            loadItemsForSet(response.set.id);
            saveRoomItemSet(response.set.id);
          }, 100);
          
          showMessage(t('priceTab.success.setCreated') || 'Item set created!');
        } else {
          alert(response?.error || t('priceTab.errors.failedCreateSet') || 'Failed to create set');
        }
      }
    );
  }

  function openCreateItemSetDialog() {
    newItemSetName = '';
    newItemSetDescription = '';
    creatingItemSet = false;
  }

  function addItem() {
    if (!$socket || !selectedItemSet) {
      alert(t('priceTab.errors.selectSetFirst') || 'Please select an item set first');
      return;
    }
    if (!newItem.name.trim() || !newItem.imageUrl.trim() || newItem.price <= 0) {
      alert(t('priceTab.errors.fillRequiredFields') || 'Please fill in name, image URL, and price');
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
      if (response?.success) {
        currentItems.push(response.item);
        newItem = { name: '', nameFr: '', description: '', descriptionFr: '', price: 0, imageUrl: '', category: '' };
        showMessage(t('priceTab.success.itemAdded') || 'Item added!');
      } else {
        alert(response?.error || t('priceTab.errors.failedAddItem') || 'Failed to add item');
      }
    });
  }

  function deleteItem(itemId: string) {
    if (!$socket || !confirm(t('priceTab.confirm.deleteItem') || 'Delete this item?')) return;
    $socket.emit('delete_item', itemId, (response: any) => {
      if (response?.success) {
        currentItems = currentItems.filter((i) => i.id !== itemId);
        showMessage(t('priceTab.success.itemDeleted') || 'Item deleted!');
      } else {
        alert(response?.error || t('priceTab.errors.failedDeleteItem') || 'Failed to delete item');
      }
    });
  }

  function deleteItemSet(setId: string) {
    if (!$socket || !confirm(t('priceTab.confirm.deleteSet') || 'Delete this item set?')) return;
    $socket.emit('delete_item_set', setId, (response: any) => {
      if (response?.success) {
        itemSets = itemSets.filter((s) => s.id !== setId);
        if (selectedItemSet === setId) {
          selectedItemSet = null;
          currentItems = [];
          saveRoomItemSet(null);
        }
        showMessage(t('priceTab.success.setDeleted') || 'Set deleted!');
      } else {
        alert(response?.error || t('priceTab.errors.failedDeleteSet') || 'Failed to delete set');
      }
    });
  }

  function handleImageUpload(event: CustomEvent<{ imageUrl: string }>) {
    newItem.imageUrl = event.detail.imageUrl;
  }

  // Theme Settings Functions
  async function saveGeneralSettings() {
    if (!$socket) return;
    loadingSettings = true;
    
    let currentTheme = get(roomTheme);
    if (!currentTheme) {
      currentTheme = await loadRoomTheme(roomCode);
      if (!currentTheme) {
        loadingSettings = false;
        alert(t('settings.errors.themeNotLoaded') || 'Theme not loaded');
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
        showMessage(t('settings.saved') || 'Settings saved!');
      } else {
        alert(t('settings.errors.failedSave') || 'Failed to save settings');
      }
    }).catch((error) => {
      loadingSettings = false;
      console.error('[HostControlPanel] Save error:', error);
      alert(t('settings.errors.failedSave') || 'Failed to save settings');
    });
  }

  // Sync theme from store
  $: {
    const theme = get(roomTheme);
    if (theme) {
      backgroundMusic = theme.backgroundMusic ?? true;
      snowEffect = theme.snowEffect ?? true;
    }
  }

  // Load data when switching tabs
  $: if (activeContentTab === 'trivia' && $socket && questionSets.length === 0) {
    loadQuestionSets();
  }
  $: if (activeContentTab === 'price' && $socket && itemSets.length === 0) {
    loadItemSets();
  }

  // Load theme on mount
  onMount(async () => {
    if ($socket) {
      await loadRoomTheme(roomCode);
    }
  });
</script>

<!-- Control Panel Toggle Button (Hamburger Menu) -->
<button
  on:click={toggleControlPanel}
  class="control-toggle"
  class:open={controlPanelOpen}
  title={controlPanelOpen ? 'Close Control Panel' : 'Open Control Panel'}
  aria-label={controlPanelOpen ? 'Close menu' : 'Open menu'}
>
  <span class="hamburger">
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
    <span class="hamburger-line"></span>
  </span>
</button>

<!-- Floating Control Panel -->
<div class="control-panel" class:open={controlPanelOpen}>
  <div class="panel-header">
    <h2>{controlPanelText}</h2>
    <button on:click={toggleControlPanel} class="close-btn">✕</button>
  </div>

  <div class="panel-content">
    <!-- Game Controls -->
    <div class="panel-section game-controls-section">
      <h3>🎮 {gameControlsText}</h3>
      <div class="button-group">
        {#if isGameActive}
          <button on:click={endGame} class="btn-danger btn-large">
            ⏹️ {endGameText}
          </button>
          {#if canPause}
            <button on:click={pauseGame} class="btn-secondary btn-large">
              ⏸️ {pauseText}
            </button>
          {:else if canResume}
            <button on:click={resumeGame} class="btn-primary btn-large">
              ▶️ {resumeText}
            </button>
          {/if}
        {:else if currentState === GameState.PAUSED}
          <button on:click={resumeGame} class="btn-primary btn-large">
            ▶️ {resumeText}
          </button>
          <button on:click={endGame} class="btn-danger btn-large">
            ⏹️ {endGameText}
          </button>
        {/if}
        {#if currentState === GameState.GAME_END}
          <button on:click={startNewGame} class="btn-primary btn-large">
            🚀 {startNewGameText}
          </button>
        {/if}
        <button on:click={returnToLobby} class="btn-secondary">
          🏠 {returnToLobbyText}
        </button>
      </div>
    </div>

    <!-- Player Management -->
    <div class="panel-section">
      <h3>👥 {playersText} ({$players.length})</h3>
      <div class="player-list">
        {#each $players as player}
          <div
            class="player-item"
            class:disconnected={player.status === PlayerStatus.DISCONNECTED}
          >
            <div class="player-info">
              <span class="player-avatar-small">{player.avatar}</span>
              <div class="player-details">
                <span class="player-name-small">
                  {player.name}
                  {#if player.status === PlayerStatus.DISCONNECTED}
                    <span class="disconnected-badge">🔴</span>
                  {/if}
                </span>
                <span class="player-score-small"
                  >{scoreLabel}: {player.score || 0}</span
                >
              </div>
            </div>
            {#if player.id !== $socket?.id}
              <button
                on:click={() => kickPlayer(player.id, player.name)}
                class="kick-btn"
                title={removePlayerTitleText}
              >
                🗑️
              </button>
            {:else}
              <span class="host-badge">{hostLabel}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Room Management -->
    <div class="panel-section">
      <h3>🏠 {roomManagementText}</h3>
      <div class="button-group">
        <button on:click={copyRoomCode} class="btn-secondary">
          📋 {copyRoomCodeText}
        </button>
      </div>
      <div class="room-info-panel">
        <p><strong>{roomCodeLabel}:</strong> <code>{roomCode}</code></p>
        <p><strong>{joinUrlText}:</strong></p>
        <code class="join-url">{origin}/join?code={roomCode}</code>
      </div>
    </div>

    <!-- Game State Indicator -->
    <div class="panel-section">
      <h3>📊 {gameStatusText}</h3>
      <div class="status-info">
        <p>
          <strong>{stateLabel}:</strong>
          {gameStateText}
        </p>
        {#if isPaused}
          <p class="paused-indicator">⏸️ {pausedIndicatorText}</p>
        {/if}
        {#if round > 0}
          <p>
            <strong>{roundLabel}:</strong>
            {roundText}
          </p>
        {/if}
      </div>
    </div>

    <!-- Game Settings -->
    <div class="panel-section">
      <h3>⚙️ {gameSettingsText}</h3>
      {#if hasActiveGame}
        <div class="settings-info">
          <p class="settings-current-game">
            <strong>{t('host.currentGame') || 'Current Game'}:</strong> {currentGameType || 'N/A'}
          </p>
          <p class="settings-warning">
            ⚠️ {t('host.settingsRestartWarning') || 'Changing settings will restart the current game.'}
          </p>
          <button on:click={openSettingsModal} class="btn-secondary">
            ✏️ {editSettingsText || 'Edit Settings'}
          </button>
        </div>
      {:else if currentGameType}
        <div class="settings-info">
          <p class="settings-current-game">
            <strong>{t('host.gameType') || 'Game Type'}:</strong> {currentGameType}
          </p>
          <button on:click={openSettingsModal} class="btn-secondary">
            ⚙️ {viewSettingsText || 'View Settings'}
          </button>
        </div>
      {:else}
        <div class="settings-info">
          <p class="settings-no-game">{noGameActiveText || 'No game active'}</p>
          <p class="settings-hint">{t('host.settingsHint') || 'Start a game from the lobby to configure settings.'}</p>
        </div>
      {/if}
    </div>

    <!-- Content & Theme -->
    <div class="panel-section content-theme-section">
      <h3>🎨 {contentThemeText}</h3>
      
      <!-- Tab Navigation -->
      <div class="content-tabs">
        <button
          class="content-tab-btn"
          class:active={activeContentTab === 'trivia'}
          on:click={() => activeContentTab = 'trivia'}
        >
          ❓ {triviaTabText}
        </button>
        <button
          class="content-tab-btn"
          class:active={activeContentTab === 'price'}
          on:click={() => activeContentTab = 'price'}
        >
          💰 {priceTabText}
        </button>
        <button
          class="content-tab-btn"
          class:active={activeContentTab === 'theme'}
          on:click={() => activeContentTab = 'theme'}
        >
          🎨 {themeTabText}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="content-tab-content">
        {#if activeContentTab === 'trivia'}
          <TriviaTab
            {triviaTimePerQuestion}
            {questionSets}
            {selectedQuestionSet}
            {currentQuestions}
            {loadingQuestions}
            {addingQuestion}
            {updatingQuestion}
            {editingQuestion}
            {newQuestion}
            onQuestionSetChange={onQuestionSetChange}
            openCreateSetDialog={openCreateSetDialog}
            {addQuestion}
            startEditingQuestion={startEditingQuestion}
            {updateQuestion}
            {cancelEditing}
            {deleteQuestion}
            {deleteQuestionSet}
            saveTimeSetting={saveTimeSetting}
          />
        {:else if activeContentTab === 'price'}
          <PriceIsRightTab
            {priceTimePerRound}
            {itemSets}
            {selectedItemSet}
            {currentItems}
            {loadingItems}
            {addingItem}
            {newItem}
            bind:newItemSetName
            bind:newItemSetDescription
            onItemSetChange={onItemSetChange}
            {addItem}
            {deleteItem}
            {deleteItemSet}
            handleImageUpload={handleImageUpload}
            saveTimeSetting={saveTimeSetting}
          />
        {:else if activeContentTab === 'theme'}
          <GeneralSettingsTab
            {backgroundMusic}
            {snowEffect}
            {loadingSettings}
            {roomCode}
            saveGeneralSettings={saveGeneralSettings}
          />
        {/if}
      </div>
    </div>

    <!-- Jukebox / Music -->
    <div class="panel-section jukebox-section">
      <h3>🎵 {t('jukebox.title') || 'Music'}</h3>
      <Jukebox {roomCode} isHost={true} />
    </div>

    <!-- Leaderboards -->
    <div class="panel-section">
      <h3>🏆 {leaderboardsText}</h3>
      <div class="leaderboard-tabs">
        <button
          on:click={() => (leaderboardTab = 'session')}
          class="tab-btn"
          class:active={leaderboardTab === 'session'}
        >
          {sessionLeaderboardText}
        </button>
        <button
          on:click={() => (leaderboardTab = 'global')}
          class="tab-btn"
          class:active={leaderboardTab === 'global'}
        >
          {globalLeaderboardText}
        </button>
      </div>
      {#if leaderboardTab === 'session'}
        <SessionLeaderboard {roomCode} />
      {:else}
        <GlobalLeaderboard {roomCode} />
      {/if}
    </div>
  </div>
</div>

<!-- Game Settings Modal -->
{#if currentGameType && showSettingsModal}
  <GameSettingsModal
    gameType={currentGameType}
    open={showSettingsModal}
    onClose={handleSettingsClose}
    onStart={handleSettingsStart}
  />
{/if}

<!-- Create Set Dialogs -->
<CreateSetDialog
  dialogId="create-set-dialog"
  title={t('triviaTab.createNewSet') || 'Create New Question Set'}
  bind:setName={newSetName}
  bind:setDescription={newSetDescription}
  creating={creatingSet}
  onCreate={createQuestionSet}
/>

<CreateSetDialog
  dialogId="create-item-set-dialog"
  title={t('priceTab.createNewSet') || 'Create New Item Set'}
  bind:setName={newItemSetName}
  bind:setDescription={newItemSetDescription}
  creating={creatingItemSet}
  onCreate={createItemSet}
/>

<style>
  /* Hamburger Menu Toggle Button */
  .control-toggle {
    position: fixed;
    top: calc(clamp(60px, 8vh, 70px) + 1rem);
    right: 1rem;
    z-index: 1001;
    width: 48px;
    height: 48px;
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid #ffd700;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .control-toggle:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(255, 215, 0, 0.4);
  }

  .hamburger {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 24px;
    height: 18px;
  }

  .hamburger-line {
    width: 100%;
    height: 3px;
    background: #ffd700;
    border-radius: 2px;
    transition: all 0.3s ease;
  }

  .control-toggle.open .hamburger-line:nth-child(1) {
    transform: translateY(7.5px) rotate(45deg);
  }

  .control-toggle.open .hamburger-line:nth-child(2) {
    opacity: 0;
  }

  .control-toggle.open .hamburger-line:nth-child(3) {
    transform: translateY(-7.5px) rotate(-45deg);
  }

  /* Control Panel */
  .control-panel {
    position: fixed;
    top: 0;
    right: 0;
    width: clamp(280px, 25vw, 400px);
    max-width: min(90vw, 400px);
    height: 100vh;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-left: 2px solid #ffd700;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .control-panel.open {
    transform: translateX(0);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 2px solid #ffd700;
    background: rgba(0, 0, 0, 0.3);
  }

  .panel-header h2 {
    margin: 0;
    font-size: clamp(1.125rem, 2vw, 1.5rem);
    color: #ffd700;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #ffd700;
    font-size: clamp(1.125rem, 2vw, 1.5rem);
    cursor: pointer;
    padding: 0.5rem;
    line-height: 1;
    transition: transform 0.2s;
  }

  .close-btn:hover {
    transform: rotate(90deg);
  }

  .panel-content {
    padding: clamp(1rem, 1.5vh, 1.5rem);
  }

  .panel-section {
    margin-bottom: clamp(1rem, 1.5vh, 1.5rem);
    padding-bottom: clamp(0.75rem, 1vh, 1rem);
    border-bottom: 1px solid rgba(255, 215, 0, 0.2);
  }

  .panel-section:last-child {
    border-bottom: none;
  }

  .panel-section h3 {
    margin: 0 0 clamp(0.5rem, 1vh, 0.75rem) 0;
    font-size: clamp(1rem, 1.3vw, 1.2rem);
    color: #ffd700;
  }

  .button-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .btn-large {
    padding: 1rem 1.5rem;
    font-size: 1.125rem;
    font-weight: bold;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .game-controls-section {
    background: rgba(255, 215, 0, 0.05);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .btn-primary {
    background: linear-gradient(135deg, #c41e3a 0%, #8b1538 100%);
    color: white;
  }

  .btn-primary:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(196, 30, 58, 0.4);
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateX(4px);
  }

  .btn-danger {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-danger:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  /* Player List */
  .player-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .player-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .player-item.disconnected {
    opacity: 0.5;
  }

  .player-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .player-avatar-small {
    font-size: clamp(1.25rem, 1.8vw, 1.5rem);
  }

  .player-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .player-name-small {
    font-weight: bold;
    color: white;
    font-size: clamp(0.875rem, 1.1vw, 1rem);
  }

  .player-score-small {
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    color: rgba(255, 255, 255, 0.7);
  }

  .disconnected-badge {
    margin-left: 0.5rem;
  }

  .kick-btn {
    background: rgba(220, 38, 38, 0.2);
    border: 1px solid rgba(220, 38, 38, 0.5);
    color: #ef4444;
    padding: 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .kick-btn:hover {
    background: rgba(220, 38, 38, 0.4);
    transform: scale(1.1);
  }

  .host-badge {
    background: rgba(255, 215, 0, 0.2);
    color: #ffd700;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: clamp(0.65rem, 0.9vw, 0.75rem);
    font-weight: bold;
  }

  /* Room Info */
  .room-info-panel {
    margin-top: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
  }

  .room-info-panel p {
    margin: 0.5rem 0;
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    color: rgba(255, 255, 255, 0.8);
  }

  .room-info-panel code {
    display: block;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    font-size: clamp(0.65rem, 0.9vw, 0.75rem);
    word-break: break-all;
    color: #ffd700;
  }

  .join-url {
    font-size: clamp(0.6rem, 0.8vw, 0.7rem) !important;
  }

  /* Status Info */
  .status-info p {
    margin: 0.5rem 0;
    color: rgba(255, 255, 255, 0.8);
  }

  .paused-indicator {
    color: #ffd700 !important;
    font-weight: bold;
  }

  /* Leaderboard Tabs */
  .leaderboard-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .tab-btn {
    flex: 1;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.2s;
  }

  .tab-btn.active {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
    color: #ffd700;
    font-weight: bold;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  /* Game Settings */
  .settings-info {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .settings-current-game {
    margin: 0;
    color: rgba(255, 255, 255, 0.8);
    font-size: clamp(0.875rem, 1.1vw, 1rem);
  }

  .settings-warning {
    margin: 0;
    color: #fbbf24;
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    font-style: italic;
  }

  .settings-no-game {
    margin: 0;
    color: rgba(255, 255, 255, 0.6);
    font-size: clamp(0.875rem, 1.1vw, 1rem);
    font-style: italic;
  }

  .settings-hint {
    margin: 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: clamp(0.75rem, 1vw, 0.875rem);
  }

  /* Content & Theme Section */
  .content-theme-section {
    overflow: visible;
  }

  .content-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 1rem;
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
    overflow-x: auto;
  }

  .content-tab-btn {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    font-weight: 500;
    white-space: nowrap;
    transition: all 0.3s ease;
    position: relative;
    min-width: 0;
  }

  .content-tab-btn:hover {
    color: rgba(255, 255, 255, 0.95);
    background: rgba(255, 255, 255, 0.1);
  }

  .content-tab-btn.active {
    color: #ffd700;
    border-bottom-color: #ffd700;
    font-weight: 700;
    background: rgba(255, 215, 0, 0.15);
  }

  .content-tab-content {
    max-height: 500px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .content-tab-content :global(.tab-panel) {
    padding: 0;
  }

  .content-tab-content :global(.tab-panel h3) {
    display: none;
  }

  /* Jukebox Section */
  .jukebox-section {
    overflow: visible;
  }

  .jukebox-section :global(.jukebox-container) {
    margin-top: 0.5rem;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .control-panel {
      width: 100vw;
      max-width: 100vw;
    }

    .control-toggle {
      top: 0.5rem;
      right: 0.5rem;
      width: 44px;
      height: 44px;
    }
  }
</style>

