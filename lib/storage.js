class StorageManager {
      constructor() {
        this.state = new ChatState();
        this.db = null;
        this.useMemory = false;
        this.eventsBuffer = [];
        this.snapshotFrequency = SNAPSHOT_THRESHOLD;
        this.appliedSinceSnapshot = 0;
        this.storageKey = null;
        this.storageSalt = null;
        this.lastVerification = null;
        this.ready = this.init();
      }

      async init() {
        if (!('indexedDB' in window)) {
          this.useMemory = true;
          return;
        }

        try {
          this.db = await this.openDB();
          await this.prepareStorageSecurity();
          await this.rehydrate();
        } catch (error) {
          console.warn('IndexedDB unavailable, falling back to in-memory storage.', error);
          this.useMemory = true;
          this.db = null;
        }
      }

      async prepareStorageSecurity() {
        if (!(window?.crypto?.subtle)) {
          return;
        }

        try {
          this.storageKey = await this.deriveStorageKey();
        } catch (error) {
          console.warn('Storage encryption unavailable, continuing without it.', error);
          this.storageKey = null;
        }
      }

      openDB() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('secure-chat-eventlog', 1);

          request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains('events')) {
              const events = db.createObjectStore('events', { keyPath: 'id' });
              events.createIndex('at', 'at');
              events.createIndex('actor', 'actor');
              events.createIndex('op', 'op');
              events.createIndex('refs', 'refs', { multiEntry: true });
            }

            if (!db.objectStoreNames.contains('snapshots')) {
              const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' });
              snapshots.createIndex('at', 'at');
            }

            if (!db.objectStoreNames.contains('blobs')) {
              db.createObjectStore('blobs', { keyPath: 'id' });
            }
          };

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      async deriveStorageKey() {
        const passphrase = await this.promptForStoragePassphrase();
        if (!passphrase) {
          return null;
        }

        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          encoder.encode(passphrase),
          'PBKDF2',
          false,
          ['deriveBits']
        );

        const salt = await this.getOrCreateStorageSalt();
        const keyBits = await crypto.subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256'
          },
          keyMaterial,
          256
        );

        return crypto.subtle.importKey(
          'raw',
          keyBits,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );
      }

      async promptForStoragePassphrase() {
        const manager = window?.masterPasswordManager || null;
        if (!manager) {
          return null;
        }

        const existing = manager.getPassword();
        if (existing) {
          return existing;
        }

        const generated = manager.ensurePassword();
        manager.remember(generated);
        return generated;
      }

      async getOrCreateStorageSalt() {
        if (this.storageSalt instanceof Uint8Array && this.storageSalt.length > 0) {
          return this.storageSalt;
        }

        const storageKey = 'secure-chat-storage-salt';
        let saltBytes = null;

        try {
          const existing = localStorage.getItem(storageKey);
          if (existing) {
            saltBytes = this.base64ToBytes(existing);
          }
        } catch (error) {
          // Ignore storage access issues
        }

        if (!(saltBytes instanceof Uint8Array) || saltBytes.length !== 16) {
          saltBytes = crypto.getRandomValues(new Uint8Array(16));
          try {
            localStorage.setItem(storageKey, this.bytesToBase64(saltBytes));
          } catch (error) {
            // Persisting the salt is best-effort; ignore failures
          }
        }

        this.storageSalt = saltBytes;
        return saltBytes;
      }

      async encryptForStorage(data) {
        if (!this.storageKey) {
          return data;
        }

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        const encrypted = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, tagLength: 128 },
          this.storageKey,
          encoded
        );

        return {
          encrypted: true,
          iv: Array.from(iv),
          data: Array.from(new Uint8Array(encrypted))
        };
      }

      async decryptFromStorage(encryptedData) {
        if (!encryptedData?.encrypted) {
          return encryptedData;
        }

        if (!this.storageKey) {
          throw new Error('Storage key required for decryption');
        }

        const iv = new Uint8Array(encryptedData.iv || []);
        const payload = new Uint8Array(encryptedData.data || []);
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, tagLength: 128 },
          this.storageKey,
          payload
        );

        return JSON.parse(new TextDecoder().decode(decrypted));
      }

      bytesToBase64(bytes) {
        if (!(bytes instanceof Uint8Array)) {
          return '';
        }
        let binary = '';
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        return btoa(binary);
      }

      base64ToBytes(input) {
        if (typeof input !== 'string' || !input) {
          return null;
        }
        try {
          const binary = atob(input);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          return bytes;
        } catch (error) {
          return null;
        }
      }

      async wrapEventForStorage(event) {
        if (!this.storageKey) {
          return event;
        }

        const metadata = {
          id: event.id,
          at: event.at,
          actor: event.actor,
          op: event.op,
          refs: event.refs,
          semver: event.semver
        };

        const encryptedPayload = await this.encryptForStorage({
          payload: event.payload
        });

        return { ...metadata, encryptedPayload };
      }

      async unwrapEventFromStorage(record) {
        if (!record) {
          return null;
        }

        if (!record.encryptedPayload) {
          return record;
        }

        try {
          const decrypted = await this.decryptFromStorage(record.encryptedPayload);
          return {
            id: record.id,
            at: record.at,
            actor: record.actor,
            op: record.op,
            refs: record.refs,
            semver: record.semver,
            payload: decrypted?.payload
          };
        } catch (error) {
          console.warn('Failed to decrypt stored event.', error);
          return null;
        }
      }

      async readLatestSnapshotRecord() {
        if (this.useMemory || !this.db) {
          return { snapshot: null, stateData: null };
        }

        let snapshot = null;
        try {
          snapshot = await new Promise((resolve) => {
            const tx = this.db.transaction('snapshots', 'readonly');
            const store = tx.objectStore('snapshots');
            const index = store.index('at');
            const request = index.openCursor(null, 'prev');
            request.onsuccess = (event) => {
              const cursor = event.target.result;
              resolve(cursor ? cursor.value : null);
            };
            request.onerror = () => resolve(null);
          });
        } catch (error) {
          console.warn('Failed to read snapshot.', error);
        }

        if (!snapshot?.state) {
          return { snapshot: snapshot || null, stateData: null };
        }

        try {
          const stateData = snapshot.state?.encrypted
            ? await this.decryptFromStorage(snapshot.state)
            : snapshot.state;
          return { snapshot, stateData };
        } catch (error) {
          console.warn('Failed to decrypt snapshot state. Falling back to event log.', error);
          return { snapshot: null, stateData: null };
        }
      }

      async rehydrate() {
        if (this.useMemory || !this.db) {
          return;
        }

        const { snapshot, stateData } = await this.readLatestSnapshotRecord();
        const hasSnapshotState = Boolean(snapshot && stateData);

        if (hasSnapshotState) {
          try {
            this.state = reviveState(stateData);
          } catch (error) {
            console.warn('Failed to revive snapshot state. Replaying full event log.', error);
            this.state = new ChatState();
          }
        } else {
          this.state = new ChatState();
        }

        const replayAfter = hasSnapshotState ? (snapshot?.at ?? 0) : 0;
        let events = [];
        try {
          events = await this.loadEventsAfter(replayAfter);
        } catch (error) {
          console.warn('Failed to load events.', error);
          events = [];
        }

        events = (events || []).filter(Boolean);
        events.sort((a, b) => (a.at || 0) - (b.at || 0));
        for (const event of events) {
          await this.apply(event, { persist: false });
        }

        this.appliedSinceSnapshot = events.length % this.snapshotFrequency;
      }

      loadEventsAfter(at) {
        if (this.useMemory) {
          return Promise.resolve(this.eventsBuffer.filter(event => (event.at || 0) > at));
        }

        if (!this.db) {
          return Promise.resolve([]);
        }

        return new Promise((resolve) => {
          const tx = this.db.transaction('events', 'readonly');
          const index = tx.objectStore('events').index('at');
          const range = at ? IDBKeyRange.lowerBound(at, true) : null;
          const request = index.getAll(range);
          request.onsuccess = async () => {
            try {
              const raw = request.result || [];
              const events = await Promise.all(raw.map((record) => this.unwrapEventFromStorage(record)));
              resolve(events.filter(Boolean));
            } catch (error) {
              console.warn('Failed to load encrypted events.', error);
              resolve([]);
            }
          };
          request.onerror = () => resolve([]);
        });
      }

      async countEvents() {
        if (this.useMemory) {
          return this.eventsBuffer.length;
        }

        if (!this.db) {
          return 0;
        }

        return new Promise((resolve) => {
          try {
            const tx = this.db.transaction('events', 'readonly');
            const store = tx.objectStore('events');
            const request = store.count();
            request.onsuccess = () => resolve(request.result || 0);
            request.onerror = () => resolve(0);
          } catch (error) {
            console.warn('Failed to count events.', error);
            resolve(0);
          }
        });
      }

      summarizeState(state) {
        if (!(state instanceof ChatState)) {
          return {
            rooms: 0,
            messages: 0,
            byRoom: 0,
            reactions: 0
          };
        }

        return {
          rooms: state.rooms instanceof Map ? state.rooms.size : 0,
          messages: state.messages instanceof Map ? state.messages.size : 0,
          byRoom: state.byRoom instanceof Map ? state.byRoom.size : 0,
          reactions: state.reactions instanceof Map ? state.reactions.size : 0
        };
      }

      summarizeRawState(raw) {
        if (!raw || typeof raw !== 'object') {
          return {
            rooms: 0,
            messages: 0,
            byRoom: 0,
            reactions: 0
          };
        }

        return {
          rooms: Array.isArray(raw.rooms) ? raw.rooms.length : 0,
          messages: Array.isArray(raw.messages) ? raw.messages.length : 0,
          byRoom: Array.isArray(raw.byRoom) ? raw.byRoom.length : 0,
          reactions: Array.isArray(raw.reactions) ? raw.reactions.length : 0
        };
      }

      async verify() {
        try {
          await this.ready;
        } catch (error) {
          console.warn('Storage not ready for verification.', error);
          this.lastVerification = { ok: false, error: 'init-failed' };
          return false;
        }

        if (this.useMemory) {
          const tempState = new ChatState();
          const events = (this.eventsBuffer || []).filter(Boolean).sort((a, b) => (a.at || 0) - (b.at || 0));
          for (const event of events) {
            reduce(tempState, event);
          }

          const replayCounts = this.summarizeState(tempState);
          const currentCounts = this.summarizeState(this.state);
          const ok = ['rooms', 'messages', 'byRoom', 'reactions'].every((key) => replayCounts[key] === currentCounts[key]);

          this.lastVerification = {
            ok,
            snapshotAt: null,
            snapshotEventCount: null,
            eventsReplayed: events.length,
            totalEvents: events.length,
            snapshotCounts: { rooms: 0, messages: 0, byRoom: 0, reactions: 0 },
            replayCounts,
            currentCounts,
            mismatches: ok ? [] : ['state-divergence'],
            mode: 'memory'
          };

          return ok;
        }

        const { snapshot, stateData } = await this.readLatestSnapshotRecord();
        const hasSnapshotState = Boolean(snapshot && stateData);
        const baseRaw = stateData || null;
        const snapshotCounts = this.summarizeRawState(baseRaw);
        const verificationState = reviveState(baseRaw);
        const replayAfter = hasSnapshotState ? (snapshot?.at ?? 0) : 0;

        let events = [];
        try {
          events = await this.loadEventsAfter(replayAfter);
        } catch (error) {
          console.warn('Failed to load events for verification.', error);
          events = [];
        }

        events = (events || []).filter(Boolean);
        events.sort((a, b) => (a.at || 0) - (b.at || 0));
        for (const event of events) {
          reduce(verificationState, event);
        }

        const replayCounts = this.summarizeState(verificationState);
        const currentCounts = this.summarizeState(this.state);
        const totalEvents = await this.countEvents();

        const snapshotEventCount = typeof snapshot?.eventCountAtSnapshot === 'number'
          ? snapshot.eventCountAtSnapshot
          : null;

        const mismatches = [];
        ['rooms', 'messages', 'byRoom', 'reactions'].forEach((key) => {
          if (replayCounts[key] !== currentCounts[key]) {
            mismatches.push(key);
          }
        });

        if (snapshotEventCount !== null && Number.isFinite(totalEvents)) {
          const expectedEvents = snapshotEventCount + events.length;
          if (expectedEvents !== totalEvents) {
            mismatches.push('eventCount');
          }
        }

        const ok = mismatches.length === 0;

        this.lastVerification = {
          ok,
          snapshotAt: hasSnapshotState ? snapshot.at : null,
          snapshotEventCount,
          eventsReplayed: events.length,
          totalEvents: Number.isFinite(totalEvents) ? totalEvents : null,
          snapshotCounts,
          replayCounts,
          currentCounts,
          mismatches,
          mode: 'persistent'
        };

        return ok;
      }

      async apply(event, { persist = true } = {}) {
        if (!event) {
          return;
        }

        if (persist && !this.useMemory && this.db) {
          const record = await this.wrapEventForStorage(event);
          await new Promise((resolve, reject) => {
            const tx = this.db.transaction('events', 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.objectStore('events').put(record);
          });
        } else if (persist && this.useMemory) {
          this.eventsBuffer.push(event);
        }

        reduce(this.state, event);

        if (persist && !this.useMemory) {
          this.appliedSinceSnapshot += 1;
          if (this.appliedSinceSnapshot >= this.snapshotFrequency) {
            await this.snapshot();
          }
        }
      }

      async snapshot() {
        if (this.useMemory || !this.db) {
          return;
        }

        const rawState = serializeState(this.state);
        let eventCountAtSnapshot = 0;
        try {
          eventCountAtSnapshot = await this.countEvents();
        } catch (error) {
          eventCountAtSnapshot = 0;
        }
        const snapshot = {
          id: generateId('snap-'),
          at: Date.now(),
          state: this.storageKey ? await this.encryptForStorage(rawState) : rawState,
          eventCountAtSnapshot
        };

        await new Promise((resolve, reject) => {
          const tx = this.db.transaction('snapshots', 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore('snapshots').put(snapshot);
        });

        this.appliedSinceSnapshot = 0;
      }

      async saveRoom(roomId, { actorId = 'local', title = '' } = {}) {
        if (!roomId) {
          return;
        }

        await this.ready;
        const roomTitle = title || roomId;

        if (!this.state.rooms.has(roomId)) {
          await this.apply(makeEvent('RoomCreated', { roomId, title: roomTitle }, actorId, [`room:${roomId}`]));
        }

        await this.apply(makeEvent('UserJoinedRoom', { roomId, userId: actorId }, actorId, [`room:${roomId}`, `user:${actorId}`]));
      }

      async leaveRoom(roomId, { actorId = 'local' } = {}) {
        if (!roomId) {
          return;
        }

        await this.ready;
        await this.apply(makeEvent('UserLeftRoom', { roomId, userId: actorId }, actorId, [`room:${roomId}`, `user:${actorId}`]));
      }

      async recordMessage({
        roomId,
        text,
        type = 'them',
        actorId = 'system',
        userId,
        messageId,
        sentAt,
        sentAtLocal,
        receivedAt
      }) {
        if (!roomId || !text) {
          return null;
        }

        await this.ready;
        const id = messageId || generateId('msg-');
        const now = Date.now();
        const localSent = typeof sentAtLocal === 'number' ? sentAtLocal : (typeof sentAt === 'number' ? sentAt : now);
        const received = typeof receivedAt === 'number' ? receivedAt : now;
        const event = makeEvent(
          'MessagePosted',
          {
            roomId,
            messageId: id,
            userId: userId || actorId,
            text,
            type,
            sentAt: typeof sentAt === 'number' ? sentAt : now,
            sentAtLocal: localSent,
            receivedAt: received
          },
          actorId,
          [`room:${roomId}`, `msg:${id}`]
        );

        await this.apply(event);
        return this.state.messages.get(id);
      }

      async getRooms() {
        await this.ready;

        const rooms = Array.from(this.state.rooms.values()).map(room => ({
          id: room.id,
          title: room.title,
          time: room.lastActive || room.createdAt || 0
        }));

        rooms.sort((a, b) => (b.time || 0) - (a.time || 0));
        return rooms.slice(0, 5);
      }

      async getMessages(roomId) {
        await this.ready;

        if (!roomId) {
          return [];
        }

        const ids = this.state.byRoom.get(roomId) || [];
        const messages = [];

        for (const id of ids) {
          const message = this.state.messages.get(id);
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
      }
    }
