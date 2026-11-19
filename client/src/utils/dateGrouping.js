/**
 * Date Grouping Helper for Conversation Threads
 *
 * Groups conversations into headings:
 * 1. Pinned (all pinned conversations)
 * 2. Today (active since 00:00:00 today)
 * 3. Yesterday (active during yesterday)
 * 4. Previous 7 days (active between 2 and 7 days ago)
 * 5. Older (active more than 7 days ago)
 */

export function groupConversationsByDate(conversations = [], now = new Date()) {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return [];
  }

  const nowDate = new Date(now);
  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  ).getTime();

  const oneDayMs = 24 * 60 * 60 * 1000;
  const startOfYesterday = startOfToday - oneDayMs;
  const startOf7Days = startOfToday - 7 * oneDayMs;

  const groups = [
    { key: 'pinned', label: 'Pinned', items: [] },
    { key: 'today', label: 'Today', items: [] },
    { key: 'yesterday', label: 'Yesterday', items: [] },
    { key: 'last7days', label: 'Previous 7 days', items: [] },
    { key: 'older', label: 'Older', items: [] },
  ];

  for (const c of conversations) {
    if (!c) continue;

    if (c.pinned) {
      groups[0].items.push(c);
      continue;
    }

    const itemTime = new Date(
      c.lastMessageAt || c.updatedAt || c.createdAt || now
    ).getTime();

    if (itemTime >= startOfToday) {
      groups[1].items.push(c);
    } else if (itemTime >= startOfYesterday) {
      groups[2].items.push(c);
    } else if (itemTime >= startOf7Days) {
      groups[3].items.push(c);
    } else {
      groups[4].items.push(c);
    }
  }

  // Only return non-empty groups
  return groups.filter((g) => g.items.length > 0);
}
