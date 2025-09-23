const subscribers = new Map();
let storageManager = null;

function initBus(storage) {
  storageManager = storage;
}

function subscribe(key, fn) {
  if (typeof fn !== 'function') {
    return () => {};
  }

  const list = subscribers.get(key) || [];
  list.push(fn);
  subscribers.set(key, list);

  return () => {
    const current = subscribers.get(key) || [];
    const next = current.filter((handler) => handler !== fn);
    if (next.length > 0) {
      subscribers.set(key, next);
    } else {
      subscribers.delete(key);
    }
  };
}

function notify(key, payload) {
  const list = subscribers.get(key);
  if (!list || list.length === 0) {
    return;
  }

  list.forEach((fn) => {
    try {
      fn(payload);
    } catch (error) {
      console.error('Subscriber error:', error);
    }
  });
}

const projection = {
  messagesByRoom(roomId) {
    if (!storageManager || !roomId) {
      return [];
    }

    const state = storageManager.state;
    const ids = state.byRoom.get(roomId) || [];
    const messages = [];

    for (const id of ids) {
      const message = state.messages.get(id);
      if (!message || message.redacted) {
        continue;
      }

      messages.push({
        id: message.id,
        content: message.text,
        type: message.type || 'them',
        at: message.at,
        editedAt: message.editedAt
      });
    }

    return messages;
  },

  roomList() {
    if (!storageManager) {
      return [];
    }

    const rooms = Array.from(storageManager.state.rooms.values()).map((room) => ({
      id: room.id,
      title: room.title,
      lastActive: room.lastActive || room.createdAt || 0
    }));

    rooms.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    return rooms;
  }
};

async function publish(event) {
  if (!storageManager || !event) {
    return;
  }

  await storageManager.apply(event);

  if (event.payload?.roomId) {
    const roomId = event.payload.roomId;
    notify(`messages:${roomId}`, projection.messagesByRoom(roomId));
  }

  notify('projection:roomList', projection.roomList());
}
