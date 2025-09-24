const assert = require('assert');
const { ChatState, reduce } = require('../lib/state.js');
const { makeEvent, generateId, MESSAGE_CLOCK_SKEW_MS } = require('../lib/events.js');

const ITERATIONS = 25;
const MESSAGES_PER_RUN = 30;
const SKEW = typeof MESSAGE_CLOCK_SKEW_MS === 'number' ? MESSAGE_CLOCK_SKEW_MS : 2000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function displayTime(message) {
  const sentLocal = typeof message.sentAtLocal === 'number' ? message.sentAtLocal : message.at || 0;
  const received = typeof message.receivedAt === 'number' ? message.receivedAt : sentLocal;
  return Math.min(received, sentLocal + SKEW);
}

for (let run = 0; run < ITERATIONS; run += 1) {
  const state = new ChatState();
  const roomId = `room-${run}`;
  reduce(state, makeEvent('RoomCreated', { roomId, title: `Room ${run}` }, 'system', [`room:${roomId}`]));

  const events = [];
  for (let index = 0; index < MESSAGES_PER_RUN; index += 1) {
    const baseTime = 1700000000000 + run * 1000 + index * 50;
    const sentAt = baseTime + randomInt(-100, 100);
    const receivedAt = baseTime + randomInt(0, 200);
    const actor = index % 2 === 0 ? 'user-a' : 'user-b';
    const payload = {
      roomId,
      messageId: generateId('msg-'),
      userId: actor,
      text: `message-${run}-${index}`,
      type: actor === 'user-a' ? 'me' : 'them',
      sentAt,
      sentAtLocal: sentAt,
      receivedAt
    };
    events.push(makeEvent('MessagePosted', payload, actor, [`room:${roomId}`, `msg:${payload.messageId}`]));
  }

  shuffle(events).forEach((event) => reduce(state, event));

  const ids = state.byRoom.get(roomId) || [];
  assert.strictEqual(new Set(ids).size, ids.length, 'Duplicate message IDs detected');

  const messages = ids.map((id) => state.messages.get(id));
  let lastReceived = -Infinity;
  let lastDisplay = -Infinity;
  let expectedOrder = 1;
  messages.forEach((message) => {
    assert.ok(message, 'Missing message in state');
    assert.ok(message.localOrder >= expectedOrder, 'Local order did not increase');
    expectedOrder = message.localOrder + 1;
    assert.ok(message.receivedAt >= lastReceived, 'Received timestamps regressed');
    lastReceived = message.receivedAt;
    const time = displayTime(message);
    assert.ok(time >= lastDisplay, 'Display timestamps regressed');
    lastDisplay = time;
  });
}

console.log(`Fuzzed ${ITERATIONS} runs with ${MESSAGES_PER_RUN} messages each without invariant failures.`);
