class ChatState {
  constructor() {
    this.rooms = new Map();
    this.messages = new Map();
    this.byRoom = new Map();
    this.reactions = new Map();
    this.messageClock = 0;
    this.lastReceivedAt = 0;
  }
}

function ensureRoom(state, roomId, defaults = {}) {
  if (!state.rooms.has(roomId)) {
    state.rooms.set(roomId, {
      id: roomId,
      title: defaults.title || roomId,
      members: new Set(defaults.members || []),
      pinned: new Set(defaults.pinned || []),
      lastActive: defaults.lastActive ?? 0,
      createdAt: defaults.createdAt ?? defaults.lastActive ?? 0
    });
  }
  if (!state.byRoom.has(roomId)) {
    state.byRoom.set(roomId, Array.isArray(defaults.messageOrder) ? [...defaults.messageOrder] : []);
  }
  const room = state.rooms.get(roomId);
  if (defaults.title && !room.title) {
    room.title = defaults.title;
  }
  if (typeof defaults.lastActive === 'number' && !room.lastActive) {
    room.lastActive = defaults.lastActive;
  }
  if (typeof defaults.createdAt === 'number' && !room.createdAt) {
    room.createdAt = defaults.createdAt;
  }
  return room;
}

function reduce(state, event) {
  const type = event?.op;
  const payload = event?.payload || {};

  switch (type) {
    case 'RoomCreated': {
      const { roomId, title } = payload;
      const room = ensureRoom(state, roomId, { title, createdAt: event.at, lastActive: event.at });
      room.title = title;
      room.createdAt = event.at;
      room.lastActive = event.at;
      break;
    }
    case 'UserJoinedRoom': {
      const { roomId, userId } = payload;
      const room = ensureRoom(state, roomId);
      room.members.add(userId);
      room.lastActive = Math.max(room.lastActive || 0, event.at || 0);
      break;
    }
    case 'UserLeftRoom': {
      const { roomId, userId } = payload;
      const room = ensureRoom(state, roomId);
      room.members.delete(userId);
      room.lastActive = Math.max(room.lastActive || 0, event.at || 0);
      break;
    }
    case 'MessagePosted': {
      const {
        roomId,
        messageId,
        userId,
        text,
        type: messageType,
        sentAt,
        sentAtLocal,
        receivedAt
      } = payload;
      const room = ensureRoom(state, roomId);
      const now = Date.now();
      const received = typeof receivedAt === 'number' && Number.isFinite(receivedAt)
        ? receivedAt
        : (typeof event.receivedAt === 'number' ? event.receivedAt : now);
      const rawSentLocal = typeof sentAtLocal === 'number' && Number.isFinite(sentAtLocal)
        ? sentAtLocal
        : (typeof sentAt === 'number' && Number.isFinite(sentAt) ? sentAt : event.at);
      const messageSentAt = typeof sentAt === 'number' && Number.isFinite(sentAt)
        ? sentAt
        : event.at;
      const monotonicReceived = received <= state.lastReceivedAt
        ? state.lastReceivedAt + 1
        : received;
      state.lastReceivedAt = monotonicReceived;
      state.messageClock = (state.messageClock || 0) + 1;
      const message = {
        id: messageId,
        roomId,
        userId,
        text,
        type: messageType || 'them',
        at: messageSentAt,
        sentAt: messageSentAt,
        sentAtLocal: rawSentLocal,
        receivedAt: monotonicReceived,
        localOrder: state.messageClock,
        editedAt: undefined,
        redacted: false
      };
      state.messages.set(messageId, message);
      const order = state.byRoom.get(roomId) || [];
      order.push(messageId);
      state.byRoom.set(roomId, order);
      room.lastActive = Math.max(room.lastActive || 0, event.at || 0);
      break;
    }
    case 'MessageEdited': {
      const { messageId, newText } = payload;
      const message = state.messages.get(messageId);
      if (message) {
        message.text = newText;
        message.editedAt = event.at;
        const room = ensureRoom(state, message.roomId);
        room.lastActive = Math.max(room.lastActive || 0, event.at || 0);
      }
      break;
    }
    case 'MessageRedacted': {
      const { messageId } = payload;
      const message = state.messages.get(messageId);
      if (message) {
        message.redacted = true;
        const room = ensureRoom(state, message.roomId);
        room.lastActive = Math.max(room.lastActive || 0, event.at || 0);
      }
      break;
    }
    case 'ReactionAdded': {
      const { messageId, userId, emoji } = payload;
      const emojiMap = state.reactions.get(messageId) || new Map();
      const users = emojiMap.get(emoji) || new Set();
      users.add(userId);
      emojiMap.set(emoji, users);
      state.reactions.set(messageId, emojiMap);
      break;
    }
    case 'ReactionRemoved': {
      const { messageId, userId, emoji } = payload;
      const emojiMap = state.reactions.get(messageId);
      if (emojiMap?.has(emoji)) {
        const users = emojiMap.get(emoji);
        users.delete(userId);
        if (users.size === 0) {
          emojiMap.delete(emoji);
        }
        if (emojiMap.size === 0) {
          state.reactions.delete(messageId);
        }
      }
      break;
    }
    case 'MessagePinned': {
      const { roomId, messageId } = payload;
      const room = ensureRoom(state, roomId);
      room.pinned.add(messageId);
      room.lastActive = Math.max(room.lastActive || 0, event.at || 0);
      break;
    }
    case 'MessageUnpinned': {
      const { roomId, messageId } = payload;
      const room = ensureRoom(state, roomId);
      room.pinned.delete(messageId);
      room.lastActive = Math.max(room.lastActive || 0, event.at || 0);
      break;
    }
    default:
      break;
  }
}

function serializeState(state) {
  return {
    rooms: Array.from(state.rooms.values()).map(room => ({
      id: room.id,
      title: room.title,
      members: Array.from(room.members),
      pinned: Array.from(room.pinned),
      lastActive: room.lastActive || 0,
      createdAt: room.createdAt || 0
    })),
    messages: Array.from(state.messages.values()).map(message => ({ ...message })),
    byRoom: Array.from(state.byRoom.entries()).map(([roomId, ids]) => [roomId, [...ids]]),
    reactions: Array.from(state.reactions.entries()).map(([messageId, emojiMap]) => ({
      messageId,
      emojis: Array.from(emojiMap.entries()).map(([emoji, users]) => ({
        emoji,
        users: Array.from(users)
      }))
    })),
    messageClock: state.messageClock || 0,
    lastReceivedAt: state.lastReceivedAt || 0
  };
}

function reviveState(raw) {
  const state = new ChatState();
  if (!raw) {
    return state;
  }

  (raw.rooms || []).forEach(roomData => {
    state.rooms.set(roomData.id, {
      id: roomData.id,
      title: roomData.title,
      members: new Set(roomData.members || []),
      pinned: new Set(roomData.pinned || []),
      lastActive: roomData.lastActive || 0,
      createdAt: roomData.createdAt || 0
    });
  });

  (raw.byRoom || []).forEach(([roomId, ids]) => {
    ensureRoom(state, roomId);
    state.byRoom.set(roomId, Array.isArray(ids) ? [...ids] : []);
  });

  let maxOrder = 0;
  let maxReceived = 0;

  (raw.messages || []).forEach(message => {
    const cloned = { ...message };
    if (typeof cloned.localOrder === 'number' && Number.isFinite(cloned.localOrder)) {
      maxOrder = Math.max(maxOrder, cloned.localOrder);
    }
    if (typeof cloned.receivedAt === 'number' && Number.isFinite(cloned.receivedAt)) {
      maxReceived = Math.max(maxReceived, cloned.receivedAt);
    }
    state.messages.set(cloned.id, cloned);
    ensureRoom(state, message.roomId);
  });

  (raw.reactions || []).forEach(entry => {
    const emojiMap = new Map();
    (entry.emojis || []).forEach(({ emoji, users }) => {
      emojiMap.set(emoji, new Set(users || []));
    });
    state.reactions.set(entry.messageId, emojiMap);
  });

  if (typeof raw.messageClock === 'number' && Number.isFinite(raw.messageClock)) {
    state.messageClock = Math.max(raw.messageClock, maxOrder);
  } else {
    state.messageClock = maxOrder;
  }

  if (typeof raw.lastReceivedAt === 'number' && Number.isFinite(raw.lastReceivedAt)) {
    state.lastReceivedAt = Math.max(raw.lastReceivedAt, maxReceived);
  } else {
    state.lastReceivedAt = maxReceived;
  }

  return state;
}

const GraphShim = (() => {
  const emitted = [];

  const nodeHandlers = new Map();
  const edgeHandlers = new Map();

  const skewAllowance = typeof MESSAGE_CLOCK_SKEW_MS === 'number' ? MESSAGE_CLOCK_SKEW_MS : 2000;

  function getEventHelpers() {
    if (typeof makeEvent === 'function' && typeof generateId === 'function') {
      return {
        makeEvent,
        generateId,
        operations: typeof EVENT_OPERATIONS === 'object' ? EVENT_OPERATIONS : null
      };
    }

    if (typeof require === 'function') {
      try {
        const events = require('./events.js');
        return {
          makeEvent: events.makeEvent,
          generateId: events.generateId,
          operations: events.EVENT_OPERATIONS
        };
      } catch (error) {
        return { makeEvent: null, generateId: null, operations: null };
      }
    }

    return { makeEvent: null, generateId: null, operations: null };
  }

  function emitEvent(event) {
    if (!event) {
      return null;
    }

    emitted.push(event);

    try {
      console.info('[graph] emitting', event);
    } catch (error) {
      // ignore logging issues
    }

    if (typeof publish === 'function') {
      publish(event);
    } else {
      console.info('[graph] event prepared', event);
    }

    return event;
  }

  nodeHandlers.set('message', (props = {}) => {
    const helpers = getEventHelpers();
    const makeEventFn = helpers.makeEvent;
    const generateIdFn = helpers.generateId;
    const operations = helpers.operations;
    if (typeof makeEventFn !== 'function') {
      console.warn('[graph] makeEvent unavailable');
      return null;
    }
    const roomId = props.roomId;
    const text = props.text;
    if (!roomId || !text) {
      throw new Error('message node requires roomId and text');
    }
    const messageId = props.messageId || (typeof generateIdFn === 'function' ? generateIdFn('msg-') : `msg-${Date.now()}`);
    const actor = props.userId || props.actorId || 'graph';
    const sentAtLocal = typeof props.sentAtLocal === 'number' ? props.sentAtLocal : Date.now();
    const sentAt = typeof props.sentAt === 'number' ? props.sentAt : sentAtLocal;
    const receivedAt = typeof props.receivedAt === 'number' ? props.receivedAt : sentAtLocal;

    return makeEventFn(
      operations?.MESSAGE_POSTED || 'MessagePosted',
      {
        roomId,
        messageId,
        userId: actor,
        text,
        type: props.type || 'them',
        sentAt,
        sentAtLocal,
        receivedAt
      },
      actor,
      [`room:${roomId}`, `msg:${messageId}`]
    );
  });

  edgeHandlers.set('message_in', (props = {}) => {
    const helpers = getEventHelpers();
    const makeEventFn = helpers.makeEvent;
    const operations = helpers.operations;
    if (typeof makeEventFn !== 'function') {
      console.warn('[graph] makeEvent unavailable');
      return null;
    }
    if (!props.from || !props.to) {
      throw new Error('message_in edge requires from and to');
    }

    return makeEventFn(
      operations?.MESSAGE_POSTED || 'MessagePosted',
      {
        roomId: props.to,
        messageId: props.nodeId || props.from,
        userId: props.userId || props.actorId || 'graph',
        text: props.text || '',
        type: props.type || 'them',
        sentAt: props.sentAt,
        sentAtLocal: props.sentAtLocal,
        receivedAt: props.receivedAt
      },
      props.actorId || 'graph',
      [`room:${props.to}`, `msg:${props.nodeId || props.from}`]
    );
  });

  return {
    addNode(type, props) {
      const handler = nodeHandlers.get(type);
      if (!handler) {
        console.warn(`[graph] Unknown node type: ${type}`);
        return null;
      }
      const event = handler(props);
      return emitEvent(event);
    },

    addEdge(type, from, to, props = {}) {
      const handler = edgeHandlers.get(type);
      if (!handler) {
        console.warn(`[graph] Unknown edge type: ${type}`);
        return null;
      }
      const event = handler({ ...props, from, to });
      return emitEvent(event);
    },

    registerNodeType(type, handler) {
      if (typeof handler === 'function') {
        nodeHandlers.set(type, handler);
      }
    },

    registerEdgeType(type, handler) {
      if (typeof handler === 'function') {
        edgeHandlers.set(type, handler);
      }
    },

    getEmitted() {
      return emitted.slice();
    },

    skewAllowance
  };
})();

if (typeof window !== 'undefined') {
  window.Graph = GraphShim;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ChatState,
    ensureRoom,
    reduce,
    serializeState,
    reviveState,
    Graph: GraphShim
  };
}
