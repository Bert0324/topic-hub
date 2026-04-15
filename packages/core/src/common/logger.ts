export interface TopicHubLogger {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, trace?: string, context?: string): void;
  debug(message: string, context?: string): void;
}

export type LoggerFactory = (context: string) => TopicHubLogger;

export const defaultLoggerFactory: LoggerFactory = (context: string): TopicHubLogger => ({
  log: (message: string) => console.log(`[${context}] ${message}`),
  warn: (message: string) => console.warn(`[${context}] ${message}`),
  error: (message: string, trace?: string) => {
    console.error(`[${context}] ${message}`);
    if (trace) console.error(trace);
  },
  debug: (message: string) => console.debug(`[${context}] ${message}`),
});
