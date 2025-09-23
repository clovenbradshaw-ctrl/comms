class ChatState {
  constructor() {
    this.rooms = new Map();
    this.messages = new Map();
    this.byRoom = new Map();
    this.reactions = new Map();
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
      const { roomId, messageId, userId, text, type: messageType } = payload;
      const room = ensureRoom(state, roomId);
      const message = {
        id: messageId,
        roomId,
        userId,
        text,
        type: messageType || 'them',
        at: event.at,
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
    }))
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

  (raw.messages || []).forEach(message => {
    state.messages.set(message.id, { ...message });
    ensureRoom(state, message.roomId);
  });

  (raw.reactions || []).forEach(entry => {
    const emojiMap = new Map();
    (entry.emojis || []).forEach(({ emoji, users }) => {
      emojiMap.set(emoji, new Set(users || []));
    });
    state.reactions.set(entry.messageId, emojiMap);
  });

  return state;
}
