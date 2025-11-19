<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from '$lib/i18n';
  import type { GuessingSubmission } from '@christmas/core';

  export let submissions: GuessingSubmission[] = [];
  export let showExport = true;

  const dispatch = createEventDispatcher<{
    exportCSV: void;
  }>();

  $: sortedSubmissions = [...submissions].sort((a, b) => {
    // Sort by difference (closest first), then by submission time (earliest first)
    if (a.difference !== b.difference) {
      return a.difference - b.difference;
    }
    return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
  });

  $: rankedSubmissions = sortedSubmissions.map((sub, index) => ({
    ...sub,
    rank: index + 1,
  }));

  function exportToCSV() {
    const headers = ['Rank', 'Guess', 'Difference', 'Submitted At'];
    const rows = rankedSubmissions.map((sub) => [
      sub.rank,
      sub.guess_value.toFixed(2),
      sub.difference.toFixed(2),
      new Date(sub.submitted_at).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `guessing_submissions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    dispatch('exportCSV');
  }

  function formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

<div class="submissions-table-container">
  <div class="table-header">
    <h3>{t('guessing.submissions.title')}</h3>
    {#if showExport && submissions.length > 0}
      <button type="button" on:click={exportToCSV} class="export-btn">
        📥 {t('guessing.submissions.export')}
      </button>
    {/if}
  </div>

  {#if submissions.length === 0}
    <div class="empty-state">
      <p>{t('guessing.submissions.noSubmissions')}</p>
    </div>
  {:else}
    <div class="table-wrapper">
      <table class="submissions-table">
        <thead>
          <tr>
            <th>{t('guessing.submissions.rank')}</th>
            <th>{t('guessing.submissions.guess')}</th>
            <th>{t('guessing.submissions.difference')}</th>
            <th>{t('guessing.submissions.submittedAt')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rankedSubmissions as submission (submission.id)}
            <tr class:winner={submission.rank <= 3}>
              <td class="rank-cell">
                {#if submission.rank === 1}
                  🥇
                {:else if submission.rank === 2}
                  🥈
                {:else if submission.rank === 3}
                  🥉
                {:else}
                  #{submission.rank}
                {/if}
              </td>
              <td class="guess-cell">{submission.guess_value.toFixed(2)}</td>
              <td class="difference-cell">
                <span class:closest={submission.rank === 1}>
                  {submission.difference.toFixed(2)}
                </span>
              </td>
              <td class="time-cell">{formatTime(submission.submitted_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .submissions-table-container {
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid rgba(255, 215, 0, 0.3);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-top: 1rem;
  }

  .table-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .table-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #ffd700;
    font-weight: bold;
  }

  .export-btn {
    padding: 0.5rem 1rem;
    background: rgba(255, 215, 0, 0.2);
    border: 2px solid #ffd700;
    border-radius: 0.5rem;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .export-btn:hover {
    background: rgba(255, 215, 0, 0.3);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .submissions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .submissions-table thead {
    background: rgba(255, 215, 0, 0.1);
    border-bottom: 2px solid rgba(255, 215, 0, 0.3);
  }

  .submissions-table th {
    padding: 0.75rem;
    text-align: left;
    color: #ffd700;
    font-weight: bold;
    font-size: 0.875rem;
  }

  .submissions-table tbody tr {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    transition: background 0.2s;
  }

  .submissions-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .submissions-table tbody tr.winner {
    background: rgba(255, 215, 0, 0.1);
  }

  .submissions-table tbody tr.winner:hover {
    background: rgba(255, 215, 0, 0.15);
  }

  .submissions-table td {
    padding: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .rank-cell {
    font-weight: bold;
    color: #ffd700;
    font-size: 1rem;
  }

  .guess-cell {
    font-family: 'Courier New', monospace;
    font-weight: 500;
  }

  .difference-cell span {
    font-family: 'Courier New', monospace;
    font-weight: 500;
  }

  .difference-cell span.closest {
    color: #0f8644;
    font-weight: bold;
    text-shadow: 0 0 8px rgba(15, 134, 68, 0.5);
  }

  .time-cell {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.8rem;
  }

  @media (max-width: 640px) {
    .submissions-table {
      font-size: 0.75rem;
    }

    .submissions-table th,
    .submissions-table td {
      padding: 0.5rem;
    }

    .rank-cell {
      font-size: 0.875rem;
    }
  }
</style>

