/**
 * @topichub/core — Configuration contract
 *
 * This file defines the public configuration types for TopicHub.create().
 * This is a DESIGN CONTRACT — not compilable source code.
 */

import type { Connection } from 'mongoose';

// --- Logger Port ---

export interface TopicHubLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, trace?: string, context?: string): void;
  debug(message: string, context?: string): void;
}

export type LoggerFactory = (context: string) => TopicHubLogger;

// --- AI Provider Config ---

export interface AiProviderConfig {
  provider: 'ark' | (string & {});
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxRetries?: number;
}

// --- Encryption Config ---

export interface EncryptionConfig {
  masterKey: string;
}

// --- Main Config ---

export interface TopicHubConfig {
  /**
   * Existing Mongoose connection from the host application.
   * Mutually exclusive with `mongoUri`.
   */
  mongoConnection?: Connection;

  /**
   * MongoDB URI for standalone usage (core manages connection lifecycle).
   * Mutually exclusive with `mongoConnection`.
   */
  mongoUri?: string;

  /** Absolute path to the skills directory */
  skillsDir: string;

  /** AI provider configuration. Omit to disable AI features. */
  ai?: AiProviderConfig;

  /** Custom logger factory. Defaults to console-based logger. */
  logger?: LoggerFactory;

  /** Encryption configuration for tenant API keys. */
  encryption?: EncryptionConfig;
}
