import { describe, it, expect } from 'vitest';
import { groupConversationsByDate } from './dateGrouping';

describe('groupConversationsByDate', () => {
  const baseNow = new Date('2026-11-19T14:30:00.000Z');
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  it('returns empty array when conversations list is empty or invalid', () => {
    expect(groupConversationsByDate([])).toEqual([]);
    expect(groupConversationsByDate(null)).toEqual([]);
    expect(groupConversationsByDate(undefined)).toEqual([]);
  });

  it('groups pinned conversations under "Pinned" heading regardless of date', () => {
    const convs = [
      {
        conversationId: 'pinned-1',
        title: 'Pinned Old Chat',
        pinned: true,
        lastMessageAt: new Date(baseNow.getTime() - 30 * oneDay).toISOString(),
      },
      {
        conversationId: 'pinned-2',
        title: 'Pinned Today Chat',
        pinned: true,
        lastMessageAt: baseNow.toISOString(),
      },
    ];

    const result = groupConversationsByDate(convs, baseNow);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('pinned');
    expect(result[0].label).toBe('Pinned');
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items[0].conversationId).toBe('pinned-1');
    expect(result[0].items[1].conversationId).toBe('pinned-2');
  });

  it('groups items into Today, Yesterday, Previous 7 days, and Older', () => {
    const convs = [
      {
        conversationId: 'c-pinned',
        title: 'Important Strategy',
        pinned: true,
        lastMessageAt: baseNow.toISOString(),
      },
      {
        conversationId: 'c-today',
        title: 'Google Placement Drives',
        pinned: false,
        lastMessageAt: new Date(baseNow.getTime() - 2 * oneHour).toISOString(),
      },
      {
        conversationId: 'c-yesterday',
        title: 'DSA Practice',
        pinned: false,
        lastMessageAt: new Date(baseNow.getTime() - 28 * oneHour).toISOString(),
      },
      {
        conversationId: 'c-7days',
        title: 'Mock Interview Prep',
        pinned: false,
        lastMessageAt: new Date(baseNow.getTime() - 4 * oneDay).toISOString(),
      },
      {
        conversationId: 'c-older',
        title: 'Resume Review',
        pinned: false,
        lastMessageAt: new Date(baseNow.getTime() - 15 * oneDay).toISOString(),
      },
    ];

    const result = groupConversationsByDate(convs, baseNow);
    expect(result.map((g) => g.label)).toEqual([
      'Pinned',
      'Today',
      'Yesterday',
      'Previous 7 days',
      'Older',
    ]);

    expect(result.find((g) => g.key === 'today').items[0].conversationId).toBe('c-today');
    expect(result.find((g) => g.key === 'yesterday').items[0].conversationId).toBe('c-yesterday');
    expect(result.find((g) => g.key === 'last7days').items[0].conversationId).toBe('c-7days');
    expect(result.find((g) => g.key === 'older').items[0].conversationId).toBe('c-older');
  });

  it('omits headings that have no items', () => {
    const convs = [
      {
        conversationId: 'c-today-1',
        title: 'Today Chat',
        pinned: false,
        lastMessageAt: baseNow.toISOString(),
      },
    ];

    const result = groupConversationsByDate(convs, baseNow);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Today');
    expect(result[0].items).toHaveLength(1);
  });
});
