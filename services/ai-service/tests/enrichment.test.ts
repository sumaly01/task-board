import { enrichTask } from '../src/claude/enrichment';

// Mock the entire Anthropic SDK so tests never make real API calls.
// The mock returns a predictable tool_use block matching the enrich_task schema.
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [
            {
              type: 'tool_use',
              name: 'enrich_task',
              input: {
                aiDescription:
                  'Investigate and fix the broken redirect that occurs on mobile devices after a successful login. Test across iOS Safari and Android Chrome.',
                aiPriority: 'HIGH',
                aiEffort: 'M',
                aiTags: ['bug', 'auth', 'mobile'],
              },
            },
          ],
        }),
      },
    })),
  };
});

// Mock the producer so tests never try to connect to Kafka
jest.mock('../src/kafka/producer', () => ({
  connectProducer: jest.fn().mockResolvedValue(undefined),
  publishEnriched: jest.fn().mockResolvedValue(undefined),
}));

describe('enrichTask', () => {
  it('returns structured enrichment data from Claude tool use', async () => {
    const result = await enrichTask('Fix broken login redirect on mobile');

    expect(result.aiDescription).toBeTruthy();
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.aiPriority);
    expect(['XS', 'S', 'M', 'L', 'XL']).toContain(result.aiEffort);
    expect(Array.isArray(result.aiTags)).toBe(true);
  });

  it('returns HIGH priority for a task title suggesting urgency', async () => {
    const result = await enrichTask('Fix broken login redirect on mobile');
    expect(result.aiPriority).toBe('HIGH');
  });

  it('returns effort estimate within valid enum', async () => {
    const result = await enrichTask('Fix broken login redirect on mobile');
    expect(['XS', 'S', 'M', 'L', 'XL']).toContain(result.aiEffort);
  });

  it('returns at most 4 tags', async () => {
    const result = await enrichTask('Fix broken login redirect on mobile');
    expect(result.aiTags.length).toBeLessThanOrEqual(4);
  });

  it('throws if Claude response contains no tool_use block', async () => {
    // Override the mock for this one test to simulate a bad response
    const Anthropic = jest.requireMock('@anthropic-ai/sdk').default;
    Anthropic.mockImplementationOnce(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'oops' }] }),
      },
    }));

    await expect(enrichTask('some task')).rejects.toThrow(
      '[claude] expected tool_use block in response but got none',
    );
  });
});
