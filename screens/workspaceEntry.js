class WorkspaceEntryScreen {
  constructor(app, options = {}) {
    this.app = app;
    this.document = options.document || document;

    this.screens = {
      welcomeScreen: this.document.getElementById('welcomeScreen'),
      hostScreen: this.document.getElementById('hostScreen'),
      joinScreen: this.document.getElementById('joinScreen')
    };

    this.dom = {
      joinStatus: this.document.getElementById('joinStatus'),
      joinStatusDetail: this.document.getElementById('joinStatusDetail'),
      roomCode: this.document.getElementById('roomCode'),
      shareSection: this.document.getElementById('shareSection'),
      copyInviteBtn: this.document.getElementById('copyInviteBtn'),
      inviteLink: this.document.getElementById('inviteLink'),
      identityModal: this.document.getElementById('identityModal'),
      identityCreateForm: this.document.getElementById('identityCreateForm'),
      identitySuggestions: this.document.getElementById('identitySuggestions'),
      identityNameInput: this.document.getElementById('identityNameInput'),
      identityRefreshBtn: this.document.getElementById('identityRefreshBtn'),
      identityModeCreate: this.document.getElementById('identityModeCreate'),
      identityModeReturning: this.document.getElementById('identityModeReturning'),
      identityReturningForm: this.document.getElementById('identityReturningForm'),
      identityReturningPassword: this.document.getElementById('identityReturningPassword'),
      identityModalTitle: this.document.getElementById('identityModalTitle'),
      identityModalSubtitle: this.document.getElementById('identityModalSubtitle'),
      identityHint: this.document.getElementById('identityHint'),
      identityUseNew: this.document.getElementById('identityUseNew'),
      identityError: this.document.getElementById('identityError'),
      identitySubmitBtn: this.document.getElementById('identitySubmitBtn')
    };

    this.identityModal = this.dom.identityModal;
    this.identityModalResolve = null;
    this.identityModalMode = 'create';
    this.identitySelectedName = '';
    this.identityCurrentSuggestion = '';
    this.identityRejectedNames = [];
    this.pendingStoredIdentity = null;
  }

  initIdentityFlow() {
    this.identitySelectedName = '';
    this.identityCurrentSuggestion = '';
    this.identityRejectedNames = [];

    if (!this.identityModal) {
      return;
    }

    const createForm = this.dom.identityCreateForm;
    if (createForm) {
      createForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.app.handleIdentityCreateSubmit();
      });
    }

    const returningForm = this.dom.identityReturningForm;
    if (returningForm) {
      returningForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.app.handleIdentityReturningSubmit();
      });
    }

    if (this.dom.identityRefreshBtn) {
      this.dom.identityRefreshBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this.tryAnotherIdentitySuggestion({ resetHistory: true });
      });
      this.dom.identityRefreshBtn.classList.add('sr-only');
      this.dom.identityRefreshBtn.setAttribute('aria-hidden', 'true');
      this.dom.identityRefreshBtn.setAttribute('tabindex', '-1');
    }

    if (this.dom.identityNameInput) {
      this.dom.identityNameInput.addEventListener('input', () => {
        this.identitySelectedName = '';
        this.updateJoinButtonText();
        this.clearIdentityError();
        this.renderIdentitySelector();
      });
    }

    if (this.dom.identityReturningPassword) {
      this.dom.identityReturningPassword.addEventListener('input', () => this.clearIdentityError());
    }

    if (this.dom.identityUseNew) {
      this.dom.identityUseNew.addEventListener('click', () => {
        this.displayIdentityMode('create');
        this.refreshIdentitySuggestions(true);
      });
    }

    this.refreshIdentitySuggestions(true);
  }

  getScreenElement(screenId) {
    return this.screens[screenId] || null;
  }

  showScreen(screenId) {
    Object.values(this.screens).forEach((screen) => {
      if (screen) {
        screen.classList.remove('active');
      }
    });

    const target = this.getScreenElement(screenId);
    if (target) {
      target.classList.add('active');
      setTimeout(() => {
        const focusTarget = this.getDefaultFocusTarget(screenId);
        if (focusTarget && typeof focusTarget.focus === 'function') {
          focusTarget.focus();
        }
      }, 50);
    }
  }

  getDefaultFocusTarget(screenId) {
    if (screenId === 'welcomeScreen') {
      return this.screens.welcomeScreen?.querySelector('.action-buttons button');
    }
    if (screenId === 'hostScreen') {
      return this.dom.copyInviteBtn || this.dom.inviteLink;
    }
    if (screenId === 'joinScreen') {
      return this.dom.joinStatus;
    }
    return null;
  }

  showWelcome() {
    this.showScreen('welcomeScreen');
  }

  showHost({ roomId } = {}) {
    if (this.dom.roomCode && roomId) {
      this.dom.roomCode.textContent = roomId;
    }

    if (this.dom.shareSection) {
      this.dom.shareSection.style.display = 'none';
    }

    this.showScreen('hostScreen');
  }

  showJoin(statusMessage = 'Secure invite required', detailMessage = 'Open the one-time invite link shared with you to join.') {
    if (this.dom.joinStatus) {
      this.dom.joinStatus.textContent = statusMessage;
    }

    if (this.dom.joinStatusDetail) {
      this.dom.joinStatusDetail.textContent = detailMessage;
    }

    this.showScreen('joinScreen');
  }

  setShareSectionVisible(visible) {
    if (!this.dom.shareSection) {
      return;
    }

    this.dom.shareSection.style.display = visible ? '' : 'none';
  }

  updateRoomCode(roomId) {
    if (this.dom.roomCode) {
      this.dom.roomCode.textContent = roomId || 'Loading...';
    }
  }

  refreshIdentitySuggestions(force = false) {
    const container = this.dom.identitySuggestions;
    if (!container) {
      return;
    }

    if (force) {
      this.identityRejectedNames = [];
      if (!this.dom.identityNameInput?.value?.trim()) {
        this.identitySelectedName = '';
      }
      this.identityCurrentSuggestion = '';
    }

    if (!this.identityCurrentSuggestion) {
      this.identityCurrentSuggestion = this.generateUniqueIdentitySuggestion();
    }

    this.renderIdentitySelector();

    if (this.dom.identityNameInput && force) {
      this.dom.identityNameInput.value = '';
    }

    if (force) {
      this.updateJoinButtonText();
      this.clearIdentityError();
    }
  }

  getEmojiForName(name) {
    const avatar = this.computeAvatarFromName(name);
    return avatar.emoji;
  }

  computeAvatarFromName(name) {
    if (typeof name !== 'string' || !name) {
      return { emoji: '🙂', color: '#4A9FD5' };
    }

    const emojis = ['🦊', '🦁', '🐺', '🦅', '🐉', '🦉', '🐯', '🦜', '🦋', '🐠'];
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash |= 0;
    }
    hash = Math.abs(hash);
    const emoji = emojis[hash % emojis.length];
    const color = colors[Math.floor(hash / emojis.length) % colors.length];
    return { emoji, color };
  }

  getSelectedDisplayName() {
    const custom = this.dom.identityNameInput?.value?.trim();
    if (custom) {
      return custom;
    }
    return this.identitySelectedName || '';
  }

  updateJoinButtonText() {
    const button = this.dom.identitySubmitBtn;
    const subtitle = this.dom.identityModalSubtitle;
    const name = this.getSelectedDisplayName();
    if (button) {
      button.textContent = name ? `Join as ${name}` : 'Join Secure Room';
    }
    if (subtitle) {
      subtitle.textContent = name
        ? `Secure your seat as ${name}`
        : 'Secure your seat in this room';
    }
  }

  renderIdentitySelector() {
    const container = this.dom.identitySuggestions;
    if (!container) {
      return;
    }

    if (!Array.isArray(this.identityRejectedNames)) {
      this.identityRejectedNames = [];
    }

    if (!this.identityCurrentSuggestion) {
      this.identityCurrentSuggestion = this.generateUniqueIdentitySuggestion();
    }

    const suggestion = this.identityCurrentSuggestion || this.generateFallbackName();
    const avatar = this.computeAvatarFromName(suggestion);
    const isAccepted = this.identitySelectedName === suggestion;
    const rejected = Array.isArray(this.identityRejectedNames)
      ? this.identityRejectedNames
      : [];

    container.innerHTML = '';

    const card = this.document.createElement('div');
    card.className = 'name-selector-card';
    if (isAccepted) {
      card.dataset.state = 'selected';
    }

    const currentDisplay = this.document.createElement('div');
    currentDisplay.className = 'current-name-display';

    const avatarPreview = this.document.createElement('div');
    avatarPreview.className = 'avatar-preview';
    if (avatar?.color) {
      avatarPreview.style.background = avatar.color;
    }
    avatarPreview.textContent = avatar?.emoji || '🙂';

    const details = this.document.createElement('div');
    details.className = 'name-details';

    const nameHeading = this.document.createElement('h3');
    nameHeading.textContent = suggestion;

    const hint = this.document.createElement('p');
    hint.textContent = 'Unique secure identity';

    details.appendChild(nameHeading);
    details.appendChild(hint);

    const actions = this.document.createElement('div');
    actions.className = 'name-actions';

    const acceptBtn = this.document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'btn-primary';
    acceptBtn.textContent = isAccepted ? 'Selected' : 'Use this name';
    acceptBtn.disabled = isAccepted;
    acceptBtn.addEventListener('click', () => this.acceptCurrentIdentitySuggestion());

    const tryAnother = this.document.createElement('button');
    tryAnother.type = 'button';
    tryAnother.className = 'btn-secondary';
    tryAnother.textContent = 'Try another';
    tryAnother.addEventListener('click', () => this.tryAnotherIdentitySuggestion());

    const useCustom = this.document.createElement('button');
    useCustom.type = 'button';
    useCustom.className = 'btn-ghost';
    useCustom.textContent = 'Enter my own';
    useCustom.addEventListener('click', () => this.focusCustomIdentityInput());

    actions.appendChild(acceptBtn);
    actions.appendChild(tryAnother);
    actions.appendChild(useCustom);

    const history = this.document.createElement('div');
    history.className = 'rejected-history';

    if (!rejected.length) {
      history.hidden = true;
    } else {
      rejected.forEach((name) => {
        if (typeof name !== 'string' || !name) {
          return;
        }
        const pill = this.document.createElement('button');
        pill.type = 'button';
        pill.className = 'rejected-pill';
        pill.textContent = name;
        pill.setAttribute('aria-label', `Select ${name}`);
        pill.addEventListener('click', () => this.selectPreviousIdentitySuggestion(name));
        history.appendChild(pill);
      });
    }

    currentDisplay.appendChild(avatarPreview);
    currentDisplay.appendChild(details);

    card.appendChild(currentDisplay);
    card.appendChild(actions);
    card.appendChild(history);

    container.appendChild(card);
  }

  focusCustomIdentityInput() {
    const input = this.dom.identityNameInput;
    if (input) {
      input.focus();
      if (typeof input.select === 'function') {
        input.select();
      }
    }
    if (this.identitySelectedName) {
      this.identitySelectedName = '';
      this.updateJoinButtonText();
    }
    this.clearIdentityError();
    this.renderIdentitySelector();
  }

  acceptCurrentIdentitySuggestion() {
    const suggestion = this.identityCurrentSuggestion;
    if (!suggestion) {
      return;
    }
    this.identitySelectedName = suggestion;
    this.updateJoinButtonText();
    this.clearIdentityError();
    this.renderIdentitySelector();
  }

  tryAnotherIdentitySuggestion(options = {}) {
    const { resetHistory = false } = options;

    const previous = this.identityCurrentSuggestion;
    if (resetHistory) {
      this.identityRejectedNames = [];
    } else if (previous) {
      const list = this.identityRejectedNames.filter((name) => name !== previous);
      list.unshift(previous);
      this.identityRejectedNames = list.slice(0, 6);
    }

    let next = this.generateUniqueIdentitySuggestion();
    if (!next) {
      next = this.generateFallbackName();
    }
    this.identityCurrentSuggestion = next;

    if (previous && this.identitySelectedName === previous) {
      this.identitySelectedName = '';
    }

    this.renderIdentitySelector();
    this.updateJoinButtonText();
    this.clearIdentityError();
  }

  selectPreviousIdentitySuggestion(name) {
    if (typeof name !== 'string' || !name) {
      return;
    }

    this.identityRejectedNames = this.identityRejectedNames.filter((item) => item !== name);
    this.identityCurrentSuggestion = name;

    if (this.identitySelectedName !== name) {
      this.identitySelectedName = '';
      this.updateJoinButtonText();
    }

    this.clearIdentityError();
    this.renderIdentitySelector();
  }

  generateUniqueIdentitySuggestion() {
    const used = new Set();
    if (this.identityCurrentSuggestion) {
      used.add(this.identityCurrentSuggestion);
    }
    if (Array.isArray(this.identityRejectedNames)) {
      this.identityRejectedNames.forEach((name) => used.add(name));
    }
    if (this.identitySelectedName) {
      used.add(this.identitySelectedName);
    }

    const custom = this.dom.identityNameInput?.value?.trim();
    if (custom) {
      used.add(custom);
    }

    let candidate = '';
    const attempts = 12;
    for (let index = 0; index < attempts; index += 1) {
      candidate = this.app.nameGenerator?.generate();
      if (candidate && !used.has(candidate)) {
        return candidate;
      }
    }

    return candidate || this.generateFallbackName();
  }

  generateFallbackName() {
    const random = Math.floor(Math.random() * 900 + 100);
    return `SecureGuest-${random}`;
  }

  showIdentityError(message) {
    const error = this.dom.identityError;
    if (!error) {
      return;
    }
    error.textContent = message;
    error.hidden = false;
  }

  clearIdentityError() {
    const error = this.dom.identityError;
    if (error) {
      error.hidden = true;
      error.textContent = '';
    }
  }

  showIdentityModal(mode = 'create', options = {}) {
    if (!this.identityModal) {
      return Promise.resolve(null);
    }

    this.identityModalMode = mode;
    this.clearIdentityError();
    this.displayIdentityMode(mode, options?.stored);
    this.identityModal.hidden = false;

      if (mode === 'create') {
        this.refreshIdentitySuggestions(!this.identitySelectedName);
        setTimeout(() => this.dom.identityNameInput?.focus(), 0);
      } else {
        setTimeout(() => this.dom.identityReturningPassword?.focus(), 0);
      }

    return new Promise((resolve) => {
      this.identityModalResolve = resolve;
    });
  }

  displayIdentityMode(mode, stored) {
    const createSection = this.dom.identityModeCreate;
    const returningSection = this.dom.identityModeReturning;
    const title = this.dom.identityModalTitle;
    const hint = this.dom.identityHint;
    const subtitle = this.dom.identityModalSubtitle;
    this.clearIdentityError();

    if (mode === 'returning') {
      createSection?.setAttribute('hidden', '');
      returningSection?.removeAttribute('hidden');
      if (title) {
        title.textContent = 'Welcome Back';
      }
      if (subtitle) {
        subtitle.textContent = 'Unlock your saved identity to continue';
      }
      if (hint) {
        hint.textContent = stored?.hint || 'You';
      }
      this.pendingStoredIdentity = stored || null;
    } else {
      returningSection?.setAttribute('hidden', '');
      createSection?.removeAttribute('hidden');
      if (title) {
        title.textContent = 'Choose Your Identity';
      }
      if (subtitle) {
        subtitle.textContent = 'Secure your seat in this room';
      }
      this.pendingStoredIdentity = null;
      this.updateJoinButtonText();
    }
  }

  hideIdentityModal(result = null) {
    if (!this.identityModal) {
      return;
    }
    this.identityModal.hidden = true;
    if (typeof this.identityModalResolve === 'function') {
      this.identityModalResolve(result);
      this.identityModalResolve = null;
    }
  }

  resetIdentityState() {
    if (this.identityModal && !this.identityModal.hidden) {
      this.identityModal.hidden = true;
    }
    if (typeof this.identityModalResolve === 'function') {
      this.identityModalResolve(null);
      this.identityModalResolve = null;
    }
    this.identitySelectedName = '';
    this.identityCurrentSuggestion = '';
    this.identityRejectedNames = [];
  }

  getElement(key) {
    if (key in this.dom) {
      return this.dom[key];
    }
    if (key in this.screens) {
      return this.screens[key];
    }
    return null;
  }
}

window.WorkspaceEntryScreen = WorkspaceEntryScreen;
