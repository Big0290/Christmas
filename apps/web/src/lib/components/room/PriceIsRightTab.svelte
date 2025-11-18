<script lang="ts">
  import { GameType } from '@christmas/core';
  import { browser } from '$app/environment';
  import ImageUpload from '$lib/components/ImageUpload.svelte';
  import { t } from '$lib/i18n';
  
  export let priceTimePerRound: number;
  export let itemSets: Array<{ id: string; name: string; description?: string; itemCount: number }>;
  export let selectedItemSet: string | null;
  export let currentItems: Array<{ id: string; name: string; description: string; price: number; imageUrl: string; category: string }>;
  export let loadingItems: boolean;
  export let addingItem: boolean;
  export let newItem: {
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    category: string;
  };
  export let newItemSetName: string;
  export let newItemSetDescription: string;
  
  export let onItemSetChange: (setId: string | null) => void;
  export let addItem: () => void;
  export let deleteItem: (itemId: string) => void;
  export let deleteItemSet: (setId: string) => void;
  export let handleImageUpload: (event: CustomEvent<{ imageUrl: string }>) => void;
  export let saveTimeSetting: (gameType: GameType, setting: string, value: number) => void;
  
  function openCreateItemSetDialog() {
    newItemSetName = '';
    newItemSetDescription = '';
    if (browser) {
      const dialog = document.getElementById('create-item-set-dialog');
      if (dialog instanceof HTMLDialogElement) dialog.showModal();
    }
  }
</script>

<div class="tab-panel">
  <h3 class="text-xl font-bold mb-4">💰 {t('priceTab.title')}</h3>
  <div class="space-y-4">
    <!-- Time Setting -->
    <div>
      <label class="block text-sm font-medium mb-2">{t('priceTab.timePerRound')}</label>
      <input
        type="number"
        bind:value={priceTimePerRound}
        min="10"
        max="60"
        class="input w-full"
        on:change={() => saveTimeSetting(GameType.PRICE_IS_RIGHT, 'timeLimit', priceTimePerRound)}
      />
      <p class="text-xs text-white/50 mt-1">{t('priceTab.timeRange')}</p>
    </div>

    <!-- Item Set Selector -->
    <div>
      <label class="block text-sm font-medium mb-2">{t('priceTab.itemSet')}</label>
      <div class="flex gap-2">
        <select
          bind:value={selectedItemSet}
          on:change={(e) => onItemSetChange(e.target.value || null)}
          class="input flex-1"
        >
          <option value={null}>{t('priceTab.defaultItems')}</option>
          {#each itemSets as set}
            <option value={set.id}>
              {set.name} ({set.itemCount} {t('priceTab.items')})
            </option>
          {/each}
        </select>
        <button
          on:click={openCreateItemSetDialog}
          class="btn-secondary text-sm whitespace-nowrap"
        >
          + {t('priceTab.newSet')}
        </button>
      </div>
    </div>

    {#if selectedItemSet}
      <!-- Items List -->
      <div>
        <h4 class="font-bold mb-2">{t('priceTab.items')} ({currentItems.length})</h4>
        {#if loadingItems}
          <p class="text-white/50 text-center py-4">{t('priceTab.loadingItems')}</p>
        {:else if currentItems.length === 0}
          <p class="text-white/50 text-center py-4">{t('priceTab.noItems')}</p>
        {:else}
          <div class="space-y-2 max-h-64 overflow-y-auto">
            {#each currentItems as item}
              <div class="p-3 bg-white/5 rounded-lg">
                <div class="flex justify-between items-start mb-2">
                  <div class="flex-1">
                    <p class="font-medium">{item.name}</p>
                    {#if item.description}
                      <p class="text-sm text-white/70">{item.description}</p>
                    {/if}
                    <p class="text-sm text-christmas-gold font-bold">${item.price.toFixed(2)}</p>
                    {#if item.category}
                      <span class="text-xs text-white/50">{item.category}</span>
                    {/if}
                  </div>
                  <button
                    on:click={() => deleteItem(item.id)}
                    class="text-red-400 hover:text-red-300 text-sm ml-2"
                  >
                    🗑️
                  </button>
                </div>
                {#if item.imageUrl}
                  <img src={item.imageUrl} alt={item.name} class="w-full h-32 object-cover rounded mt-2" />
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Add Item Form -->
      <div class="p-4 bg-white/5 rounded-lg">
        <h4 class="font-bold mb-3">{t('priceTab.addNewItem')}</h4>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">{t('priceTab.itemName')}</label>
            <input
              type="text"
              bind:value={newItem.name}
              placeholder={t('priceTab.itemNamePlaceholder')}
              class="input w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">{t('priceTab.description')}</label>
            <textarea
              bind:value={newItem.description}
              placeholder={t('priceTab.descriptionPlaceholder')}
              class="input w-full"
              rows="2"
            ></textarea>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-sm font-medium mb-1">{t('priceTab.price')}</label>
              <input
                type="number"
                bind:value={newItem.price}
                min="0.01"
                step="0.01"
                placeholder="0.00"
                class="input w-full"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">{t('priceTab.category')}</label>
              <input
                type="text"
                bind:value={newItem.category}
                placeholder={t('priceTab.categoryPlaceholder')}
                class="input w-full"
              />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">{t('priceTab.image')}</label>
            <ImageUpload
              currentImageUrl={newItem.imageUrl}
              on:upload={handleImageUpload}
            />
          </div>
          <button
            on:click={addItem}
            disabled={addingItem || !newItem.name.trim() || !newItem.imageUrl.trim() || newItem.price <= 0}
            class="btn-primary w-full"
          >
            {addingItem ? t('priceTab.adding') : `+ ${t('priceTab.addItem')}`}
          </button>
        </div>
      </div>

      <!-- Delete Set Button -->
      <button
        on:click={() => {
          if (selectedItemSet) {
            deleteItemSet(selectedItemSet);
          }
        }}
        class="btn-secondary w-full text-red-400 hover:bg-red-500/20"
      >
        🗑️ {t('priceTab.deleteSet')}
      </button>
    {/if}
  </div>
</div>

