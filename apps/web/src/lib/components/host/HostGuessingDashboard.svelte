<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { socket } from '$lib/socket';
  import { t } from '$lib/i18n';
  import type { GuessingChallenge, GuessingSubmission } from '@christmas/core';
  import ChallengeFormModal from '$lib/components/guessing/ChallengeFormModal.svelte';
  import SubmissionsTable from '$lib/components/guessing/SubmissionsTable.svelte';
  import QRCodeDisplay from '$lib/components/guessing/QRCodeDisplay.svelte';
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

    $socket.emit('reveal_guessing_challenge', revealConfirm.challengeId, roomCode, (response: any) => {
      if (response.success) {
        loadChallenges();
        revealConfirm = null;
        // Reload submissions if expanded
        if (expandedChallenge === revealConfirm.challengeId) {
          challengeSubmissions.delete(revealConfirm.challengeId);
          loadSubmissions(revealConfirm.challengeId);
        }
      } else {
        error = response.error || t('guessing.dashboard.errors.revealFailed');
        revealConfirm = null;
      }
    });
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
    <div class="challenges-grid">
      {#each challenges as challenge (challenge.id)}
        {@const submissions = challengeSubmissions.get(challenge.id)}
        <div class="challenge-card" class:revealed={challenge.is_revealed}>
          <div class="challenge-header">
            <div class="challenge-title-section">
              <h3>{challenge.title}</h3>
              {#if challenge.is_revealed}
                <span class="revealed-badge">✓ {t('guessing.dashboard.revealed')}</span>
              {/if}
            </div>
            <div class="challenge-actions">
              {#if !challenge.is_revealed}
                <button
                  type="button"
                  on:click={() => revealChallenge(challenge)}
                  class="btn-reveal"
                  title={t('guessing.dashboard.reveal')}
                >
                  👁️ {t('guessing.dashboard.reveal')}
                </button>
              {/if}
              <button
                type="button"
                on:click={() => openEditModal(challenge)}
                class="btn-edit"
                title={t('guessing.dashboard.edit')}
              >
                ✏️
              </button>
              <button
                type="button"
                on:click={() => deleteChallenge(challenge)}
                class="btn-delete"
                title={t('guessing.dashboard.delete')}
              >
                🗑️
              </button>
            </div>
          </div>

          {#if challenge.description}
            <p class="challenge-description">{challenge.description}</p>
          {/if}

          <div class="challenge-image">
            <img src={challenge.image_url} alt={challenge.title} />
          </div>

          <div class="challenge-details">
            <div class="detail-row">
              <span class="detail-label">{t('guessing.dashboard.bounds')}:</span>
              <span class="detail-value">{challenge.min_guess} - {challenge.max_guess}</span>
            </div>
            {#if challenge.reveal_at}
              <div class="detail-row">
                <span class="detail-label">{t('guessing.dashboard.revealAt')}:</span>
                <span class="detail-value">{formatDate(challenge.reveal_at)}</span>
              </div>
            {/if}
            <div class="detail-row">
              <span class="detail-label">{t('guessing.dashboard.multipleGuesses')}:</span>
              <span class="detail-value">
                {challenge.allow_multiple_guesses ? t('common.yes') : t('common.no')}
              </span>
            </div>
          </div>

          {#if challenge.is_revealed}
            <div class="challenge-reveal-info">
              <div class="correct-answer">
                <span class="correct-label">{t('guessing.dashboard.correctAnswer')}:</span>
                <span class="correct-value">{challenge.correct_answer.toFixed(2)}</span>
              </div>
            </div>
          {/if}

          <div class="challenge-actions-footer">
            <button
              type="button"
              on:click={() => toggleSubmissions(challenge.id)}
              class="btn-submissions"
            >
              {expandedChallenge === challenge.id
                ? '▼ ' + t('guessing.dashboard.hideSubmissions')
                : '▶ ' + t('guessing.dashboard.viewSubmissions')}
              {#if submissions && submissions.length > 0}
                <span class="submission-count">
                  ({submissions.length})
                </span>
              {/if}
            </button>
          </div>

          {#if expandedChallenge === challenge.id}
            <div class="submissions-section">
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
          {/if}

          <div class="qrcode-section">
            <QRCodeDisplay url={getChallengeUrl(challenge.id)} title={t('guessing.dashboard.shareChallenge')} />
          </div>
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

<style>
  .guessing-dashboard {
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: 2rem;
    color: white;
  }

  .dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .dashboard-header h1 {
    margin: 0;
    font-size: 2.5rem;
    color: #ffd700;
    font-weight: bold;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }

  .btn-primary {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #c41e3a, #a01a2e);
    border: 2px solid #ffd700;
    border-radius: 0.5rem;
    color: white;
    font-size: 1rem;
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
    padding: 1rem;
    background: rgba(196, 30, 58, 0.3);
    border: 2px solid #c41e3a;
    border-radius: 0.5rem;
    color: #ffcccc;
    margin-bottom: 1.5rem;
  }

  .loading-state,
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .spinner {
    width: 3rem;
    height: 3rem;
    border: 4px solid rgba(255, 215, 0, 0.3);
    border-top-color: #ffd700;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .spinner-small {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-top-color: #ffd700;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin: 0 auto 0.5rem;
  }

  .challenges-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 2rem;
  }

  .challenge-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    transition: all 0.3s;
  }

  .challenge-card:hover {
    border-color: #ffd700;
    box-shadow: 0 8px 30px rgba(255, 215, 0, 0.3);
  }

  .challenge-card.revealed {
    border-color: #0f8644;
    background: rgba(15, 134, 68, 0.1);
  }

  .challenge-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .challenge-title-section {
    flex: 1;
  }

  .challenge-title-section h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: #ffd700;
    font-weight: bold;
  }

  .revealed-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: rgba(15, 134, 68, 0.3);
    border: 1px solid #0f8644;
    border-radius: 0.25rem;
    color: #0f8644;
    font-size: 0.875rem;
    font-weight: bold;
  }

  .challenge-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-reveal,
  .btn-edit,
  .btn-delete {
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.25rem;
    color: white;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-reveal {
    background: rgba(15, 134, 68, 0.2);
    border-color: #0f8644;
  }

  .btn-reveal:hover {
    background: rgba(15, 134, 68, 0.3);
    box-shadow: 0 2px 8px rgba(15, 134, 68, 0.4);
  }

  .btn-edit:hover {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
  }

  .btn-delete:hover {
    background: rgba(196, 30, 58, 0.3);
    border-color: #c41e3a;
  }

  .challenge-description {
    margin: 0 0 1rem 0;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
  }

  .challenge-image {
    width: 100%;
    aspect-ratio: 4/3;
    border-radius: 0.5rem;
    overflow: hidden;
    margin-bottom: 1rem;
    border: 2px solid rgba(255, 215, 0, 0.3);
    background: rgba(0, 0, 0, 0.2);
  }

  .challenge-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .challenge-details {
    margin-bottom: 1rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.875rem;
  }

  .detail-value {
    color: white;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .challenge-reveal-info {
    padding: 1rem;
    background: rgba(15, 134, 68, 0.2);
    border: 2px solid #0f8644;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  .correct-answer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .correct-label {
    color: rgba(255, 255, 255, 0.9);
    font-weight: bold;
    font-size: 1rem;
  }

  .correct-value {
    color: #0f8644;
    font-size: 1.5rem;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(15, 134, 68, 0.5);
  }

  .challenge-actions-footer {
    margin-bottom: 1rem;
  }

  .btn-submissions {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 215, 0, 0.1);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-submissions:hover {
    background: rgba(255, 215, 0, 0.2);
    border-color: #ffd700;
  }

  .submission-count {
    margin-left: 0.5rem;
    color: #ffd700;
    font-weight: bold;
  }

  .submissions-section {
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  .loading-submissions {
    text-align: center;
    padding: 2rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .qrcode-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
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

