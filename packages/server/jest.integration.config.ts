import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/test/integration/**/*.spec.ts', '**/test/e2e/**/*.spec.ts'],
  testTimeout: 30000,
};

export default config;
