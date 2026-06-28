/**
 * Unit tests for the agent DynamoDB item mappers.
 *
 * Pure (no AWS SDK / DynamoDB): they exercise the storage<->domain conversion
 * (isShared string<->boolean) and the dynamic partial-update builder that was
 * previously hand-inlined across ~100 lines of AgentsService.updateAgent.
 */

import { describe, it, expect } from '@jest/globals';
import { toDynamoAgent, fromDynamoAgent, buildAgentUpdateExpression, toItemAttr, fromItemAttr } from '../item.js';
import type { Agent } from '../../../../types/agent-types.js';
import type { UserId, AgentId } from '@moca/core';

const baseAgent: Agent = {
  userId: 'u1' as UserId,
  agentId: 'a1' as AgentId,
  name: 'n',
  description: 'd',
  systemPrompt: 's',
  enabledTools: [],
  scenarios: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  isShared: false,
  createdBy: 'u1',
};

const externalAgent: Agent = {
  userId: 'u1' as UserId,
  agentId: 'a1' as AgentId,
  name: 'n',
  description: 'd',
  systemPrompt: 's',
  enabledTools: [],
  scenarios: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  isShared: false,
  createdBy: 'u1',
  agentType: 'external_agentcore',
  externalRuntimeArn: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test',
  externalRuntimeRegion: 'us-east-1',
  streamFormat: 'strands',
};

describe('toDynamoAgent / fromDynamoAgent', () => {
  it('stringifies isShared on write and restores the boolean on read', () => {
    expect(toDynamoAgent({ ...baseAgent, isShared: true }).isShared).toBe('true');
    expect(toDynamoAgent({ ...baseAgent, isShared: false }).isShared).toBe('false');
    expect(fromDynamoAgent({ ...baseAgent, isShared: 'true' }).isShared).toBe(true);
    expect(fromDynamoAgent({ ...baseAgent, isShared: 'false' }).isShared).toBe(false);
  });
});

describe('buildAgentUpdateExpression', () => {
  const now = '2026-02-02T00:00:00Z';

  it('always stamps updatedAt even with an empty patch', () => {
    const { updateExpression, attributeValues, attributeNames } = buildAgentUpdateExpression(
      {},
      now
    );
    expect(updateExpression).toContain('#updatedAt = :updatedAt');
    expect(attributeValues[':updatedAt']).toBe(now);
    expect(attributeNames['#updatedAt']).toBe('updatedAt');
  });

  it('emits SET clauses only for provided fields', () => {
    const { updateExpression, attributeValues } = buildAgentUpdateExpression(
      { name: 'new-name', enabledTools: ['t1'] },
      now
    );
    expect(updateExpression).toContain('#name = :name');
    expect(updateExpression).toContain('#enabledTools = :enabledTools');
    expect(attributeValues[':name']).toBe('new-name');
    expect(attributeValues[':enabledTools']).toEqual(['t1']);
    expect(updateExpression).not.toContain(':description');
  });

  it('REMOVEs defaultStoragePath when set to empty string', () => {
    const { updateExpression, attributeNames, attributeValues } = buildAgentUpdateExpression(
      { defaultStoragePath: '' },
      now
    );
    expect(updateExpression).toMatch(/REMOVE .*#defaultStoragePath/);
    expect(attributeNames['#defaultStoragePath']).toBe('defaultStoragePath');
    expect(':defaultStoragePath' in attributeValues).toBe(false);
  });

  it('SETs defaultStoragePath when given a non-empty value', () => {
    const { updateExpression, attributeValues } = buildAgentUpdateExpression(
      { defaultStoragePath: '/work' },
      now
    );
    expect(updateExpression).toContain('#defaultStoragePath = :defaultStoragePath');
    expect(updateExpression).not.toContain('REMOVE');
    expect(attributeValues[':defaultStoragePath']).toBe('/work');
  });

  it('emits SET clauses for all four external runtime fields when present in patch', () => {
    const { updateExpression } = buildAgentUpdateExpression(
      {
        agentType: 'external_agentcore',
        externalRuntimeArn: 'arn:x',
        externalRuntimeRegion: 'us-east-1',
        streamFormat: 'other',
      },
      now
    );
    expect(updateExpression).toContain('#agentType = :agentType');
    expect(updateExpression).toContain('#externalRuntimeArn = :externalRuntimeArn');
    expect(updateExpression).toContain('#externalRuntimeRegion = :externalRuntimeRegion');
    expect(updateExpression).toContain('#streamFormat = :streamFormat');
  });

  it('does NOT include external runtime SET clauses when patch omits them', () => {
    const { updateExpression } = buildAgentUpdateExpression({}, now);
    expect(updateExpression).not.toContain(':agentType');
    expect(updateExpression).not.toContain(':externalRuntimeArn');
    expect(updateExpression).not.toContain(':externalRuntimeRegion');
    expect(updateExpression).not.toContain(':streamFormat');
  });
});

describe('toItemAttr / fromItemAttr round-trip', () => {
  it('preserves all four external runtime fields through marshal/unmarshal', () => {
    const roundTripped = fromItemAttr(toItemAttr(externalAgent));
    expect(roundTripped).toEqual(externalAgent);
  });

  it('leaves external runtime fields undefined for a native agent without them', () => {
    const item = toItemAttr(baseAgent);
    // Marshall with removeUndefinedValues=true drops absent optional fields
    expect('agentType' in item).toBe(false);
    const roundTripped = fromItemAttr(item);
    expect(roundTripped.agentType).toBeUndefined();
    expect(roundTripped.externalRuntimeArn).toBeUndefined();
    expect(roundTripped.externalRuntimeRegion).toBeUndefined();
    expect(roundTripped.streamFormat).toBeUndefined();
  });
});
