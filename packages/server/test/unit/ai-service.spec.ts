import { AiService, AI_PROVIDER_TOKEN, AI_CONFIG_TOKEN } from '../../src/ai/ai.service';
import { AiProvider, AiResponse, AiProviderError } from '../../src/ai/providers/ai-provider.interface';
import { AiConfig, AI_CONFIG_DEFAULTS } from '../../src/ai/ai-config';
import { AiUsageService } from '../../src/ai/usage/ai-usage.service';

describe('AiService', () => {
  let service: AiService;
  let mockProvider: jest.Mocked<AiProvider>;
  let mockUsageService: jest.Mocked<Pick<AiUsageService, 'checkRateLimit' | 'recordUsage'>>;
  let mockTenantConfigModel: any;

  const enabledConfig: AiConfig = {
    AI_ENABLED: true,
    AI_PROVIDER: 'ark',
    AI_API_URL: 'https://ark.test/api/v3',
    AI_API_KEY: 'test-key',
    AI_MODEL: 'doubao-seed',
    AI_TIMEOUT_MS: 10000,
    AI_RATE_LIMIT_GLOBAL: 1000,
  };

  const disabledConfig: AiConfig = {
    ...enabledConfig,
    AI_ENABLED: false,
  };

  const mockResponse: AiResponse = {
    id: 'resp-1',
    model: 'doubao-seed',
    content: 'AI response content',
    usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
  };

  function createService(config: AiConfig, provider: AiProvider | null = mockProvider) {
    return new AiService(
      config,
      provider,
      mockUsageService as any,
      mockTenantConfigModel,
    );
  }

  beforeEach(() => {
    mockProvider = {
      name: 'ark',
      complete: jest.fn().mockResolvedValue(mockResponse),
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    mockUsageService = {
      checkRateLimit: jest.fn().mockResolvedValue(true),
      recordUsage: jest.fn().mockResolvedValue(undefined),
    };
    mockTenantConfigModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve({ enabled: true, config: { rateLimit: 100 } }) }),
      }),
    };
    service = createService(enabledConfig);
  });

  it('should return null when AI_ENABLED=false', async () => {
    service = createService(disabledConfig);

    const result = await service.complete({
      tenantId: 'tenant-1',
      skillName: 'test',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }],
    });

    expect(result).toBeNull();
    expect(mockProvider.complete).not.toHaveBeenCalled();
  });

  it('should return null when no provider configured', async () => {
    service = createService(enabledConfig, null);

    const result = await service.complete({
      tenantId: 'tenant-1',
      skillName: 'test',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }],
    });

    expect(result).toBeNull();
  });

  it('should return AiResponse on success and record usage', async () => {
    const result = await service.complete({
      tenantId: 'tenant-1',
      skillName: 'test-skill',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'Analyze this.' }] },
        { role: 'user', content: [{ type: 'input_text', text: '{"topic":"data"}' }] },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.content).toBe('AI response content');
    expect(result!.usage.totalTokens).toBe(80);
    expect(mockUsageService.recordUsage).toHaveBeenCalledWith('tenant-1', 'test-skill', 80);
  });

  it('should return null on provider error and increment circuit breaker on retryable errors', async () => {
    mockProvider.complete.mockRejectedValue(
      new AiProviderError('Server error', 500, true),
    );

    const result = await service.complete({
      tenantId: 'tenant-1',
      skillName: 'test',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }],
    });

    expect(result).toBeNull();
  });

  it('should return null when circuit breaker is open (after consecutive failures)', async () => {
    mockProvider.complete.mockRejectedValue(
      new AiProviderError('Server error', 500, true),
    );

    for (let i = 0; i < AI_CONFIG_DEFAULTS.circuitBreakerThreshold; i++) {
      await service.complete({
        tenantId: 'tenant-1',
        skillName: 'test',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }],
      });
    }

    expect(service.isAvailable()).toBe(false);

    mockProvider.complete.mockResolvedValue(mockResponse);
    const result = await service.complete({
      tenantId: 'tenant-1',
      skillName: 'test',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }],
    });

    expect(result).toBeNull();
    expect(mockProvider.complete).toHaveBeenCalledTimes(AI_CONFIG_DEFAULTS.circuitBreakerThreshold);
  });

  it('should return null when tenant AI is disabled', async () => {
    mockTenantConfigModel.findOne = jest.fn().mockReturnValue({
      lean: () => ({ exec: () => Promise.resolve({ enabled: false }) }),
    });

    const result = await service.complete({
      tenantId: 'tenant-disabled',
      skillName: 'test',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }],
    });

    expect(result).toBeNull();
  });

  it('should return null when tenant rate limit exceeded', async () => {
    mockUsageService.checkRateLimit.mockResolvedValue(false);

    const result = await service.complete({
      tenantId: 'tenant-1',
      skillName: 'test',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'test' }] }],
    });

    expect(result).toBeNull();
    expect(mockProvider.complete).not.toHaveBeenCalled();
  });
});
