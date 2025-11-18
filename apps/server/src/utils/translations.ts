import type { TriviaQuestion, PriceItem, NaughtyPrompt } from '@christmas/core';

export type Language = 'en' | 'fr';

/**
 * Translate a trivia question to the specified language.
 * Falls back to English if translation is not available.
 */
export function translateQuestion(
  question: TriviaQuestion,
  language: Language = 'en'
): TriviaQuestion {
  // If English or no translations available, return as-is
  if (language === 'en' || !question.translations) {
    return question;
  }

  // Get translation for requested language
  const translation = question.translations[language];
  if (!translation) {
    // Fallback to English
    return question;
  }

  // Return translated question, preserving all other fields
  return {
    ...question,
    question: translation.question,
    answers: translation.answers,
  };
}

/**
 * Translate a price item to the specified language.
 * Falls back to English if translation is not available.
 */
export function translatePriceItem(
  item: PriceItem,
  language: Language = 'en'
): PriceItem {
  // If English or no translations available, return as-is
  if (language === 'en' || !item.translations) {
    return item;
  }

  // Get translation for requested language
  const translation = item.translations[language];
  if (!translation) {
    // Fallback to English
    return item;
  }

  // Return translated item, preserving all other fields
  return {
    ...item,
    name: translation.name,
    description: translation.description,
  };
}

/**
 * Translate a naughty prompt to the specified language.
 * Falls back to English if translation is not available.
 */
export function translatePrompt(
  prompt: NaughtyPrompt,
  language: Language = 'en'
): NaughtyPrompt {
  // If English or no translations available, return as-is
  if (language === 'en' || !prompt.translations) {
    return prompt;
  }

  // Get translation for requested language
  const translation = prompt.translations[language];
  if (!translation) {
    // Fallback to English
    return prompt;
  }

  // Return translated prompt, preserving all other fields
  return {
    ...prompt,
    prompt: translation.prompt,
  };
}

