const EVENT_SEMVER = '1.0.0';
const SNAPSHOT_THRESHOLD = 200;
const MAX_MESSAGE_SIZE = 10000;
const MESSAGE_CLOCK_SKEW_MS = 2000;

const EVENT_OPERATIONS = Object.freeze({
  ROOM_CREATED: 'RoomCreated',
  USER_JOINED_ROOM: 'UserJoinedRoom',
  USER_LEFT_ROOM: 'UserLeftRoom',
  MESSAGE_POSTED: 'MessagePosted',
  MESSAGE_EDITED: 'MessageEdited',
  MESSAGE_REDACTED: 'MessageRedacted',
  REACTION_ADDED: 'ReactionAdded',
  REACTION_REMOVED: 'ReactionRemoved',
  MESSAGE_PINNED: 'MessagePinned',
  MESSAGE_UNPINNED: 'MessageUnpinned'
});

const GRAPH_NODE_TYPES = Object.freeze({
  ROOM: 'room',
  MESSAGE: 'message',
  USER: 'user'
});

const GRAPH_EDGE_TYPES = Object.freeze({
  MESSAGE_IN: 'message_in',
  MEMBER_OF: 'member_of',
  REACTED_WITH: 'reacted_with'
});

function generateId(prefix = '') {
  const core = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}${core}` : core;
}

function makeEvent(op, payload, actor, refs = []) {
  return {
    id: generateId('evt-'),
    op,
    payload,
    actor: actor || 'system',
    refs,
    at: Date.now(),
    semver: EVENT_SEMVER
  };
}

if (typeof window !== 'undefined') {
  window.EVENT_OPERATIONS = EVENT_OPERATIONS;
  window.GRAPH_NODE_TYPES = GRAPH_NODE_TYPES;
  window.GRAPH_EDGE_TYPES = GRAPH_EDGE_TYPES;
  window.MESSAGE_CLOCK_SKEW_MS = MESSAGE_CLOCK_SKEW_MS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    EVENT_SEMVER,
    SNAPSHOT_THRESHOLD,
    MAX_MESSAGE_SIZE,
    MESSAGE_CLOCK_SKEW_MS,
    EVENT_OPERATIONS,
    GRAPH_NODE_TYPES,
    GRAPH_EDGE_TYPES,
    generateId,
    makeEvent
  };
}
