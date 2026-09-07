import fs from 'node:fs';
import path from 'node:path';
import { processForumMessage } from './lib/pipeline/process-message.ts';

const safeMemoryRoot = path.resolve(process.env.MEMORY_DATA_DIR ?? 'D:/TEMP/forum-memory-v2');
const memoryPath = path.join(safeMemoryRoot, 'weight-management-memory.json');

async function main() {
  fs.mkdirSync(safeMemoryRoot, { recursive: true });

  const productionPath = path.resolve('data', 'weight-management-memory.json');
  if (path.resolve(memoryPath) === path.resolve(productionPath)) {
    throw new Error('Diagnostic script refused to target the production forensic memory file.');
  }

  fs.writeFileSync(memoryPath, '{}');

  const first = await processForumMessage('Akşamları çok fazla yiyorum.', 'weight_management', {
    userId: 'USER-A',
    sessionId: 'WM-001',
    conversationHistory: [],
  });

  const second = await processForumMessage('Dün yine çok yedim.', 'weight_management', {
    userId: 'USER-A',
    sessionId: 'WM-002',
    conversationHistory: [
      {
        role: 'user',
        content: 'Akşamları çok fazla yiyorum.',
        timestamp: '2026-08-16T10:00:00.000Z',
        messageId: first.input.message.messageId,
      },
      {
        role: 'assistant',
        content: first.reply.text,
        timestamp: first.processing.completedAt,
        replyId: first.reply.replyId,
      },
    ],
  });

  await processForumMessage('Akşamları çok fazla yiyorum.', 'weight_management', {
    userId: 'USER-B',
    sessionId: 'WM-003',
    conversationHistory: [],
  });

  const fourth = await processForumMessage('Ben aslında akşamları artık daha iyi kontrol ediyorum.', 'weight_management', {
    userId: 'USER-A',
    sessionId: 'WM-003',
    conversationHistory: [
      {
        role: 'user',
        content: 'Dün yine çok yedim.',
        timestamp: '2026-08-16T12:00:00.000Z',
        messageId: 'MSG-900001',
      },
      {
        role: 'assistant',
        content: second.reply.text,
        timestamp: '2026-08-16T12:05:00.000Z',
        replyId: 'AIR-900001',
      },
    ],
  });

  const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));

  const result = {
    aFactCount: memory['USER-A']?.facts?.length ?? 0,
    aGoalCount: memory['USER-A']?.goals?.length ?? 0,
    aPatternCount: memory['USER-A']?.patterns?.length ?? 0,
    bFactCount: memory['USER-B']?.facts?.length ?? 0,
    sameUserRecall: /previous|earlier|before|context|mentioned|we talked/i.test(second.reply.text),
    conflictPrefersCurrent: /better control|currently|now/i.test(fourth.reply.text),
    userIsolation: !(memory['USER-B']?.facts?.length ?? 0),
    secondReply: second.reply.text,
    fourthReply: fourth.reply.text,
  };

  console.log(JSON.stringify(result, null, 2));
}

await main();
