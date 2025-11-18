<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { socket } from '../socket';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';

  export let currentImageUrl: string | undefined = undefined;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    upload: { imageUrl: string };
    error: { message: string };
  }>();

  let isDragging = false;
  let isUploading = false;
  let previewUrl: string | undefined = currentImageUrl;
  let errorMessage = '';

  $: previewUrl = currentImageUrl;

  function handleDragOver(e: DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;
  }

  function handleDrop(e: DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging = false;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }

  function handleFileInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }

  async function handleFile(file: File) {
    if (disabled || isUploading) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      errorMessage = t('imageUpload.errors.invalidFileType');
      dispatch('error', { message: errorMessage });
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      errorMessage = t('imageUpload.errors.fileSizeExceeded');
      dispatch('error', { message: errorMessage });
      return;
    }

    isUploading = true;
    errorMessage = '';

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Data = e.target?.result as string;
          // Remove data URL prefix if present
          const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

          // Upload via socket
          if (!$socket) {
            throw new Error(t('imageUpload.errors.socketNotConnected'));
          }

          $socket.emit('upload_item_image', {
            name: file.name,
            type: file.type,
            data: base64,
          }, (response: any) => {
            isUploading = false;
            if (response.success) {
              previewUrl = response.imageUrl;
              dispatch('upload', { imageUrl: response.imageUrl });
              errorMessage = '';
            } else {
              errorMessage = response.error || t('imageUpload.errors.failedUpload');
              dispatch('error', { message: errorMessage });
            }
          });
        } catch (err: any) {
          isUploading = false;
          errorMessage = err.message || t('imageUpload.errors.failedProcess');
          dispatch('error', { message: errorMessage });
        }
      };

      reader.onerror = () => {
        isUploading = false;
        errorMessage = t('imageUpload.errors.failedRead');
        dispatch('error', { message: errorMessage });
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      isUploading = false;
      errorMessage = err.message || t('imageUpload.errors.failedUpload');
      dispatch('error', { message: errorMessage });
    }
  }

  function clearImage() {
    if (disabled || isUploading) return;
    previewUrl = undefined;
    currentImageUrl = undefined;
    errorMessage = '';
  }
</script>

<div class="image-upload-container">
  {#if previewUrl}
    <div class="image-preview">
      <img src={previewUrl} alt="Preview" />
      {#if !disabled && !isUploading}
        <button type="button" on:click={clearImage} class="remove-image-btn" title={t('imageUpload.removeImage')}>
          ✕
        </button>
      {/if}
    </div>
  {:else}
    <div
      class="upload-zone"
      class:dragging={isDragging}
      class:disabled={disabled || isUploading}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
    >
      {#if isUploading}
        <div class="uploading">
          <div class="spinner"></div>
          <p>{t('imageUpload.uploading')}</p>
        </div>
      {:else}
        <div class="upload-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <p>{t('imageUpload.dragDrop')}</p>
          <p class="text-sm">{t('imageUpload.or')}</p>
          <label class="file-input-label">
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              on:change={handleFileInput}
              disabled={disabled || isUploading}
              class="file-input"
            />
            <span class="btn-secondary">{t('imageUpload.chooseFile')}</span>
          </label>
          <p class="text-xs">{t('imageUpload.fileInfo')}</p>
        </div>
      {/if}
    </div>
  {/if}

  {#if errorMessage}
    <div class="error-message">
      {errorMessage}
    </div>
  {/if}
</div>

<style>
  .image-upload-container {
    width: 100%;
  }

  .image-preview {
    position: relative;
    width: 100%;
    max-width: 400px;
    aspect-ratio: 4/3;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 2px solid rgba(255, 215, 0, 0.3);
    background: rgba(0, 0, 0, 0.2);
  }

  .image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .remove-image-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: rgba(196, 30, 58, 0.9);
    color: white;
    border: none;
    border-radius: 50%;
    width: 2rem;
    height: 2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    transition: background 0.2s;
  }

  .remove-image-btn:hover {
    background: rgba(196, 30, 58, 1);
  }

  .upload-zone {
    width: 100%;
    min-height: 200px;
    border: 2px dashed rgba(255, 215, 0, 0.5);
    border-radius: 0.5rem;
    padding: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.2);
    transition: all 0.2s;
    cursor: pointer;
  }

  .upload-zone.dragging {
    border-color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
  }

  .upload-zone.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .upload-content {
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
  }

  .upload-content svg {
    color: rgba(255, 215, 0, 0.7);
    margin-bottom: 1rem;
  }

  .upload-content p {
    margin: 0.5rem 0;
  }

  .text-sm {
    font-size: 0.875rem;
  }

  .text-xs {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .file-input-label {
    display: inline-block;
    margin: 0.5rem 0;
  }

  .file-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    overflow: hidden;
  }

  .uploading {
    text-align: center;
    color: rgba(255, 255, 255, 0.8);
  }

  .spinner {
    width: 3rem;
    height: 3rem;
    border: 3px solid rgba(255, 215, 0, 0.3);
    border-top-color: #ffd700;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-message {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(196, 30, 58, 0.2);
    border: 1px solid rgba(196, 30, 58, 0.5);
    border-radius: 0.25rem;
    color: #ff6b6b;
    font-size: 0.875rem;
  }
</style>

