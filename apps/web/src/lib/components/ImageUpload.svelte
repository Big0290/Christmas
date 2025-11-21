<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { socket } from '../socket';
  import { browser } from '$app/environment';
  import { t } from '$lib/i18n';
  import ChristmasLoading from '$lib/components/ChristmasLoading.svelte';

  export let currentImageUrl: string | undefined = undefined;
  export let disabled: boolean = false;
  export let bucket: 'price-item-images' | 'guessing-challenge-images' = 'price-item-images';

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

    console.log('[ImageUpload] Starting file read:', {
      name: file.name,
      type: file.type,
      size: file.size,
      sizeKB: (file.size / 1024).toFixed(2)
    });

    // Set up timeout at the start to prevent infinite waiting
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      // Convert file to base64
      const reader = new FileReader();
      
      reader.onloadstart = () => {
        console.log('[ImageUpload] FileReader: Reading file started');
      };

      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = (e.loaded / e.total) * 100;
          console.log(`[ImageUpload] FileReader: Progress ${percent.toFixed(1)}%`);
        }
      };

      reader.onload = async (e) => {
        console.log('[ImageUpload] FileReader: File read complete');
        try {
          const base64Data = e.target?.result as string;
          if (!base64Data) {
            throw new Error('FileReader returned no data');
          }
          console.log('[ImageUpload] Base64 data length:', base64Data.length);
          
          // Remove data URL prefix if present
          const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
          console.log('[ImageUpload] Base64 (without prefix) length:', base64.length);

          // Upload via socket
          console.log('[ImageUpload] Checking socket connection...', {
            hasSocket: !!$socket,
            isConnected: $socket?.connected,
            socketId: $socket?.id
          });

          if (!$socket || !$socket.connected) {
            console.error('[ImageUpload] Socket not connected!', {
              hasSocket: !!$socket,
              isConnected: $socket?.connected
            });
            throw new Error(t('imageUpload.errors.socketNotConnected'));
          }

          // Determine which upload endpoint to use based on bucket prop
          const eventName = bucket === 'guessing-challenge-images' ? 'upload_guessing_image' : 'upload_item_image';
          console.log('[ImageUpload] Using upload event:', eventName, 'for bucket:', bucket);

          // Set up timeout to prevent infinite waiting
          timeout = setTimeout(() => {
            console.error('[ImageUpload] Upload timeout after 30 seconds!');
            timeout = null;
            isUploading = false;
            errorMessage = t('imageUpload.errors.failedUpload') + ' (Timeout)';
            dispatch('error', { message: errorMessage });
          }, 30000); // 30 second timeout

          console.log('[ImageUpload] Emitting socket event:', eventName, {
            fileName: file.name,
            fileType: file.type,
            dataLength: base64.length
          });

          $socket.emit(eventName, {
            name: file.name,
            type: file.type,
            data: base64,
          }, (response: any) => {
            console.log('[ImageUpload] Socket response received:', {
              success: response?.success,
              hasError: !!response?.error,
              hasImageUrl: !!response?.imageUrl
            });
            if (timeout) {
              clearTimeout(timeout);
              timeout = null;
            }
            isUploading = false;
            if (response && response.success) {
              previewUrl = response.imageUrl;
              dispatch('upload', { imageUrl: response.imageUrl });
              errorMessage = '';
            } else {
              errorMessage = response?.error || t('imageUpload.errors.failedUpload');
              dispatch('error', { message: errorMessage });
            }
          });
        } catch (err: any) {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          isUploading = false;
          errorMessage = err.message || t('imageUpload.errors.failedProcess');
          dispatch('error', { message: errorMessage });
        }
      };

      reader.onerror = (e) => {
        console.error('[ImageUpload] FileReader error:', e);
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        isUploading = false;
        errorMessage = t('imageUpload.errors.failedRead');
        dispatch('error', { message: errorMessage });
      };

      reader.onabort = () => {
        console.warn('[ImageUpload] FileReader: Read aborted');
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        isUploading = false;
        errorMessage = t('imageUpload.errors.failedRead') + ' (Aborted)';
        dispatch('error', { message: errorMessage });
      };

      console.log('[ImageUpload] Calling reader.readAsDataURL()...');
      reader.readAsDataURL(file);
      console.log('[ImageUpload] reader.readAsDataURL() called, waiting for onload...');
    } catch (err: any) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
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
          <ChristmasLoading message={t('imageUpload.uploading')} variant="uploading" size="large" />
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
    margin: 0 auto 1rem;
  }
  
  /* Spinner uses global Christmas-themed style from app.css with .spinner-large class */

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

