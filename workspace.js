const WORKSPACE_STORAGE_PREFIX = 'workspace_';
const ACTIVE_WORKSPACE_KEY = 'workspace_active';
const LOCAL_PROFILE_KEY = 'workspace_profile';

function generateSecureId() {
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function generateRandomSegment(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => {
    const index = byte % 36;
    return index.toString(36).toUpperCase();
  }).join('').slice(0, length);
}

function generateWorkspaceId() {
  const segments = [];
  while (segments.length < 3) {
    segments.push(generateRandomSegment(4));
  }
  return `ws-${segments.join('-')}`;
}

function generateInviteCode() {
  return generateRandomSegment(6);
}

function getLocalWorkspaceProfile() {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && parsed.name) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Unable to read local workspace profile', error);
  }

  const fallbackName = window.App?.localIdentity?.displayName
    || window.App?.profile?.displayName
    || 'Me';
  const profile = {
    id: `member-${generateRandomSegment(8).toLowerCase()}`,
    name: fallbackName,
    created: Date.now()
  };

  try {
    localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.warn('Unable to persist local workspace profile', error);
  }

  return profile;
}

function getWorkspaceStorageKey(workspaceId) {
  return `${WORKSPACE_STORAGE_PREFIX}${workspaceId}`;
}

function readWorkspace(workspaceId) {
  if (!workspaceId) {
    return null;
  }

  const key = getWorkspaceStorageKey(workspaceId);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id === workspaceId) {
      return ensureWorkspaceShape(parsed);
    }
  } catch (error) {
    console.warn('Unable to parse workspace record', error);
  }

  return null;
}

function ensureWorkspaceShape(workspace) {
  const safeWorkspace = { ...workspace };
  safeWorkspace.members = Array.isArray(workspace.members) ? workspace.members : [];
  safeWorkspace.channels = Array.isArray(workspace.channels) && workspace.channels.length
    ? workspace.channels
    : [{ id: 'general', name: 'General', created: workspace.created || Date.now() }];
  safeWorkspace.joinRules = workspace.joinRules || 'open';
  safeWorkspace.type = workspace.type || 'public';
  safeWorkspace.requests = Array.isArray(workspace.requests) ? workspace.requests : [];
  safeWorkspace.inviteCode = typeof workspace.inviteCode === 'string' && workspace.inviteCode.trim()
    ? workspace.inviteCode.trim().toUpperCase()
    : generateInviteCode();
  return safeWorkspace;
}

function listWorkspaces() {
  const workspaces = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (typeof key === 'string' && key.startsWith(WORKSPACE_STORAGE_PREFIX)) {
      const rawId = key.slice(WORKSPACE_STORAGE_PREFIX.length);
      const workspace = readWorkspace(rawId);
      if (workspace) {
        workspaces.push(workspace);
      }
    }
  }
  workspaces.sort((a, b) => (b.created || 0) - (a.created || 0));
  return workspaces;
}

function saveWorkspace(workspace) {
  const key = getWorkspaceStorageKey(workspace.id);
  const payload = JSON.stringify(workspace);
  localStorage.setItem(key, payload);
}

function updateWorkspace(workspaceId, updater) {
  const existing = readWorkspace(workspaceId);
  if (!existing) {
    return null;
  }
  const next = ensureWorkspaceShape({ ...existing, ...updater(existing) });
  saveWorkspace(next);
  return next;
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) {
    return;
  }
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.dataset.open = 'true';
  modal.focus?.();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) {
    return;
  }
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  delete modal.dataset.open;

  if (id === 'findWorkspaceModal') {
    const searchInput = document.getElementById('workspaceSearch');
    if (searchInput && searchInput._workspaceHandler) {
      searchInput.removeEventListener('input', searchInput._workspaceHandler);
      delete searchInput._workspaceHandler;
    }
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action="close-modal"]');
  if (!button) {
    return;
  }
  const target = button.getAttribute('data-target');
  if (target) {
    closeModal(target);
  }
});

function clearModal(form) {
  if (!form) {
    return;
  }
  form.reset?.();
  const message = form.querySelector('.modal-error');
  if (message) {
    message.textContent = '';
    message.hidden = true;
  }
}

function showCreateWorkspaceModal() {
  const modal = document.getElementById('createWorkspaceModal');
  const form = document.getElementById('createWorkspaceForm');
  if (!modal || !form) {
    return;
  }

  clearModal(form);
  openModal('createWorkspaceModal');

  if (form._workspaceSubmitHandler) {
    form.removeEventListener('submit', form._workspaceSubmitHandler);
  }

  const handleSubmit = event => {
    event.preventDefault();
    const nameInput = form.querySelector('#workspaceName');
    const descInput = form.querySelector('#workspaceDesc');
    const typeInput = form.querySelector('#workspaceType');
    const joinRulesInput = form.querySelector('#workspaceJoinRules');
    const message = form.querySelector('.modal-error');

    const name = nameInput?.value.trim() || '';
    const description = descInput?.value.trim() || '';
    const type = typeInput?.value === 'private' ? 'private' : 'public';
    const joinRules = ['open', 'request', 'invite'].includes(joinRulesInput?.value)
      ? joinRulesInput.value
      : 'open';

    if (!name) {
      if (message) {
        message.textContent = 'Workspace name is required.';
        message.hidden = false;
      }
      nameInput?.focus();
      return;
    }

    if (name.length > 50) {
      if (message) {
        message.textContent = 'Workspace name must be 50 characters or fewer.';
        message.hidden = false;
      }
      nameInput?.focus();
      return;
    }

    if (description.length > 200) {
      if (message) {
        message.textContent = 'Description must be 200 characters or fewer.';
        message.hidden = false;
      }
      descInput?.focus();
      return;
    }

    let workspaceId = generateWorkspaceId();
    while (readWorkspace(workspaceId)) {
      workspaceId = generateWorkspaceId();
    }

    const inviteCode = generateInviteCode();
    const creatorPeerId = window.App?.peer?.id || null;
    const profile = getLocalWorkspaceProfile();

    const workspace = ensureWorkspaceShape({
      id: workspaceId,
      name,
      description,
      type,
      joinRules,
      created: Date.now(),
      creatorPeerId,
      members: [
        {
          id: profile.id,
          name: profile.name,
          peerId: creatorPeerId,
          role: 'owner',
          joined: Date.now()
        }
      ],
      channels: [
        { id: 'general', name: 'General', created: Date.now() }
      ],
      inviteCode,
      requests: []
    });

    try {
      saveWorkspace(workspace);
    } catch (error) {
      console.warn('Unable to save workspace', error);
      if (message) {
        message.textContent = 'Unable to save workspace. Storage quota may be full.';
        message.hidden = false;
      }
      return;
    }

    closeModal('createWorkspaceModal');
    window.workspaceApp?.renderLanding();
    updateWorkspaceStats();
    enterWorkspace(workspace.id);
  };

  form._workspaceSubmitHandler = handleSubmit;
  form.addEventListener('submit', handleSubmit);
}

function renderWorkspaceDiscoveryList(searchTerm = '') {
  const listEl = document.getElementById('workspaceList');
  if (!listEl) {
    return;
  }
  listEl.innerHTML = '';

  const all = listWorkspaces();
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const inviteSearch = normalizedSearch.replace(/[^a-z0-9]/gi, '').toUpperCase();

  const filtered = all.filter(workspace => {
    const matchesTerm = !normalizedSearch
      || workspace.name.toLowerCase().includes(normalizedSearch)
      || workspace.id.toLowerCase().includes(normalizedSearch)
      || (workspace.inviteCode && workspace.inviteCode.toLowerCase().includes(normalizedSearch));

    if (!normalizedSearch) {
      return workspace.type === 'public';
    }

    if (workspace.type === 'public') {
      return matchesTerm;
    }

    if (inviteSearch && workspace.inviteCode === inviteSearch) {
      return true;
    }

    return matchesTerm;
  });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'workspace-empty-result';
    empty.textContent = 'No workspaces found. Try a different search or request an invite code.';
    listEl.appendChild(empty);
    return;
  }

  filtered.forEach(workspace => {
    const card = document.createElement('article');
    card.className = 'discovery-card';
    card.dataset.workspaceId = workspace.id;
    card.innerHTML = `
      <header class="discovery-card__header">
        <div class="discovery-card__icon">${workspace.name.charAt(0).toUpperCase()}</div>
        <div>
          <h3>${workspace.name}</h3>
          <p>${workspace.description || 'No description provided.'}</p>
        </div>
      </header>
      <div class="discovery-card__meta">
        <span>${workspace.type === 'public' ? 'Public' : 'Private'}</span>
        <span>${formatJoinRule(workspace.joinRules)}</span>
        <span>${workspace.members.length} members</span>
      </div>
      <div class="discovery-card__actions">
        ${renderDiscoveryAction(workspace, inviteSearch)}
      </div>
    `;

    bindDiscoveryCardActions(card, workspace, inviteSearch);
    listEl.appendChild(card);
  });
}

function renderDiscoveryAction(workspace, inviteSearch) {
  if (workspace.joinRules === 'request') {
    return `
      <button class="btn-primary" data-action="request">Request to Join</button>
      <form class="request-form" data-role="request" hidden>
        <input type="text" name="name" placeholder="Your name" required maxlength="50">
        <textarea name="message" placeholder="Introduce yourself" maxlength="250"></textarea>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Send Request</button>
          <button type="button" class="btn-secondary" data-action="cancel-request">Cancel</button>
        </div>
        <p class="form-hint">An admin will review your request.</p>
      </form>
    `;
  }

  if (workspace.joinRules === 'invite') {
    const prefill = inviteSearch && inviteSearch === workspace.inviteCode ? inviteSearch : '';
    return `
      <div class="invite-join">
        <input type="text" name="invite" placeholder="Invite code" value="${prefill}" maxlength="6">
        <button class="btn-primary" data-action="join-with-invite">Join</button>
        <p class="form-hint">Invite-only workspace.</p>
      </div>
    `;
  }

  return `<button class="btn-primary" data-action="join-open">Join Workspace</button>`;
}

function bindDiscoveryCardActions(card, workspace, inviteSearch) {
  const joinOpen = card.querySelector('[data-action="join-open"]');
  if (joinOpen) {
    joinOpen.addEventListener('click', () => {
      handleOpenJoin(workspace);
    });
  }

  const requestBtn = card.querySelector('[data-action="request"]');
  const requestForm = card.querySelector('form[data-role="request"]');
  if (requestBtn && requestForm) {
    requestBtn.addEventListener('click', () => {
      requestBtn.hidden = true;
      requestForm.hidden = false;
      const nameField = requestForm.querySelector('input[name="name"]');
      nameField?.focus();
    });

    const cancel = requestForm.querySelector('[data-action="cancel-request"]');
    cancel?.addEventListener('click', () => {
      requestForm.reset();
      requestForm.hidden = true;
      requestBtn.hidden = false;
    });

    requestForm.addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(requestForm);
      const name = (formData.get('name') || '').toString().trim();
      const message = (formData.get('message') || '').toString().trim();

      if (!name) {
        return;
      }

      handleRequestJoin(workspace, { name, message });
      requestForm.innerHTML = '<p class="form-success">Request sent! An admin will get back to you soon.</p>';
    });
  }

  const inviteJoin = card.querySelector('[data-action="join-with-invite"]');
  if (inviteJoin) {
    inviteJoin.addEventListener('click', () => {
      const input = card.querySelector('input[name="invite"]');
      const code = input?.value.trim().toUpperCase();
      if (!code) {
        input?.focus();
        input?.classList.add('input-error');
        return;
      }
      input?.classList.remove('input-error');
      handleInviteJoin(workspace, code);
    });
  }

  if (workspace.joinRules === 'invite' && inviteSearch && inviteSearch === workspace.inviteCode) {
    const input = card.querySelector('input[name="invite"]');
    if (input && !input.value) {
      input.value = inviteSearch;
    }
  }
}

function handleOpenJoin(workspace) {
  const profile = getLocalWorkspaceProfile();
  const existingMember = workspace.members.find(member => member.id === profile.id);
  if (!existingMember) {
    workspace.members.push({
      id: profile.id,
      name: profile.name,
      peerId: window.App?.peer?.id || null,
      role: workspace.members.length ? 'member' : 'owner',
      joined: Date.now()
    });
  }
  saveWorkspace(workspace);
  updateWorkspaceStats();
  closeModal('findWorkspaceModal');
  window.workspaceApp?.renderLanding();
  enterWorkspace(workspace.id);
}

function handleInviteJoin(workspace, code) {
  if (code !== workspace.inviteCode) {
    alert('Invalid invite code for this workspace.');
    return;
  }
  handleOpenJoin(workspace);
}

function handleRequestJoin(workspace, request) {
  workspace.requests = Array.isArray(workspace.requests) ? workspace.requests : [];
  workspace.requests.push({
    id: `req-${generateSecureId().slice(0, 10)}`,
    name: request.name,
    message: request.message,
    submitted: Date.now()
  });
  saveWorkspace(workspace);
  updateWorkspaceStats();
}

function showFindWorkspaceModal() {
  const modal = document.getElementById('findWorkspaceModal');
  const searchInput = document.getElementById('workspaceSearch');
  if (!modal || !searchInput) {
    return;
  }

  openModal('findWorkspaceModal');
  renderWorkspaceDiscoveryList(searchInput.value || '');
  searchInput.focus();

  const handleInput = event => {
    renderWorkspaceDiscoveryList(event.target.value || '');
  };

  if (searchInput._workspaceHandler) {
    searchInput.removeEventListener('input', searchInput._workspaceHandler);
  }
  searchInput._workspaceHandler = handleInput;
  searchInput.addEventListener('input', handleInput);
}

function enterWorkspace(workspaceId) {
  const workspace = readWorkspace(workspaceId);
  if (!workspace) {
    return;
  }

  const root = document.getElementById('workspaceApp');
  if (root) {
    root.hidden = true;
  }

  const existing = document.getElementById('activeWorkspaceView');
  existing?.remove();

  const workspaceUI = createWorkspaceUI(workspace);
  workspaceUI.id = 'activeWorkspaceView';
  document.body.appendChild(workspaceUI);

  const activeState = { workspaceId: workspace.id, channelId: workspace.channels[0]?.id || 'general' };
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(activeState));
  } catch (error) {
    console.warn('Unable to persist active workspace', error);
  }

  window.workspaceApp?.setActiveWorkspace(workspace.id);
  initializeWorkspaceConnections(workspace);
}

function leaveWorkspaceView() {
  const view = document.getElementById('activeWorkspaceView');
  if (view) {
    view.remove();
  }
  const root = document.getElementById('workspaceApp');
  if (root) {
    root.hidden = false;
  }
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  window.workspaceApp?.setActiveWorkspace(null);
  window.workspaceApp?.renderLanding();
}

function createWorkspaceUI(workspace) {
  const container = document.createElement('div');
  container.className = 'workspace-ui';
  const created = new Date(workspace.created || Date.now()).toLocaleString();
  const inviteCode = workspace.inviteCode || '------';
  const channels = workspace.channels.map(channel => `
    <li data-channel-id="${channel.id}">
      <span>#${channel.name}</span>
      <time>${new Date(channel.created || workspace.created).toLocaleDateString()}</time>
    </li>
  `).join('');

  const members = workspace.members.map(member => `
    <li>
      <div class="member-avatar">${member.name.charAt(0).toUpperCase()}</div>
      <div class="member-info">
        <span class="member-name">${member.name}</span>
        <span class="member-meta">${member.role === 'owner' ? 'Owner' : 'Member'}</span>
      </div>
    </li>
  `).join('') || '<li class="empty">No members yet.</li>';

  container.innerHTML = `
    <div class="workspace-ui__header">
      <div>
        <h1>${workspace.name}</h1>
        <p>${workspace.description || 'No description provided.'}</p>
        <div class="workspace-ui__meta">
          <span>${workspace.type === 'public' ? 'Public workspace' : 'Private workspace'}</span>
          <span>${formatJoinRule(workspace.joinRules)}</span>
          <span>Created ${created}</span>
        </div>
      </div>
      <div class="workspace-ui__actions">
        <div class="invite-code" title="Invite code">Invite code: <strong>${inviteCode}</strong></div>
        <button class="btn-secondary" data-action="copy-link">Copy Link</button>
        <button class="btn-primary" data-action="leave">Back to Workspaces</button>
      </div>
    </div>
    <div class="workspace-ui__layout">
      <aside class="workspace-ui__sidebar">
        <h2>Channels</h2>
        <ul>${channels}</ul>
        <button class="btn-text" data-action="add-channel">+ Add Channel</button>
      </aside>
      <section class="workspace-ui__main">
        <div class="workspace-ui__welcome">
          <h2>Welcome to #${workspace.channels[0]?.name || 'general'}</h2>
          <p>This is the start of the channel. Share the invite code with teammates to collaborate.</p>
        </div>
      </section>
      <aside class="workspace-ui__members">
        <h2>Members (${workspace.members.length})</h2>
        <ul>${members}</ul>
      </aside>
    </div>
  `;

  const leaveBtn = container.querySelector('[data-action="leave"]');
  leaveBtn?.addEventListener('click', leaveWorkspaceView);

  const copyLinkBtn = container.querySelector('[data-action="copy-link"]');
  copyLinkBtn?.addEventListener('click', () => {
    const link = `${window.location.origin}/#/${workspace.id}`;
    navigator.clipboard?.writeText(link).then(() => {
      copyLinkBtn.textContent = 'Link Copied!';
      setTimeout(() => {
        copyLinkBtn.textContent = 'Copy Link';
      }, 1600);
    }).catch(() => {
      alert(`Workspace link: ${link}`);
    });
  });

  const addChannelBtn = container.querySelector('[data-action="add-channel"]');
  addChannelBtn?.addEventListener('click', () => {
    const name = prompt('Channel name');
    if (!name) {
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || generateRandomSegment(6).toLowerCase();
    workspace.channels.push({ id: slug, name, created: Date.now() });
    saveWorkspace(workspace);
    const list = container.querySelector('.workspace-ui__sidebar ul');
    if (list) {
      list.insertAdjacentHTML('beforeend', `<li data-channel-id="${slug}"><span>#${name}</span><time>${new Date().toLocaleDateString()}</time></li>`);
    }
  });

  return container;
}

function initializeWorkspaceConnections(workspace) {
  if (window.App?.useWorkspaceLayout) {
    window.App.useWorkspaceLayout();
  }
  if (window.App?.roomMembers && window.App.localIdentity?.id) {
    try {
      window.App.roomMembers.upsertMember({
        id: window.App.localIdentity.id,
        displayName: window.App.localIdentity.displayName || 'You',
        avatar: window.App.localIdentity.avatar || { emoji: '🙂' }
      }, { isHost: true, online: true });
    } catch (error) {
      console.warn('Unable to sync workspace members with chat state yet', error);
    }
  }
  console.info('Workspace ready', workspace.id);
}

function formatJoinRule(rule) {
  switch (rule) {
    case 'invite':
      return 'Invite-only';
    case 'request':
      return 'Request access';
    default:
      return 'Open join';
  }
}

class WorkspaceApp {
  constructor() {
    this.root = document.getElementById('workspaceApp');
    this.content = document.getElementById('workspaceContent');
    this.heroStats = document.getElementById('workspaceHeroStats');
    this.activeWorkspaceId = null;

    if (this.root) {
      this.renderLanding();
    }
  }

  setActiveWorkspace(id) {
    this.activeWorkspaceId = id;
  }

  renderLanding() {
    if (!this.content) {
      return;
    }

    updateWorkspaceStats();
    const workspaces = listWorkspaces();

    if (!workspaces.length) {
      this.content.innerHTML = `
        <div class="workspace-empty">
          <div class="empty-illustration">✨</div>
          <h2>How would you like to get started?</h2>
          <p>Would you like to create a new workspace or join an existing one?</p>
          <div class="workspace-empty__actions">
            <button class="btn-primary large" data-action="create-initial-workspace">Create a new workspace</button>
            <button class="btn-secondary large" data-action="join-initial-workspace">Join an existing workspace</button>
          </div>
        </div>
      `;

      const createButton = this.content.querySelector('[data-action="create-initial-workspace"]');
      const joinButton = this.content.querySelector('[data-action="join-initial-workspace"]');

      createButton?.addEventListener('click', showCreateWorkspaceModal);
      joinButton?.addEventListener('click', showFindWorkspaceModal);
      return;
    }

    const cards = workspaces.map(workspace => `
      <article class="workspace-card" data-id="${workspace.id}">
        <header class="workspace-card-header">
          <div class="workspace-card-title">
            <div class="workspace-card-icon">${workspace.name.charAt(0).toUpperCase()}</div>
            <div>
              <h3>${workspace.name}</h3>
              <p>${workspace.description || 'No description provided.'}</p>
            </div>
          </div>
          <button class="btn-secondary small" data-action="open" data-id="${workspace.id}">Open</button>
        </header>
        <div class="workspace-card-body">
          <div class="workspace-card-stat">
            <span class="stat-number">${workspace.members.length}</span>
            <span class="stat-label">Members</span>
          </div>
          <div class="workspace-card-stat">
            <span class="stat-number">${workspace.channels.length}</span>
            <span class="stat-label">Channels</span>
          </div>
          <div class="workspace-card-stat">
            <span class="stat-number">${workspace.type === 'public' ? 'Public' : 'Private'}</span>
            <span class="stat-label">Type</span>
          </div>
        </div>
        <footer class="workspace-card-footer">
          <span class="workspace-url">${window.location.origin}/#/${workspace.id}</span>
          <span class="workspace-pill">${formatJoinRule(workspace.joinRules)}</span>
        </footer>
      </article>
    `).join('');

    this.content.innerHTML = `<div class="workspace-grid">${cards}</div>`;

    this.content.querySelectorAll('[data-action="open"]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const id = button.getAttribute('data-id');
        enterWorkspace(id);
      });
    });

    this.content.querySelectorAll('.workspace-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        enterWorkspace(id);
      });
    });
  }
}

function initializeWorkspace() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWorkspace, { once: true });
    return;
  }

  window.closeModal = closeModal;

  if (!window.workspaceApp) {
    window.workspaceApp = new WorkspaceApp();
  }

  window.enterWorkspace = enterWorkspace;
  window.leaveWorkspaceView = leaveWorkspaceView;

  const createBtn = document.getElementById('createWorkspaceBtn');
  const findBtn = document.getElementById('findWorkspaceBtn');

  if (createBtn && !createBtn._initialized) {
    createBtn.addEventListener('click', showCreateWorkspaceModal);
    createBtn._initialized = true;
  }

  if (findBtn && !findBtn._initialized) {
    findBtn.addEventListener('click', showFindWorkspaceModal);
    findBtn._initialized = true;
  }

  updateWorkspaceStats();

  const activeRaw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  if (activeRaw) {
    try {
      const parsed = JSON.parse(activeRaw);
      if (parsed?.workspaceId && readWorkspace(parsed.workspaceId)) {
        enterWorkspace(parsed.workspaceId);
      }
    } catch (error) {
      console.warn('Unable to restore active workspace', error);
    }
  }
}

initializeWorkspace();

function updateWorkspaceStats() {
  const statsEl = document.getElementById('workspaceHeroStats');
  if (statsEl) {
    const workspaceCount = Object.keys(localStorage)
      .filter(key => key.startsWith(WORKSPACE_STORAGE_PREFIX)).length;
    statsEl.innerHTML = `
            <div class="stat">
                <div class="stat-number">${workspaceCount}</div>
                <div class="stat-label">Active Workspaces</div>
            </div>
        `;
  }
}

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const openModalEl = document.querySelector('.modal[data-open="true"]');
    if (openModalEl?.id) {
      closeModal(openModalEl.id);
    }
  }
});

