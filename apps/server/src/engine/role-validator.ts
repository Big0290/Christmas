export type ClientRole = 'player' | 'host-control' | 'host-display';

/**
 * Action whitelist per role
 */
const ROLE_ACTIONS: Record<ClientRole, string[]> = {
  'player': [
    'trivia_answer',
    'emoji_pick',
    'vote',
    'price_guess',
    'bingo_mark',
    'gift_move',
    'workshop_upgrade',
  ],
  'host-control': [
    'start_game',
    'end_game',
    'pause_game',
    'resume_game',
    'kick_player',
    'update_settings',
    'jukebox_control',
  ],
  'host-display': [], // Display has no actions, read-only
};

/**
 * RoleValidator validates roles and permissions on every message.
 * 
 * Responsibilities:
 * - Validate roles on every message
 * - Check permissions for actions
 * - Support: player, host-control, host-display
 * - Role-based action whitelist
 */
export class RoleValidator {
  /**
   * Validate that a role has permission to perform an action
   */
  hasPermission(role: ClientRole, action: string): boolean {
    const allowedActions = ROLE_ACTIONS[role];
    
    // host-display has no actions (read-only)
    if (role === 'host-display') {
      return false;
    }

    // Check if action is in whitelist
    return allowedActions.includes(action);
  }

  /**
   * Validate role is valid
   */
  isValidRole(role: string): role is ClientRole {
    return ['player', 'host-control', 'host-display'].includes(role);
  }

  /**
   * Validate role and action combination
   */
  validateRoleAndAction(role: string, action: string): {
    valid: boolean;
    error?: string;
  } {
    // Check role is valid
    if (!this.isValidRole(role)) {
      return {
        valid: false,
        error: `Invalid role: ${role}`,
      };
    }

    // Check permission
    if (!this.hasPermission(role, action)) {
      return {
        valid: false,
        error: `Role ${role} does not have permission for action ${action}`,
      };
    }

    return { valid: true };
  }

  /**
   * Check if role can perform host actions
   */
  isHostRole(role: ClientRole): boolean {
    return role === 'host-control' || role === 'host-display';
  }

  /**
   * Check if role can control (not just display)
   */
  isControlRole(role: ClientRole): boolean {
    return role === 'host-control';
  }

  /**
   * Check if role is read-only (display)
   */
  isReadOnlyRole(role: ClientRole): boolean {
    return role === 'host-display';
  }

  /**
   * Get allowed actions for a role
   */
  getAllowedActions(role: ClientRole): string[] {
    return [...ROLE_ACTIONS[role]];
  }

  /**
   * Add custom action to role whitelist (for extensibility)
   */
  addActionToRole(role: ClientRole, action: string): void {
    if (!ROLE_ACTIONS[role].includes(action)) {
      ROLE_ACTIONS[role].push(action);
    }
  }

  /**
   * Remove action from role whitelist
   */
  removeActionFromRole(role: ClientRole, action: string): void {
    const index = ROLE_ACTIONS[role].indexOf(action);
    if (index > -1) {
      ROLE_ACTIONS[role].splice(index, 1);
    }
  }
}

