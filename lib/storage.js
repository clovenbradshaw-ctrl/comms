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
        if (typeof window === 'undefined') {
          return null;
        }

        try {
          const cached = sessionStorage.getItem('secure-chat-storage-passphrase');
          if (cached && cached.trim()) {
            return cached.trim();
          }
        } catch (error) {
          // Session storage might be unavailable; ignore and fall through to prompt
        }

        const input = window.prompt(
          'Enter a passphrase to encrypt stored chat history (leave blank to disable encryption).',
          ''
        );

        if (typeof input !== 'string') {
          return null;
        }

        const trimmed = input.trim();
        if (!trimmed) {
          return null;
        }

        try {
          sessionStorage.setItem('secure-chat-storage-passphrase', trimmed);
        } catch (error) {
          // Ignore storage failures and continue without caching the passphrase
        }

        return trimmed;
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

      async rehydrate() {
        if (this.useMemory || !this.db) {
          return;
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

        if (snapshot?.state) {
          try {
            const stateData = snapshot.state?.encrypted
              ? await this.decryptFromStorage(snapshot.state)
              : snapshot.state;
            this.state = reviveState(stateData);
          } catch (error) {
            console.warn('Failed to decrypt snapshot state.', error);
            this.state = new ChatState();
          }
        } else {
          this.state = new ChatState();
        }

        const after = snapshot?.at ?? 0;
        let events = [];
        try {
          events = await this.loadEventsAfter(after);
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
        const snapshot = {
          id: generateId('snap-'),
          at: Date.now(),
          state: this.storageKey ? await this.encryptForStorage(rawState) : rawState
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

      async recordMessage({ roomId, text, type = 'them', actorId = 'system', userId, messageId }) {
        if (!roomId || !text) {
          return null;
        }

        await this.ready;
        const id = messageId || generateId('msg-');
        const event = makeEvent(
          'MessagePosted',
          { roomId, messageId: id, userId: userId || actorId, text, type },
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
