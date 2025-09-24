const fs = require('fs');
const path = require('path');
const { ChatState, reduce } = require('../lib/state.js');

async function main() {
  const state = new ChatState();
  const logPath = path.join(__dirname, 'fixtures', 'replay.ndjson');
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  let applied = 0;
  for (const line of lines) {
    const event = JSON.parse(line);
    reduce(state, event);
    applied += 1;
  }

  const roomCount = state.rooms.size;
  const messageCount = state.messages.size;
  const roomMessages = state.byRoom.get('room-1') || [];

  if (roomCount !== 1) {
    throw new Error(`Expected 1 room, found ${roomCount}`);
  }

  if (messageCount !== 2) {
    throw new Error(`Expected 2 messages, found ${messageCount}`);
  }

  if (roomMessages.length !== 2) {
    throw new Error(`Expected 2 room messages, found ${roomMessages.length}`);
  }

  const firstMessage = state.messages.get(roomMessages[0]);
  const secondMessage = state.messages.get(roomMessages[1]);
  if (!firstMessage || !secondMessage) {
    throw new Error('Missing messages after replay');
  }

  if (!(secondMessage.receivedAt >= firstMessage.receivedAt)) {
    throw new Error('Message receipt times are not monotonic');
  }

  console.log('Replay summary:', {
    applied,
    rooms: roomCount,
    messages: messageCount,
    lastReceivedAt: state.lastReceivedAt,
    messageClock: state.messageClock,
    order: roomMessages.slice()
  });
}

main().catch((error) => {
  console.error('Replay test failed:', error);
  process.exitCode = 1;
});
