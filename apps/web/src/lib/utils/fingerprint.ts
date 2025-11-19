import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise: Promise<any> | null = null;

/**
 * Initialize FingerprintJS and get visitor ID
 * This uses browser fingerprinting to create a unique (but anonymous) identifier
 * No personally identifiable information is stored
 */
async function getVisitorId(): Promise<string> {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }

  const fp = await fpPromise;
  const result = await fp.get();
  return result.visitorId;
}

/**
 * Hash a string using SHA-256
 * @param data The string to hash
 * @returns Hex-encoded hash string
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get a hashed fingerprint for the current client
 * This is used to prevent duplicate submissions (unless multiple guesses are allowed)
 * @returns Promise resolving to a 64-character hex string
 */
export async function getClientFingerprint(): Promise<string> {
  try {
    const visitorId = await getVisitorId();
    // Hash the visitor ID for additional security/privacy
    const hashed = await sha256(visitorId);
    return hashed;
  } catch (error) {
    console.error('[Fingerprint] Error generating fingerprint:', error);
    // Fallback: generate a basic hash from available browser info
    const fallbackData = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset().toString(),
    ].join('|');
    return sha256(fallbackData);
  }
}

