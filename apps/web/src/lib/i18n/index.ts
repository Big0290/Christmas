import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import en from './en.json';
import fr from './fr.json';

export type Language = 'en' | 'fr';

const translations = {
  en,
  fr,
};

// Get initial language from localStorage or browser preference
function getInitialLanguage(): Language {
  if (!browser) return 'en';
  
  // Check localStorage first
  const saved = localStorage.getItem('christmas_language');
  if (saved === 'en' || saved === 'fr') {
    return saved;
  }
  
  // Fall back to browser language
  const browserLang = navigator.language.split('-')[0].toLowerCase();
  if (browserLang === 'fr') {
    return 'fr';
  }
  
  return 'en';
}

// Create language store
export const language = writable<Language>(getInitialLanguage());

// Save language preference to localStorage
language.subscribe((lang) => {
  if (browser) {
    localStorage.setItem('christmas_language', lang);
  }
});

// Translation function
export function t(key: string, params?: Record<string, string | number>): string {
  const currentLang = get(language);
  const translation = translations[currentLang];
  
  // Navigate nested keys (e.g., "common.button.join")
  const keys = key.split('.');
  let value: any = translation;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to English if key not found
      value = translations.en;
      for (const k2 of keys) {
        if (value && typeof value === 'object' && k2 in value) {
          value = value[k2];
        } else {
          return key; // Return key if not found in English either
        }
      }
      break;
    }
  }
  
  // If value is a string, replace parameters
  if (typeof value === 'string') {
    if (params) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }
    return value;
  }
  
  // If not found, return the key
  return key;
}

// Reactive translation store - returns a translation function that updates when language changes
export const translate = derived(language, ($language) => {
  return (key: string, params?: Record<string, string | number>): string => {
    const translation = translations[$language];
    
    // Navigate nested keys (e.g., "common.button.join")
    const keys = key.split('.');
    let value: any = translation;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if key not found
        value = translations.en;
        for (const k2 of keys) {
          if (value && typeof value === 'object' && k2 in value) {
            value = value[k2];
          } else {
            return key; // Return key if not found in English either
          }
        }
        break;
      }
    }
    
    // If value is a string, replace parameters
    if (typeof value === 'string') {
      if (params) {
        return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
          return params[paramKey]?.toString() || match;
        });
      }
      return value;
    }
    
    // If not found, return the key
    return key;
  };
});

// Helper to get nested translation
export function getTranslation(lang: Language, key: string): string {
  const translation = translations[lang];
  const keys = key.split('.');
  let value: any = translation;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }
  
  return typeof value === 'string' ? value : key;
}

