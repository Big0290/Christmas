import {
  validateHandshake,
  validateIntent,
  validateIntentResult,
  validateEvent,
  validateStateSync,
  validateAck,
  validateReplayRequest,
  validateReplayResponse,
  validateFSMTransition,
  validateError,
  Message,
} from '@christmas/core';

/**
 * Validation result
 */
export interface ValidationResult<T = any> {
  valid: boolean;
  data?: T;
  error?: string;
  details?: any;
}

/**
 * MessageValidator validates all inbound messages using Zod schemas.
 * 
 * Responsibilities:
 * - Validate all inbound messages using schemas
 * - Return validation errors with details
 * - Log invalid messages for debugging
 */
export class MessageValidator {
  /**
   * Validate a message based on its type
   */
  validateMessage(data: unknown): ValidationResult<Message> {
    if (!data || typeof data !== 'object') {
      return {
        valid: false,
        error: 'Message must be an object',
      };
    }

    const message = data as any;

    // Determine message type and validate accordingly
    try {
      switch (message.type) {
        case 'handshake':
          return {
            valid: true,
            data: validateHandshake(data),
          };

        case 'intent':
          return {
            valid: true,
            data: validateIntent(data),
          };

        case 'intent_result':
          return {
            valid: true,
            data: validateIntentResult(data),
          };

        case 'event':
          return {
            valid: true,
            data: validateEvent(data),
          };

        case 'state_sync':
          return {
            valid: true,
            data: validateStateSync(data),
          };

        case 'ack':
          return {
            valid: true,
            data: validateAck(data),
          };

        case 'replay_request':
          return {
            valid: true,
            data: validateReplayRequest(data),
          };

        case 'replay_response':
          return {
            valid: true,
            data: validateReplayResponse(data),
          };

        case 'fsm_transition':
          return {
            valid: true,
            data: validateFSMTransition(data),
          };

        case 'error':
          return {
            valid: true,
            data: validateError(data),
          };

        default:
          return {
            valid: false,
            error: `Unknown message type: ${message.type}`,
            details: { receivedType: message.type },
          };
      }
    } catch (error: any) {
      // Zod validation error
      const errorMessage = error.message || 'Validation failed';
      const errorDetails = error.errors || error.issues || undefined;

      console.warn(`[MessageValidator] Validation failed:`, {
        type: message.type,
        error: errorMessage,
        details: errorDetails,
      });

      return {
        valid: false,
        error: errorMessage,
        details: errorDetails,
      };
    }
  }

  /**
   * Validate an intent message
   */
  validateIntent(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateIntent(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid intent',
        details: error.errors || error.issues,
      };
    }
  }

  /**
   * Validate an event message
   */
  validateEvent(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateEvent(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid event',
        details: error.errors || error.issues,
      };
    }
  }

  /**
   * Validate a state sync message
   */
  validateStateSync(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateStateSync(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid state sync',
        details: error.errors || error.issues,
      };
    }
  }

  /**
   * Validate an ACK message
   */
  validateAck(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateAck(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid ACK',
        details: error.errors || error.issues,
      };
    }
  }

  /**
   * Validate a replay request message
   */
  validateReplayRequest(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateReplayRequest(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid replay request',
        details: error.errors || error.issues,
      };
    }
  }

  /**
   * Validate a replay response message
   */
  validateReplayResponse(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateReplayResponse(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid replay response',
        details: error.errors || error.issues,
      };
    }
  }

  /**
   * Validate an FSM transition message
   */
  validateFSMTransition(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateFSMTransition(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid FSM transition',
        details: error.errors || error.issues,
      };
    }
  }

  /**
   * Validate an error message
   */
  validateError(data: unknown): ValidationResult {
    try {
      return {
        valid: true,
        data: validateError(data),
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Invalid error message',
        details: error.errors || error.issues,
      };
    }
  }
}

