// never send raw JSON text; always envelope then encrypt
// { kind: 'control'|'data', n?, sentAt?, control?: { type, ... }, data?: { text, ... } }

function initPeer(app, id) {
  if (app.peer) {
    app.peer.destroy();
  }

  const peer = new Peer(id, {
    debug: 2,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  app.peer = peer;

  peer.on('open', async (peerId) => {
    console.log('Connected to signaling server with ID:', peerId);

    if (app.isHost) {
      app.updateStatus('Waiting for peer...', 'connecting');
      app.addSystemMessage(`Room created: ${app.roomId}`);
      app.addSystemMessage('Waiting for someone to join...');
      app.setWaitingBanner(true, app.currentShareLink, 'Waiting for someone to join...');

      await app.persistRoom();
    } else {
      const conn = peer.connect(app.roomId);
      setupConnection(app, conn);
    }
  });

  if (app.isHost) {
    peer.on('connection', (conn) => {
      console.log('Peer connecting');
      app.addSystemMessage('Peer is connecting...');
      app.updateStatus('Peer connecting...', 'connecting');
      app.setWaitingBanner(true, app.currentShareLink, 'Someone is connecting...');
      setupConnection(app, conn);
    });
  }

  peer.on('error', async (err) => {
    console.error('Peer error:', err);

    if (err.type === 'peer-unavailable') {
      if (!app.isHost) {
        app.addSystemMessage('❌ Room not found. Make sure the room code is correct.');
        app.updateStatus('Error', '');
        setTimeout(() => app.showJoin(), 2000);
      }
      return;
    }

    if (err.type === 'unavailable-id') {
      if (!app.isHost) {
        return;
      }

      app.roomId = app.generateRoomId();
      if (app.dom.roomCode) {
        app.dom.roomCode.textContent = app.roomId;
      }
      if (app.dom.currentRoom) {
        app.dom.currentRoom.textContent = app.roomId;
      }
      if (typeof app.resetConversationState === 'function') {
        app.resetConversationState();
      }

      const password = app.dom.hostPassword?.value;
      if (password) {
        try {
          app.generateRoomSalt();
          await CryptoManager.loadStaticKeyFromPassword(password);
          app.keyExchangeComplete = false;
          app.sentKeyExchange = false;
          CryptoManager.clearECDHKeyPair();
          app.resetMessageCounters();
          app.updateFingerprintDisplay(null);
        } catch (error) {
          console.error('Failed to refresh room secrets after ID collision.', error);
          app.addSystemMessage('⚠️ Unable to refresh room security details. Please recreate the room.');
          app.disconnect();
          return;
        }

        const shareLink = app.generateShareLink(app.roomId);
        if (app.dom.shareLink) {
          app.dom.shareLink.textContent = shareLink;
          app.dom.shareLink.dataset.link = shareLink;
        }
        app.currentShareLink = shareLink;
        app.setWaitingBanner(true, shareLink, 'Share this link and send the password separately to your guest.');
      } else {
        app.currentShareLink = '';
        app.setWaitingBanner(false, '');
      }

      app.addSystemMessage(`Room ID was taken, new room: ${app.roomId}`);
      setTimeout(() => initPeer(app, app.roomId), 1000);
      return;
    }

    app.addSystemMessage(`❌ Connection error: ${err.type}`);
    app.updateStatus('Error', '');
  });
}

function setupConnection(app, conn) {
  const activeConn = conn || app.conn;
  if (!activeConn) {
    console.warn('No connection available to set up.');
    return;
  }

  app.conn = activeConn;
  app.remoteUserId = activeConn.peer || 'peer';

  activeConn.on('open', async () => {
    console.log('Peer connection established');
    app.updateStatus('Connected', 'connected');
    app.initHeartbeat();
    app.addSystemMessage('✅ Secure connection established!');
    const fingerprint = CryptoManager.getFingerprint();
    if (fingerprint) {
      app.updateFingerprintDisplay(fingerprint);
      app.addSystemMessage(`🔒 Verify code: ${fingerprint}`);
    } else {
      app.updateFingerprintDisplay(null);
    }

    if (!app.isHost) {
      app.showChat();
    }

    if (app.isHost) {
      app.setWaitingBanner(false);
    }

    await app.persistRoom();

    await app.startKeyExchange();
  });

  activeConn.on('data', async (data) => {
    if (data && typeof data.byteLength === 'number' && data.byteLength > MAX_MESSAGE_SIZE * 4) {
      app.addSystemMessage('⚠️ Received oversized message - rejected');
      return;
    }

    let payload;
    if (data instanceof Uint8Array) {
      payload = data;
    } else if (ArrayBuffer.isView(data) && data.buffer) {
      payload = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    } else if (data instanceof ArrayBuffer) {
      payload = new Uint8Array(data);
    } else if (typeof data === 'string') {
      payload = new TextEncoder().encode(data);
    } else {
      app.addSystemMessage('⚠️ Unsupported message format received');
      return;
    }

    if (app.heartbeat) {
      app.heartbeat.lastReceived = Date.now();
    }

    app.lastEncryptedHex = Array.from(payload)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const decrypted = await CryptoManager.decrypt(payload);
    if (!decrypted) {
      app.addSystemMessage('⚠️ Failed to decrypt message');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(decrypted);
    } catch (error) {
      console.warn('Invalid message payload received.', error);
      app.addSystemMessage('⚠️ Message integrity check failed. Ignoring message.');
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      app.addSystemMessage('⚠️ Message integrity check failed. Ignoring message.');
      return;
    }

    if (parsed.kind === 'control') {
      if (await app.handleControlMessage(parsed.control || {}, parsed)) {
        return;
      }
      return;
    }

    if (parsed.kind !== 'data') {
      console.warn('Unsupported payload kind received:', parsed.kind);
      return;
    }

    const sequence = Number(parsed?.n);
    const text = typeof parsed?.data?.text === 'string' ? parsed.data.text : '';
    const remoteSentAt = typeof parsed?.sentAt === 'number' ? parsed.sentAt : null;
    const receiptTime = typeof app.getMonotonicTime === 'function'
      ? app.getMonotonicTime()
      : Date.now();
    const localSentAt = remoteSentAt ?? receiptTime;

    if (!Number.isInteger(sequence) || sequence < 1) {
      app.addSystemMessage('⚠️ Message integrity check failed. Ignoring message.');
      return;
    }

    if (sequence < app.expectedIncomingMessageNumber) {
      app.addSystemMessage('⚠️ Duplicate message ignored.');
      return;
    }

    if (sequence > app.expectedIncomingMessageNumber) {
      app.addSystemMessage('⚠️ Message out of order or replayed. Discarded.');
      return;
    }

    if (!text) {
      app.expectedIncomingMessageNumber += 1;
      app.addSystemMessage('⚠️ Empty or invalid message received.');
      return;
    }

    app.expectedIncomingMessageNumber += 1;

    if (app.roomId) {
      const messageId = generateId('msg-');
      const actor = app.remoteUserId || 'peer';
      app.cacheEncryptedMessage(messageId, payload);
      await publish(
        makeEvent(
          'MessagePosted',
          {
            roomId: app.roomId,
            messageId,
            userId: actor,
            text,
            type: 'them',
            sentAt: remoteSentAt ?? localSentAt,
            sentAtLocal: localSentAt,
            receivedAt: receiptTime
          },
          actor,
          [`room:${app.roomId}`, `msg:${messageId}`]
        )
      ).catch((error) => console.warn('Failed to record incoming message.', error));
    }
  });

    activeConn.on('close', () => {
      app.conn = null;
      app.remoteUserId = null;
      app.updateFingerprintDisplay(null);
      app.resetMessageCounters();
      app.stopHeartbeat();
      app.keyExchangeComplete = false;
      app.sentKeyExchange = false;
      CryptoManager.clearECDHKeyPair();
      const systemMessage = '👋 Peer disconnected';
      app.addSystemMessage(systemMessage);
      if (typeof app.showToast === 'function') {
        app.showToast(app.isHost ? 'Guest disconnected' : 'Disconnected from host', app.isHost ? 'warning' : 'error');
      }
      if (app.isHost) {
        app.updateStatus('Waiting for peer...', 'connecting');
        const waitingMessage = app.currentShareLink
          ? 'Your guest disconnected. Share the link to invite someone else.'
          : 'Your guest disconnected. Share the invite link when you are ready.';
        const linkForBanner = app.currentShareLink || app.dom?.chatShareLink?.dataset?.link || '';
        app.setWaitingBanner(true, linkForBanner, waitingMessage);
      } else {
        app.updateStatus('Disconnected', '');
      }
    });

  activeConn.on('error', (err) => {
    console.error('Connection error:', err);
    app.updateFingerprintDisplay(null);
    app.stopHeartbeat();
    app.resetMessageCounters();
    app.keyExchangeComplete = false;
    app.sentKeyExchange = false;
    CryptoManager.clearECDHKeyPair();
    app.addSystemMessage('⚠️ Connection error occurred');
    if (typeof app.showToast === 'function') {
      app.showToast('Connection error', 'error');
    }
    if (app.isHost) {
      app.updateStatus('Waiting for peer...', 'connecting');
      const linkForBanner = app.currentShareLink || app.dom?.chatShareLink?.dataset?.link || '';
      app.setWaitingBanner(true, linkForBanner, 'Connection issue. Waiting for guest…');
    } else {
      app.updateStatus('Disconnected', '');
    }
  });
}
