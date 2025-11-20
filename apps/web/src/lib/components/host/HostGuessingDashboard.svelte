<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { socket } from '$lib/socket';
  import { t } from '$lib/i18n';
  import type { GuessingChallenge, GuessingSubmission } from '@christmas/core';
  import ChallengeFormModal from '$lib/components/guessing/ChallengeFormModal.svelte';
  import SubmissionsTable from '$lib/components/guessing/SubmissionsTable.svelte';
  import QRCodeDisplay from '$lib/components/guessing/QRCodeDisplay.svelte';
  import GuessingRevealModal from '$lib/components/guessing/GuessingRevealModal.svelte';
  import { browser } from '$app/environment';

  export let roomCode: string;
  export let origin: string;

  let challenges: GuessingChallenge[] = [];
  let loading = false;
  let error = '';
  let formModalOpen = false;
  let editingChallenge: GuessingChallenge | null = null;
  let expandedChallenge: string | null = null; // ID of challenge with expanded submissions
  let challengeSubmissions: Map<string, GuessingSubmission[]> = new Map();
  let loadingSubmissions: Set<string> = new Set();
  let revealConfirm: { challengeId: string; challengeTitle: string } | null = null;
  let revealModalOpen = false;
  let revealChallengeData: GuessingChallenge | null = null;
  let revealSubmissions: GuessingSubmission[] = [];
  let activeTab: 'running' | 'revealed' = 'running';

  onMount(() => {
    loadChallenges();

    // Refresh challenges periodically (every 30 seconds)
    const refreshInterval = setInterval(() => {
      loadChallenges();
    }, 30000);

    // Cleanup on destroy
    return () => {
      clearInterval(refreshInterval);
    };
  });

  function loadChallenges() {
    if (!$socket || loading) return;
    loading = true;
    error = '';

    $socket.emit('get_guessing_challenges', roomCode, (response: any) => {
      loading = false;
      if (response.success) {
        challenges = response.challenges || [];
        
        // Check for auto-reveal
        checkAutoReveal();
      } else {
        error = response.error || t('guessing.dashboard.errors.loadFailed');
      }
    });
  }

  function checkAutoReveal() {
    if (!$socket) return;
    // Check if any challenges should be auto-revealed
    $socket.emit('check_auto_reveal', roomCode, (response: any) => {
      if (response.success && response.revealed && response.revealed.length > 0) {
        // Reload challenges if any were auto-revealed
        loadChallenges();
      }
    });
  }

  function openCreateModal() {
    editingChallenge = null;
    formModalOpen = true;
  }

  function openEditModal(challenge: GuessingChallenge) {
    editingChallenge = challenge;
    formModalOpen = true;
  }

  function handleFormSaved(event: CustomEvent<{ challenge: GuessingChallenge }>) {
    formModalOpen = false;
    editingChallenge = null;
    loadChallenges();
  }

  function handleFormClose() {
    formModalOpen = false;
    editingChallenge = null;
  }

  async function deleteChallenge(challenge: GuessingChallenge) {
    if (!$socket || !confirm(t('guessing.dashboard.confirmDelete', { title: challenge.title }))) {
      return;
    }

    $socket.emit('delete_guessing_challenge', challenge.id, roomCode, (response: any) => {
      if (response.success) {
        loadChallenges();
        if (expandedChallenge === challenge.id) {
          expandedChallenge = null;
          challengeSubmissions.delete(challenge.id);
        }
      } else {
        error = response.error || t('guessing.dashboard.errors.deleteFailed');
      }
    });
  }

  function toggleSubmissions(challengeId: string) {
    if (expandedChallenge === challengeId) {
      expandedChallenge = null;
      challengeSubmissions.delete(challengeId);
    } else {
      expandedChallenge = challengeId;
      loadSubmissions(challengeId);
    }
  }

  function loadSubmissions(challengeId: string) {
    if (!$socket || loadingSubmissions.has(challengeId)) return;
    
    // Check if already loaded
    if (challengeSubmissions.has(challengeId)) {
      return;
    }

    loadingSubmissions.add(challengeId);

    $socket.emit('get_guessing_submissions', challengeId, roomCode, (response: any) => {
      loadingSubmissions.delete(challengeId);
      if (response.success) {
        challengeSubmissions.set(challengeId, response.submissions || []);
      } else {
        error = response.error || t('guessing.dashboard.errors.loadSubmissionsFailed');
      }
    });
  }

  function revealChallenge(challenge: GuessingChallenge) {
    revealConfirm = { challengeId: challenge.id, challengeTitle: challenge.title };
  }

  function confirmReveal() {
    if (!$socket || !revealConfirm) return;

    const challengeId = revealConfirm.challengeId;
    
    // First, load submissions for this challenge
    loadingSubmissions.add(challengeId);
    
    $socket.emit('get_guessing_submissions', challengeId, roomCode, (submissionsResponse: any) => {
      loadingSubmissions.delete(challengeId);
      
      if (!submissionsResponse.success) {
        error = submissionsResponse.error || t('guessing.dashboard.errors.loadSubmissionsFailed');
        revealConfirm = null;
        return;
      }

      // Now reveal the challenge
      $socket.emit('reveal_guessing_challenge', challengeId, roomCode, (response: any) => {
        if (response.success) {
          // Find the challenge object
          const challenge = challenges.find(c => c.id === challengeId);
          if (challenge) {
            // Open the reveal modal with challenge and submissions
            revealChallengeData = challenge;
            revealSubmissions = submissionsResponse.submissions || [];
            revealModalOpen = true;
          }
          
          loadChallenges();
          revealConfirm = null;
          
          // Reload submissions if expanded
          if (expandedChallenge === challengeId) {
            challengeSubmissions.delete(challengeId);
            loadSubmissions(challengeId);
          }
        } else {
          error = response.error || t('guessing.dashboard.errors.revealFailed');
          revealConfirm = null;
        }
      });
    });
  }

  function handleRevealModalClose() {
    revealModalOpen = false;
    revealChallengeData = null;
    revealSubmissions = [];
  }

  function cancelReveal() {
    revealConfirm = null;
  }

  function getChallengeUrl(challengeId: string): string {
    if (!browser) return '';
    return `${origin}/guess/${roomCode}/${challengeId}`;
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
  }

  // Separate challenges by revealed status
  $: runningChallenges = challenges.filter(c => !c.is_revealed);
  $: revealedChallenges = challenges.filter(c => c.is_revealed);
  $: currentChallenges = activeTab === 'running' ? runningChallenges : revealedChallenges;
</script>

<div class="guessing-dashboard">
  <div class="dashboard-header">
    <h1>{t('guessing.dashboard.title')}</h1>
    <button type="button" on:click={openCreateModal} class="btn-primary">
      ➕ {t('guessing.dashboard.createChallenge')}
    </button>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if loading && challenges.length === 0}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>{t('guessing.dashboard.loading')}</p>
    </div>
  {:else if challenges.length === 0}
    <div class="empty-state">
      <p>{t('guessing.dashboard.noChallenges')}</p>
      <button type="button" on:click={openCreateModal} class="btn-primary">
        {t('guessing.dashboard.createFirst')}
      </button>
    </div>
  {:else}
    <!-- Tab Navigation -->
    <div class="tabs-container">
      <button
        type="button"
        class="tab-btn"
        class:active={activeTab === 'running'}
        on:click={() => activeTab = 'running'}
      >
        🎯 {t('guessing.dashboard.tabs.running')} ({runningChallenges.length})
      </button>
      <button
        type="button"
        class="tab-btn"
        class:active={activeTab === 'revealed'}
        on:click={() => activeTab = 'revealed'}
      >
        ✅ {t('guessing.dashboard.tabs.revealed')} ({revealedChallenges.length})
      </button>
    </div>

    <!-- Challenges List - Slim Design -->
    <div class="challenges-list">
      {#each currentChallenges as challenge (challenge.id)}
        {@const submissions = challengeSubmissions.get(challenge.id)}
        <div class="challenge-card-slim" class:revealed={challenge.is_revealed}>
          <!-- Compact Header Row -->
          <div class="challenge-header-slim">
            <div class="challenge-image-small">
              <img src={challenge.image_url} alt={challenge.title} />
            </div>
            <div class="challenge-info-slim">
              <div class="challenge-title-row">
                <h3 class="challenge-title-compact">{challenge.title}</h3>
                {#if challenge.is_revealed}
                  <span class="revealed-badge-small">✓</span>
                {/if}
              </div>
              {#if challenge.description}
                <p class="challenge-description-compact">{challenge.description}</p>
              {/if}
              <div class="challenge-meta-slim">
                <span class="meta-item">🎯 {challenge.min_guess} - {challenge.max_guess}</span>
                {#if challenge.is_revealed}
                  <span class="meta-item correct-answer-compact">✅ {challenge.correct_answer.toFixed(2)}</span>
                {/if}
                {#if submissions && submissions.length > 0}
                  <span class="meta-item">👥 {submissions.length}</span>
                {/if}
              </div>
            </div>
            <div class="challenge-actions-slim">
              {#if !challenge.is_revealed}
                <button
                  type="button"
                  on:click={() => revealChallenge(challenge)}
                  class="btn-action btn-reveal"
                  title={t('guessing.dashboard.reveal')}
                >
                  👁️
                </button>
              {/if}
              <button
                type="button"
                on:click={() => openEditModal(challenge)}
                class="btn-action btn-edit"
                title={t('guessing.dashboard.edit')}
              >
                ✏️
              </button>
              <button
                type="button"
                on:click={() => deleteChallenge(challenge)}
                class="btn-action btn-delete"
                title={t('guessing.dashboard.delete')}
              >
                🗑️
              </button>
            </div>
          </div>

          <!-- Expandable Sections -->
          {#if expandedChallenge === challenge.id}
            <div class="challenge-expanded">
              <div class="expanded-details">
                {#if challenge.reveal_at}
                  <div class="detail-item">
                    <span class="detail-label">{t('guessing.dashboard.revealAt')}:</span>
                    <span class="detail-value">{formatDate(challenge.reveal_at)}</span>
                  </div>
                {/if}
                <div class="detail-item">
                  <span class="detail-label">{t('guessing.dashboard.multipleGuesses')}:</span>
                  <span class="detail-value">
                    {challenge.allow_multiple_guesses ? t('common.button.yes') : t('common.button.no')}
                  </span>
                </div>
              </div>

              <!-- Submissions -->
              <div class="submissions-section-compact">
                {#if loadingSubmissions.has(challenge.id)}
                  <div class="loading-submissions">
                    <div class="spinner-small"></div>
                    <p>{t('guessing.dashboard.loadingSubmissions')}</p>
                  </div>
                {:else}
                  <SubmissionsTable
                    submissions={challengeSubmissions.get(challenge.id) || []}
                    showExport={true}
                  />
                {/if}
              </div>

              <!-- QR Code -->
              <div class="qrcode-section-compact">
                <QRCodeDisplay url={getChallengeUrl(challenge.id)} title={t('guessing.dashboard.shareChallenge')} />
              </div>
            </div>
          {/if}

          <!-- Toggle Button -->
          <button
            type="button"
            on:click={() => toggleSubmissions(challenge.id)}
            class="btn-toggle-expand"
          >
            {expandedChallenge === challenge.id ? '▲' : '▼'} 
            {expandedChallenge === challenge.id 
              ? t('guessing.dashboard.hideDetails')
              : t('guessing.dashboard.showDetails')}
          </button>
        </div>
      {:else}
        <div class="empty-tab-state">
          <p>{activeTab === 'running' 
            ? t('guessing.dashboard.noRunningChallenges')
            : t('guessing.dashboard.noRevealedChallenges')}</p>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if formModalOpen}
  <ChallengeFormModal
    open={formModalOpen}
    challenge={editingChallenge}
    {roomCode}
    on:saved={handleFormSaved}
    on:close={handleFormClose}
  />
{/if}

{#if revealConfirm}
  <div class="reveal-confirm-overlay" on:click={cancelReveal} role="dialog" aria-modal="true">
    <div class="reveal-confirm-dialog" on:click|stopPropagation>
      <h3>{t('guessing.dashboard.confirmReveal')}</h3>
      <p>{t('guessing.dashboard.confirmRevealMessage', { title: revealConfirm.challengeTitle })}</p>
      <div class="reveal-confirm-buttons">
        <button type="button" on:click={cancelReveal} class="btn-secondary">
          {t('common.button.cancel')}
        </button>
        <button type="button" on:click={confirmReveal} class="btn-primary">
          {t('guessing.dashboard.reveal')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if revealModalOpen && revealChallengeData}
  <GuessingRevealModal
    open={revealModalOpen}
    challenge={revealChallengeData}
    submissions={revealSubmissions}
    on:close={handleRevealModalClose}
  />
{/if}

<style>
  .guessing-dashboard {
    width: 100%;
    height: 100%;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    padding: clamp(0.75rem, 1.5vh, 1rem);
    color: white;
    overflow: hidden;
  }

  .dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: clamp(0.75rem, 1.5vh, 1rem);
    flex-shrink: 0;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: clamp(1.25rem, 2vw, 1.75rem);
    color: #ffd700;
    font-weight: bold;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .btn-primary {
    padding: clamp(0.5rem, 1vh, 0.75rem) clamp(1rem, 1.5vw, 1.5rem);
    background: linear-gradient(135deg, #c41e3a, #a01a2e);
    border: 2px solid #ffd700;
    border-radius: 0.5rem;
    color: white;
    font-size: clamp(0.875rem, 1.2vw, 1rem);
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, #a01a2e, #c41e3a);
    box-shadow: 0 4px 15px rgba(196, 30, 58, 0.4);
    transform: translateY(-2px);
  }

  .error-message {
    padding: clamp(0.5rem, 1vh, 0.75rem);
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid #c41e3a;
    border-radius: 0.5rem;
    color: #ffcccc;
    margin-bottom: clamp(0.75rem, 1.5vh, 1rem);
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    flex-shrink: 0;
  }

  .loading-state,
  .empty-state {
    text-align: center;
    padding: clamp(2rem, 4vh, 3rem) clamp(1rem, 2vw, 2rem);
    color: rgba(255, 255, 255, 0.7);
    font-size: clamp(0.875rem, 1.2vw, 1rem);
  }

  .spinner {
    width: clamp(2rem, 3vw, 2.5rem);
    height: clamp(2rem, 3vw, 2.5rem);
    border: 3px solid rgba(255, 215, 0, 0.3);
    border-top-color: #ffd700;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin: 0 auto clamp(0.75rem, 1.5vh, 1rem);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .spinner-small {
    width: clamp(1rem, 1.5vw, 1.25rem);
    height: clamp(1rem, 1.5vw, 1.25rem);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-top-color: #ffd700;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin: 0 auto clamp(0.4rem, 0.8vh, 0.5rem);
  }

  .loading-submissions {
    text-align: center;
    padding: clamp(1rem, 2vh, 1.5rem);
    color: rgba(255, 255, 255, 0.7);
    font-size: clamp(0.75rem, 1vw, 0.875rem);
  }

  /* Scrollbar styling */
  .challenges-list {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 215, 0, 0.5) transparent;
  }

  .challenges-list::-webkit-scrollbar {
    width: 8px;
  }

  .challenges-list::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
  }

  .challenges-list::-webkit-scrollbar-thumb {
    background: repeating-linear-gradient(
      45deg,
      rgba(255, 215, 0, 0.6) 0px,
      rgba(255, 215, 0, 0.6) 4px,
      rgba(255, 255, 255, 0.3) 4px,
      rgba(255, 255, 255, 0.3) 8px
    );
    border-radius: 4px;
  }

  .challenges-list::-webkit-scrollbar-thumb:hover {
    background: repeating-linear-gradient(
      45deg,
      rgba(255, 215, 0, 0.8) 0px,
      rgba(255, 215, 0, 0.8) 4px,
      rgba(255, 255, 255, 0.4) 4px,
      rgba(255, 255, 255, 0.4) 8px
    );
  }

  /* Tab Navigation */
  .tabs-container {
    display: flex;
    gap: clamp(0.5rem, 1vw, 0.75rem);
    margin-bottom: clamp(0.75rem, 1.5vh, 1rem);
    flex-shrink: 0;
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
  }

  .tab-btn {
    padding: clamp(0.5rem, 1vh, 0.75rem) clamp(1rem, 1.5vw, 1.5rem);
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: rgba(255, 255, 255, 0.7);
    font-size: clamp(0.875rem, 1.2vw, 1rem);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    margin-bottom: -2px;
  }

  .tab-btn:hover {
    color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
  }

  .tab-btn.active {
    color: #ffd700;
    border-bottom-color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
  }

  /* Slim Challenges List */
  .challenges-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: clamp(0.5rem, 1vh, 0.75rem);
    min-height: 0;
  }

  .challenge-card-slim {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.75rem;
    padding: clamp(0.75rem, 1.5vh, 1rem);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    transition: all 0.3s;
    flex-shrink: 0;
  }

  .challenge-card-slim:hover {
    border-color: #ffd700;
    box-shadow: 0 4px 20px rgba(255, 215, 0, 0.2);
  }

  .challenge-card-slim.revealed {
    border-color: #0f8644;
    background: rgba(15, 134, 68, 0.1);
  }

  .challenge-header-slim {
    display: flex;
    align-items: center;
    gap: clamp(0.75rem, 1.5vw, 1rem);
  }

  .challenge-image-small {
    width: clamp(80px, 10vw, 120px);
    height: clamp(60px, 8vh, 90px);
    flex-shrink: 0;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 2px solid rgba(255, 215, 0, 0.3);
    background: rgba(0, 0, 0, 0.2);
  }

  .challenge-image-small img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .challenge-info-slim {
    flex: 1;
    min-width: 0;
  }

  .challenge-title-row {
    display: flex;
    align-items: center;
    gap: clamp(0.5rem, 1vw, 0.75rem);
    margin-bottom: clamp(0.25rem, 0.5vh, 0.5rem);
  }

  .challenge-title-compact {
    margin: 0;
    font-size: clamp(1rem, 1.5vw, 1.25rem);
    color: #ffd700;
    font-weight: bold;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .revealed-badge-small {
    display: inline-flex;
    align-items: center;
    padding: clamp(0.2rem, 0.4vh, 0.3rem) clamp(0.4rem, 0.8vw, 0.6rem);
    background: rgba(15, 134, 68, 0.3);
    border: 1px solid #0f8644;
    border-radius: 0.25rem;
    color: #0f8644;
    font-size: clamp(0.7rem, 1vw, 0.875rem);
    font-weight: bold;
    flex-shrink: 0;
  }

  .challenge-description-compact {
    margin: 0 0 clamp(0.4rem, 0.8vh, 0.5rem) 0;
    color: rgba(255, 255, 255, 0.7);
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .challenge-meta-slim {
    display: flex;
    flex-wrap: wrap;
    gap: clamp(0.5rem, 1vw, 0.75rem);
    font-size: clamp(0.7rem, 1vw, 0.8rem);
    color: rgba(255, 255, 255, 0.6);
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .correct-answer-compact {
    color: #0f8644;
    font-weight: 600;
  }

  .challenge-actions-slim {
    display: flex;
    gap: clamp(0.3rem, 0.6vw, 0.5rem);
    flex-shrink: 0;
  }

  .btn-action {
    padding: clamp(0.4rem, 0.8vh, 0.5rem);
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.4rem;
    color: white;
    font-size: clamp(0.875rem, 1.2vw, 1rem);
    cursor: pointer;
    transition: all 0.2s;
    min-width: clamp(32px, 4vw, 36px);
    height: clamp(32px, 4vw, 36px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-action.btn-reveal {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
  }

  .btn-action.btn-reveal:hover {
    background: rgba(15, 134, 68, 0.3);
    box-shadow: 0 2px 8px rgba(15, 134, 68, 0.4);
  }

  .btn-action.btn-edit:hover {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
  }

  .btn-action.btn-delete:hover {
    background: rgba(196, 30, 58, 0.3);
    border-color: #c41e3a;
  }

  .challenge-expanded {
    margin-top: clamp(0.75rem, 1.5vh, 1rem);
    padding-top: clamp(0.75rem, 1.5vh, 1rem);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .expanded-details {
    display: flex;
    flex-direction: column;
    gap: clamp(0.4rem, 0.8vh, 0.5rem);
    margin-bottom: clamp(0.75rem, 1.5vh, 1rem);
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    font-size: clamp(0.75rem, 1vw, 0.875rem);
  }

  .submissions-section-compact {
    margin-bottom: clamp(0.75rem, 1.5vh, 1rem);
  }

  .qrcode-section-compact {
    margin-top: clamp(0.75rem, 1.5vh, 1rem);
    padding-top: clamp(0.75rem, 1.5vh, 1rem);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .btn-toggle-expand {
    width: 100%;
    padding: clamp(0.5rem, 1vh, 0.6rem);
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.5rem;
    color: white;
    font-size: clamp(0.75rem, 1vw, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: clamp(0.5rem, 1vh, 0.75rem);
  }

  .btn-toggle-expand:hover {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
  }

  .empty-tab-state {
    text-align: center;
    padding: clamp(2rem, 4vh, 3rem);
    color: rgba(255, 255, 255, 0.6);
    font-size: clamp(0.875rem, 1.2vw, 1rem);
  }


  .reveal-confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3000;
    padding: 1rem;
  }

  .reveal-confirm-dialog {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 3px solid #ffd700;
    border-radius: 1rem;
    padding: 2rem;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }

  .reveal-confirm-dialog h3 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    color: #ffd700;
    font-weight: bold;
  }

  .reveal-confirm-dialog p {
    margin: 0 0 1.5rem 0;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.6;
  }

  .reveal-confirm-buttons {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .btn-secondary {
    padding: 0.75rem 1.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    color: white;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  @media (max-width: 768px) {
    .guessing-dashboard {
      padding: 1rem;
    }

    .dashboard-header {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .dashboard-header h1 {
      font-size: 2rem;
    }

    .challenges-grid {
      grid-template-columns: 1fr;
    }

    .challenge-actions {
      flex-wrap: wrap;
    }
  }
</style>

