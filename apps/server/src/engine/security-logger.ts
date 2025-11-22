/**
 * Security event types
 */
export type SecurityEventType =
  | 'host_action'
  | 'admin_event'
  | 'validation_failure'
  | 'rate_limit_violation'
  | 'intent_rejected'
  | 'unauthorized_access'
  | 'suspicious_activity';

/**
 * Security event log entry
 */
export interface SecurityLogEntry {
  timestamp: number;
  type: SecurityEventType;
  roomCode?: string;
  socketId?: string;
  playerId?: string;
  action?: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * SecurityLogger logs critical security events.
 * 
 * Responsibilities:
 * - Log critical host actions
 * - Log admin events
 * - Log validation failures
 * - Log rate limit violations
 * - Structured logging format
 */
export class SecurityLogger {
  // In-memory log storage (in production, this would go to a proper logging system)
  private logs: SecurityLogEntry[] = [];
  
  // Maximum logs to keep in memory
  private maxLogs: number;
  
  // Log levels to capture
  private logLevels: Set<SecurityEventType>;

  constructor(maxLogs: number = 1000) {
    this.maxLogs = maxLogs;
    this.logLevels = new Set([
      'host_action',
      'admin_event',
      'validation_failure',
      'rate_limit_violation',
      'intent_rejected',
      'unauthorized_access',
      'suspicious_activity',
    ]);
  }

  /**
   * Log a security event
   */
  log(
    type: SecurityEventType,
    details: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    roomCode?: string,
    socketId?: string,
    playerId?: string,
    action?: string
  ): void {
    if (!this.logLevels.has(type)) {
      return; // Skip if not in log levels
    }

    const entry: SecurityLogEntry = {
      timestamp: Date.now(),
      type,
      roomCode,
      socketId,
      playerId,
      action,
      details,
      severity,
    };

    this.logs.push(entry);

    // Maintain max logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Format log message
    const logMessage = this.formatLogEntry(entry);
    
    // Log to console with appropriate level
    switch (severity) {
      case 'critical':
        console.error(`[SecurityLogger] CRITICAL: ${logMessage}`);
        break;
      case 'high':
        console.error(`[SecurityLogger] HIGH: ${logMessage}`);
        break;
      case 'medium':
        console.warn(`[SecurityLogger] MEDIUM: ${logMessage}`);
        break;
      case 'low':
        console.log(`[SecurityLogger] LOW: ${logMessage}`);
        break;
    }
  }

  /**
   * Log host action
   */
  logHostAction(
    action: string,
    roomCode: string,
    socketId: string,
    details: Record<string, any> = {}
  ): void {
    this.log('host_action', details, 'medium', roomCode, socketId, undefined, action);
  }

  /**
   * Log admin event
   */
  logAdminEvent(
    action: string,
    details: Record<string, any> = {},
    socketId?: string
  ): void {
    this.log('admin_event', details, 'high', undefined, socketId, undefined, action);
  }

  /**
   * Log validation failure
   */
  logValidationFailure(
    reason: string,
    roomCode?: string,
    socketId?: string,
    details: Record<string, any> = {}
  ): void {
    this.log(
      'validation_failure',
      { ...details, reason },
      'medium',
      roomCode,
      socketId
    );
  }

  /**
   * Log rate limit violation
   */
  logRateLimitViolation(
    roomCode: string,
    socketId: string,
    action?: string,
    details: Record<string, any> = {}
  ): void {
    this.log(
      'rate_limit_violation',
      details,
      'low',
      roomCode,
      socketId,
      undefined,
      action
    );
  }

  /**
   * Log intent rejection
   */
  logIntentRejection(
    intentId: string,
    reason: string,
    roomCode: string,
    playerId: string,
    details: Record<string, any> = {}
  ): void {
    this.log(
      'intent_rejected',
      { ...details, intentId, reason },
      'low',
      roomCode,
      undefined,
      playerId
    );
  }

  /**
   * Log unauthorized access attempt
   */
  logUnauthorizedAccess(
    action: string,
    roomCode: string,
    socketId: string,
    details: Record<string, any> = {}
  ): void {
    this.log(
      'unauthorized_access',
      { ...details, action },
      'high',
      roomCode,
      socketId
    );
  }

  /**
   * Log suspicious activity
   */
  logSuspiciousActivity(
    description: string,
    roomCode: string,
    socketId: string,
    details: Record<string, any> = {}
  ): void {
    this.log(
      'suspicious_activity',
      { ...details, description },
      'high',
      roomCode,
      socketId
    );
  }

  /**
   * Format log entry for output
   */
  private formatLogEntry(entry: SecurityLogEntry): string {
    const parts: string[] = [];
    
    if (entry.type) parts.push(`type=${entry.type}`);
    if (entry.roomCode) parts.push(`room=${entry.roomCode}`);
    if (entry.socketId) parts.push(`socket=${entry.socketId.substring(0, 8)}`);
    if (entry.playerId) parts.push(`player=${entry.playerId.substring(0, 8)}`);
    if (entry.action) parts.push(`action=${entry.action}`);
    
    const detailsStr = Object.entries(entry.details)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    if (detailsStr) parts.push(detailsStr);

    return parts.join(' ');
  }

  /**
   * Get logs filtered by criteria
   */
  getLogs(filters?: {
    type?: SecurityEventType;
    roomCode?: string;
    socketId?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    since?: number;
  }): SecurityLogEntry[] {
    let filtered = [...this.logs];

    if (filters) {
      if (filters.type) {
        filtered = filtered.filter(log => log.type === filters.type);
      }
      if (filters.roomCode) {
        filtered = filtered.filter(log => log.roomCode === filters.roomCode);
      }
      if (filters.socketId) {
        filtered = filtered.filter(log => log.socketId === filters.socketId);
      }
      if (filters.severity) {
        filtered = filtered.filter(log => log.severity === filters.severity);
      }
      if (filters.since) {
        filtered = filtered.filter(log => log.timestamp >= filters.since!);
      }
    }

    return filtered;
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Set log levels (which event types to log)
   */
  setLogLevels(types: SecurityEventType[]): void {
    this.logLevels = new Set(types);
  }
}

