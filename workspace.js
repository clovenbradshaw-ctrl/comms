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

function ensureUniqueWorkspaceId() {
  let workspaceId = generateWorkspaceId();
  while (readWorkspace(workspaceId)) {
    workspaceId = generateWorkspaceId();
  }
  return workspaceId;
}

function evaluatePasswordStrength(value = '') {
  if (!value || typeof value !== 'string') {
    return 0;
  }
  let score = 0;
  if (value.length >= 8) {
    score += 1;
  }
  if (value.length >= 12) {
    score += 1;
  }
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) {
    score += 1;
  }
  if (/[0-9]/.test(value) || /[^A-Za-z0-9]/.test(value)) {
    score += 1;
  }
  return Math.min(score, 4);
}

function describeStrength(level) {
  switch (level) {
    case 4:
      return 'excellent';
    case 3:
      return 'strong';
    case 2:
      return 'good';
    case 1:
      return 'fair';
    default:
      return 'weak';
  }
}

async function hashWorkspaceSecret(secret) {
  if (!secret) {
    return null;
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function getWorkspaceByInvite(code) {
  if (!code) {
    return null;
  }
  const normalized = code.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (!normalized) {
    return null;
  }
  const all = listWorkspaces();
  return all.find(workspace => workspace.id.toUpperCase() === normalized
    || workspace.inviteCode === normalized);
}

function renderHeroStats(statsEl, workspaces = []) {
  if (!statsEl) {
    return;
  }
  const workspaceCount = workspaces.length;
  const totalMembers = workspaces.reduce((sum, workspace) => sum + (workspace.members?.length || 0), 0);
  const pendingRequests = workspaces.reduce((sum, workspace) => sum + (workspace.requests?.length || 0), 0);

  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">🗂️</div>
      <div>
        <div class="stat-label">Active workspaces</div>
        <div class="stat-number">${workspaceCount}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🧑‍🤝‍🧑</div>
      <div>
        <div class="stat-label">People connected</div>
        <div class="stat-number">${totalMembers}</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🛎️</div>
      <div>
        <div class="stat-label">Pending requests</div>
        <div class="stat-number">${pendingRequests}</div>
      </div>
    </div>
  `;
}

function enterWorkspace(workspaceId) {
  const workspace = readWorkspace(workspaceId);
  if (!workspace) {
    return;
  }

  const root = document.getElementById('workspaceRoot');
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
  const root = document.getElementById('workspaceRoot');
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
    this.root = document.getElementById('workspaceRoot');
    this.content = document.getElementById('workspaceContent');
    this.heroStats = document.getElementById('workspaceHeroStats');
    this.heroSection = this.root?.querySelector('.workspace-hero') || null;
    this.flowContainer = null;
    this.flowBody = null;
    this.librarySection = null;
    this.toggleContainer = null;
    this.stepIndicators = [];
    this.workspaces = listWorkspaces();
    this.activeWorkspaceId = null;
    this.currentJoinSearch = '';
    this.flowState = {
      step: 'mode',
      mode: null,
      draft: null,
      joinTarget: null,
      resultWorkspace: null
    };

    if (this.root) {
      this.renderLanding();
    }
  }

  setActiveWorkspace(id) {
    this.activeWorkspaceId = id;
  }

  startFlow(mode) {
    this.selectMode(mode, { reset: true, scroll: true });
  }

  scrollFlowIntoView() {
    if (this.flowContainer) {
      this.flowContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  renderLanding() {
    if (!this.content) {
      return;
    }

    this.workspaces = listWorkspaces();

    if (!this.flowState) {
      this.flowState = {
        step: 'mode',
        mode: null,
        draft: null,
        joinTarget: null,
        resultWorkspace: null
      };
    }

    this.content.innerHTML = `
      <div class="workspace-landing">
        <section id="workspaceFlowSection"></section>
        <section id="workspaceLibrarySection" aria-live="polite"></section>
      </div>
    `;

    this.flowContainer = this.content.querySelector('#workspaceFlowSection');
    this.librarySection = this.content.querySelector('#workspaceLibrarySection');

    this.renderFlowShell();
    this.renderWorkspaceList(this.workspaces);
    this.updateHeroStats();
    this.updateHeroVisibility();
  }

  renderFlowShell() {
    if (!this.flowContainer) {
      return;
    }

    const steps = [
      { id: 'mode', label: 'Choose action' },
      { id: 'details', label: 'Workspace details' },
      { id: 'security', label: 'Security check' },
      { id: 'success', label: 'All set' }
    ];

    const stepper = steps.map((step, index) => `
      <div class="flow-step" data-step-index="${step.id}" data-state="pending">
        <span class="step-index">${index + 1}</span>
        <span>${step.label}</span>
      </div>
    `).join('');

    this.flowContainer.innerHTML = `
      <div class="workspace-flow">
        <div class="workspace-flow__inner">
          <header class="workspace-flow__header">
            <div>
              <span class="flow-kicker">Guided setup</span>
              <h2>Get your team into a secure workspace</h2>
              <p class="workspace-flow__subtitle">Follow the guided steps to create a new workspace or join one that you have been invited to.</p>
            </div>
            <div class="flow-stepper" role="list">
              ${stepper}
            </div>
          </header>
          <div class="workspace-flow__toggle" role="tablist">
            <button type="button" data-mode="create" role="tab" aria-selected="false" aria-pressed="false">
              <span class="btn-icon">✨</span>
              <span class="btn-label">Create workspace</span>
            </button>
            <button type="button" data-mode="join" role="tab" aria-selected="false" aria-pressed="false">
              <span class="btn-icon">🔗</span>
              <span class="btn-label">Join workspace</span>
            </button>
          </div>
          <div class="workspace-flow__body" id="workspaceFlowBody"></div>
        </div>
      </div>
    `;

    this.flowBody = this.flowContainer.querySelector('#workspaceFlowBody');
    this.toggleContainer = this.flowContainer.querySelector('.workspace-flow__toggle');
    this.stepIndicators = Array.from(this.flowContainer.querySelectorAll('.flow-step'));

    const toggleButtons = Array.from(this.toggleContainer.querySelectorAll('button[data-mode]'));
    toggleButtons.forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-mode');
        this.selectMode(mode, { reset: false, scroll: false });
      });
    });

    this.updateFlowUI();
  }

  updateFlowUI() {
    if (!this.flowContainer) {
      return;
    }

    const stepOrder = ['mode', 'details', 'security', 'success'];
    const currentIndex = stepOrder.indexOf(this.flowState.step);

    this.stepIndicators.forEach(stepEl => {
      const stepId = stepEl.getAttribute('data-step-index');
      const position = stepOrder.indexOf(stepId);
      if (position < currentIndex) {
        stepEl.dataset.state = 'complete';
      } else if (position === currentIndex) {
        stepEl.dataset.state = 'active';
      } else {
        stepEl.dataset.state = 'pending';
      }
    });

    if (this.toggleContainer) {
      const isChoosing = this.flowState.step === 'mode';
      this.toggleContainer.hidden = isChoosing;

      const toggleButtons = Array.from(this.toggleContainer.querySelectorAll('button[data-mode]'));
      toggleButtons.forEach(button => {
        const mode = button.getAttribute('data-mode');
        const active = !isChoosing && this.flowState.mode === mode;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    this.renderFlowBody();
    this.updateHeroVisibility();
  }

  updateHeroVisibility() {
    if (!this.root) {
      return;
    }

    const hasWorkspaces = Array.isArray(this.workspaces) && this.workspaces.length > 0;
    const flowActive = this.flowState?.step && this.flowState.step !== 'mode';
    const shouldCondense = Boolean(this.activeWorkspaceId) || flowActive || hasWorkspaces;

    if (this.heroSection) {
      this.heroSection.hidden = shouldCondense;
    }

    if (shouldCondense) {
      this.root.classList.add('workspace-app--condensed');
    } else {
      this.root.classList.remove('workspace-app--condensed');
      if (this.heroSection) {
        this.heroSection.hidden = false;
      }
    }
  }

  renderFlowBody() {
    if (!this.flowBody) {
      return;
    }

    const { step, mode } = this.flowState;

    if (step === 'mode') {
      this.renderModeSelection();
      return;
    }

    if (mode === 'create') {
      if (step === 'details') {
        this.renderCreateDetailsForm();
        return;
      }
      if (step === 'security') {
        this.renderCreateSecurityStep();
        return;
      }
      if (step === 'success') {
        this.renderSuccessStep();
        return;
      }
    }

    if (mode === 'join') {
      if (step === 'details') {
        this.renderJoinDetailsForm();
        return;
      }
      if (step === 'security') {
        this.renderJoinSecurityStep();
        return;
      }
      if (step === 'success') {
        this.renderSuccessStep();
      }
    }
  }

  renderModeSelection() {
    this.flowBody.innerHTML = `
      <div class="mode-select">
        <p class="workspace-flow__subtitle">Pick how you would like to get started. You can always switch paths later.</p>
        <div class="mode-options">
          <button type="button" class="mode-card" data-select-mode="create">
            <div class="mode-card__icon">🏗️</div>
            <div class="mode-card__label">Create a workspace</div>
            <p class="mode-card__hint">Launch a fresh hub with reusable channels, invite controls, and security baked in.</p>
          </button>
          <button type="button" class="mode-card" data-select-mode="join">
            <div class="mode-card__icon">🎟️</div>
            <div class="mode-card__label">Join with an invite</div>
            <p class="mode-card__hint">Use an invite code or workspace URL that someone shared with you.</p>
          </button>
        </div>
      </div>
    `;

    this.flowBody.querySelectorAll('[data-select-mode]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-select-mode');
        this.selectMode(mode, { reset: true, scroll: true });
      });
    });
  }

  renderCreateDetailsForm() {
    const draft = this.flowState.draft || {};

    this.flowBody.innerHTML = `
      <form id="createWorkspaceDetails" class="form-grid" novalidate>
        <div class="field-group" data-field="workspaceName">
          <label for="createWorkspaceName">Workspace name <span aria-hidden="true">*</span></label>
          <input id="createWorkspaceName" name="workspaceName" maxlength="50" placeholder="e.g. Support team HQ" value="${draft.name || ''}" required>
          <p class="field-hint">This name appears on invites and inside the workspace header.</p>
          <p class="field-error" hidden></p>
        </div>
        <div class="field-group" data-field="workspaceDesc">
          <label for="createWorkspaceDesc">Description</label>
          <textarea id="createWorkspaceDesc" name="workspaceDesc" maxlength="200" placeholder="What will this workspace be used for?">${draft.description || ''}</textarea>
          <p class="field-hint">Optional, but helps teammates understand the purpose.</p>
          <p class="field-error" hidden></p>
        </div>
        <div class="field-group" data-field="workspaceType">
          <label for="createWorkspaceType">Visibility</label>
          <select id="createWorkspaceType" name="workspaceType">
            <option value="public" ${draft.type !== 'private' ? 'selected' : ''}>Public – discoverable to everyone on this device</option>
            <option value="private" ${draft.type === 'private' ? 'selected' : ''}>Private – invite only</option>
          </select>
          <p class="field-hint">Public workspaces are listed in discovery. Private workspaces require an invite code.</p>
        </div>
        <div class="field-group" data-field="workspaceJoinRules">
          <label for="createWorkspaceJoin">Join rule</label>
          <select id="createWorkspaceJoin" name="workspaceJoinRules">
            <option value="open" ${draft.joinRules === 'open' ? 'selected' : ''}>Open – anyone with the link can join</option>
            <option value="request" ${draft.joinRules === 'request' ? 'selected' : ''}>Request – new members need approval</option>
            <option value="invite" ${draft.joinRules === 'invite' ? 'selected' : ''}>Invite only – invite code required</option>
          </select>
          <p class="field-hint">Choose how teammates get access. You can change this later in settings.</p>
        </div>
        <div class="workspace-flow__actions">
          <button type="submit" class="btn-primary large" data-loading-text="Saving…">
            <span class="btn-icon">➡️</span>
            <span class="btn-label">Continue to security</span>
          </button>
          <button type="button" class="btn-secondary" data-action="back-to-mode">Back</button>
        </div>
        <div class="workspace-flow__callout" role="note">
          <span>💡</span>
          <span>You can fine-tune channels and member permissions after the workspace is created.</span>
        </div>
      </form>
    `;

    const form = this.flowBody.querySelector('#createWorkspaceDetails');
    form.addEventListener('submit', event => {
      event.preventDefault();
      this.handleCreateDetailsSubmit(form);
    });

    const backButton = form.querySelector('[data-action="back-to-mode"]');
    backButton?.addEventListener('click', () => this.resetFlow());
  }

  handleCreateDetailsSubmit(form) {
    this.clearFormErrors(form);

    const nameInput = form.querySelector('#createWorkspaceName');
    const descInput = form.querySelector('#createWorkspaceDesc');
    const typeInput = form.querySelector('#createWorkspaceType');
    const joinInput = form.querySelector('#createWorkspaceJoin');

    const name = nameInput?.value.trim() || '';
    const description = descInput?.value.trim() || '';
    const type = typeInput?.value === 'private' ? 'private' : 'public';
    const joinRules = ['open', 'request', 'invite'].includes(joinInput?.value)
      ? joinInput.value
      : 'open';

    if (!name) {
      this.setFieldError(form, 'workspaceName', 'Workspace name is required.');
      nameInput?.focus();
      return;
    }

    if (name.length > 50) {
      this.setFieldError(form, 'workspaceName', 'Keep the name under 50 characters.');
      nameInput?.focus();
      return;
    }

    if (description.length > 200) {
      this.setFieldError(form, 'workspaceDesc', 'Descriptions are limited to 200 characters.');
      descInput?.focus();
      return;
    }

    this.flowState.draft = {
      name,
      description,
      type,
      joinRules
    };
    this.flowState.mode = 'create';
    this.flowState.step = 'security';
    this.updateFlowUI();
    this.scrollFlowIntoView();
  }

  renderCreateSecurityStep() {
    const draft = this.flowState.draft;
    if (!draft) {
      this.flowState.step = 'details';
      this.updateFlowUI();
      return;
    }

    const strengthLevel = draft.securityStrength || 0;

    this.flowBody.innerHTML = `
      <div class="security-panel">
        <div class="security-panel__explain">
          <strong>${draft.name}</strong> will be locked behind a password so only approved teammates can access settings and history. Choose a strong password and decide if two-factor approvals are required.
        </div>
        <form id="createWorkspaceSecurity" class="form-grid" novalidate>
          <div class="field-group" data-field="workspacePassword">
            <label for="createWorkspacePassword">Workspace password</label>
            <input type="password" id="createWorkspacePassword" name="workspacePassword" minlength="8" placeholder="Create a secure password" autocomplete="new-password">
            <p class="field-hint">Protects workspace settings, invite creation, and encrypted message history.</p>
            <div class="strength-meter" id="createWorkspaceStrength" data-level="${strengthLevel}">
              <span class="strength-bar"></span>
              <span class="strength-bar"></span>
              <span class="strength-bar"></span>
              <span class="strength-bar"></span>
              <span class="strength-bar"></span>
              <span class="strength-label" id="createWorkspaceStrengthText">Strength: ${describeStrength(strengthLevel)}</span>
            </div>
            <p class="field-error" hidden></p>
          </div>
          <div class="field-group inline" data-field="workspaceTwoFactor">
            <label class="toggle">
              <input type="checkbox" id="createWorkspace2FA" name="workspaceTwoFactor" ${draft.twoFactor ? 'checked' : ''}>
              <span>Require 2FA approval for new members</span>
            </label>
            <p class="field-hint">We’ll prompt members to confirm via a second factor before they’re added.</p>
          </div>
          <p class="field-error" id="createSecurityError" role="alert" hidden></p>
          <div class="workspace-flow__actions">
            <button type="submit" class="btn-primary large" data-loading-text="Finalising…">
              <span class="btn-icon">🛡️</span>
              <span class="btn-label">Complete setup</span>
            </button>
            <button type="button" class="btn-secondary" data-action="back-to-details">Back</button>
            <button type="button" class="btn-secondary" data-action="skip-security">Skip password</button>
          </div>
        </form>
      </div>
    `;

    const form = this.flowBody.querySelector('#createWorkspaceSecurity');
    const passwordInput = form.querySelector('#createWorkspacePassword');
    const strengthMeter = form.querySelector('#createWorkspaceStrength');
    const strengthText = form.querySelector('#createWorkspaceStrengthText');

    passwordInput?.addEventListener('input', () => {
      const value = passwordInput.value.trim();
      const level = evaluatePasswordStrength(value);
      if (strengthMeter) {
        strengthMeter.dataset.level = `${level}`;
      }
      if (strengthText) {
        strengthText.textContent = `Strength: ${describeStrength(level)}`;
      }
    });

    form.addEventListener('submit', event => {
      event.preventDefault();
      this.handleCreateSecuritySubmit(form);
    });

    form.querySelector('[data-action="back-to-details"]')?.addEventListener('click', () => {
      this.flowState.step = 'details';
      this.updateFlowUI();
    });

    form.querySelector('[data-action="skip-security"]')?.addEventListener('click', async () => {
      await this.completeWorkspaceSetup({ password: '', twoFactor: form.querySelector('#createWorkspace2FA')?.checked || false });
    });
  }

  async handleCreateSecuritySubmit(form) {
    this.clearFormErrors(form);
    const passwordInput = form.querySelector('#createWorkspacePassword');
    const twoFactorInput = form.querySelector('#createWorkspace2FA');
    const errorMessage = form.querySelector('#createSecurityError');
    const submitButton = form.querySelector('button[type="submit"]');

    const password = passwordInput?.value.trim() || '';
    if (password && password.length < 8) {
      this.setFieldError(form, 'workspacePassword', 'Passwords should be at least 8 characters long.');
      passwordInput?.focus();
      return;
    }

    if (password && evaluatePasswordStrength(password) < 1) {
      this.setFieldError(form, 'workspacePassword', 'Try mixing upper and lower case letters, numbers, or symbols for a stronger password.');
      passwordInput?.focus();
      return;
    }

    this.setButtonLoading(submitButton, true);
    try {
      await this.completeWorkspaceSetup({ password, twoFactor: twoFactorInput?.checked || false });
    } catch (error) {
      console.warn('Unable to create workspace', error);
      if (errorMessage) {
        errorMessage.textContent = 'Unable to save workspace. Your browser storage may be full.';
        errorMessage.hidden = false;
      }
    } finally {
      this.setButtonLoading(submitButton, false);
    }
  }

  async completeWorkspaceSetup({ password, twoFactor }) {
    const draft = this.flowState.draft;
    if (!draft) {
      return;
    }

    const now = Date.now();
    const workspaceId = ensureUniqueWorkspaceId();
    const inviteCode = generateInviteCode();
    const creatorPeerId = window.App?.peer?.id || null;
    const profile = getLocalWorkspaceProfile();

    const workspace = ensureWorkspaceShape({
      id: workspaceId,
      name: draft.name,
      description: draft.description,
      type: draft.type,
      joinRules: draft.joinRules,
      created: now,
      creatorPeerId,
      members: [
        {
          id: profile.id,
          name: profile.name,
          peerId: creatorPeerId,
          role: 'owner',
          joined: now
        }
      ],
      channels: [
        { id: 'general', name: 'General', created: now }
      ],
      inviteCode,
      requests: []
    });

    const strength = evaluatePasswordStrength(password);
    workspace.security = {
      passwordEnabled: Boolean(password),
      passwordStrength: password ? describeStrength(strength) : 'weak',
      passwordDigest: password ? await hashWorkspaceSecret(password) : null,
      twoFactor: Boolean(twoFactor),
      createdAt: now,
      explanation: 'Protects workspace invites, history, and admin settings.'
    };

    workspace.audit = {
      createdBy: profile.id,
      createdAt: now
    };

    saveWorkspace(workspace);

    this.flowState.resultWorkspace = workspace;
    this.flowState.mode = 'create';
    this.flowState.step = 'success';
    this.flowState.draft = null;
    this.updateAfterWorkspaceChange();
    this.updateFlowUI();
    this.scrollFlowIntoView();
  }

  renderJoinDetailsForm() {
    this.flowBody.innerHTML = `
      <div class="form-grid">
        <form id="joinWorkspaceLookup" class="form-grid" novalidate>
          <div class="field-group" data-field="inviteCode">
            <label for="joinWorkspaceCode">Invite code or workspace URL</label>
            <input type="text" id="joinWorkspaceCode" name="inviteCode" placeholder="e.g. WS-1234 or ABCDEF" value="${this.currentJoinSearch}" autocomplete="off">
            <p class="field-hint">Paste the code or link from your host. We'll locate the workspace and handle the rest.</p>
            <p class="field-error" hidden></p>
          </div>
          <div class="workspace-flow__actions">
            <button type="submit" class="btn-primary" data-loading-text="Searching…">
              <span class="btn-icon">🔓</span>
              <span class="btn-label">Continue</span>
            </button>
            <button type="button" class="btn-secondary" data-action="back-to-mode">Back</button>
          </div>
          <p class="field-error" id="joinLookupError" role="alert" hidden></p>
        </form>
        <div>
          <h3 style="margin-bottom: 0.75rem; color: #0f172a;">Workspaces you can access</h3>
          <div class="workspace-flow__list" id="joinWorkspaceList"></div>
        </div>
      </div>
    `;

    const form = this.flowBody.querySelector('#joinWorkspaceLookup');
    const input = form.querySelector('#joinWorkspaceCode');
    const list = this.flowBody.querySelector('#joinWorkspaceList');

    form.addEventListener('submit', event => {
      event.preventDefault();
      this.handleJoinLookup(form);
    });

    form.querySelector('[data-action="back-to-mode"]')?.addEventListener('click', () => this.resetFlow());

    input?.addEventListener('input', () => {
      this.currentJoinSearch = input.value;
      this.renderJoinWorkspaceList(this.currentJoinSearch, list);
    });

    this.renderJoinWorkspaceList(this.currentJoinSearch, list);
  }

  renderJoinWorkspaceList(term = '', container = null) {
    const list = container || this.flowBody?.querySelector('#joinWorkspaceList');
    if (!list) {
      return;
    }

    const normalized = term.trim().toLowerCase();
    const inviteSearch = normalized.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const all = listWorkspaces();
    const filtered = all.filter(workspace => {
      if (!normalized) {
        return workspace.type === 'public';
      }
      const matchName = workspace.name.toLowerCase().includes(normalized);
      const matchId = workspace.id.toLowerCase().includes(normalized);
      const matchInvite = workspace.inviteCode?.toLowerCase().includes(normalized);
      const matchExactInvite = inviteSearch && workspace.inviteCode === inviteSearch;
      return matchName || matchId || matchInvite || matchExactInvite;
    });

    if (!filtered.length) {
      list.innerHTML = `
        <div class="join-empty">
          <strong>No matching workspaces.</strong> Check your invite code or consider creating a new workspace instead.
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map(workspace => `
      <article class="join-card">
        <div class="join-card__header">
          <div class="workspace-card-title">
            <div class="workspace-card-icon">${workspace.name.charAt(0).toUpperCase()}</div>
            <div>
              <h4>${workspace.name}</h4>
              <p>${workspace.description || 'No description provided.'}</p>
            </div>
          </div>
          <button type="button" class="btn-secondary small" data-action="select-workspace" data-workspace-id="${workspace.id}">
            <span class="btn-icon">➡️</span>
            <span class="btn-label">Review</span>
          </button>
        </div>
        <div class="join-card__meta">
          <span class="join-card__badge">${workspace.type === 'public' ? 'Public' : 'Private'}</span>
          <span class="join-card__badge">${formatJoinRule(workspace.joinRules)}</span>
          <span class="join-card__badge">${workspace.members.length} members</span>
          ${workspace.security?.passwordEnabled ? '<span class="join-card__badge">🔐 Password protected</span>' : '<span class="join-card__badge">🔓 No password</span>'}
        </div>
      </article>
    `).join('');

    list.querySelectorAll('[data-action="select-workspace"]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-workspace-id');
        this.selectJoinTarget(id);
      });
    });
  }

  handleJoinLookup(form) {
    this.clearFormErrors(form);
    const input = form.querySelector('#joinWorkspaceCode');
    const errorEl = form.querySelector('#joinLookupError');
    const submitButton = form.querySelector('button[type="submit"]');
    const value = input?.value.trim() || '';

    if (!value) {
      this.setFieldError(form, 'inviteCode', 'Enter the invite code or paste the workspace link.');
      input?.focus();
      return;
    }

    this.setButtonLoading(submitButton, true);

    try {
      const target = getWorkspaceByInvite(value);
      if (!target) {
        if (errorEl) {
          errorEl.textContent = 'We couldn’t find a workspace with that code. Double-check the invite or ask the host to resend it.';
          errorEl.hidden = false;
        }
        return;
      }
      this.selectJoinTarget(target.id);
    } finally {
      this.setButtonLoading(submitButton, false);
    }
  }

  selectJoinTarget(workspaceId) {
    const workspace = readWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    this.flowState.mode = 'join';
    this.flowState.joinTarget = workspace;
    this.flowState.resultWorkspace = null;
    this.flowState.step = 'security';
    this.updateFlowUI();
    this.scrollFlowIntoView();
  }

  renderJoinSecurityStep() {
    const workspace = this.flowState.joinTarget;
    if (!workspace) {
      this.flowState.step = 'details';
      this.updateFlowUI();
      return;
    }

    const passwordRequired = Boolean(workspace.security?.passwordEnabled && workspace.security?.passwordDigest);
    const twoFactorEnabled = Boolean(workspace.security?.twoFactor);

    this.flowBody.innerHTML = `
      <div class="security-panel">
        <div class="security-panel__explain">
          <strong>${workspace.name}</strong> is ${passwordRequired ? 'password protected' : 'open to invited members'}.
          ${passwordRequired ? 'Enter the password shared by the host to unlock settings and channels.' : 'You can join right away—no password needed.'}
          ${twoFactorEnabled ? ' This workspace uses two-factor approval, so the host may confirm your join request.' : ''}
        </div>
        <form id="joinWorkspaceSecurity" class="form-grid" novalidate>
          ${passwordRequired ? `
            <div class="field-group" data-field="workspacePassword">
              <label for="joinWorkspacePassword">Workspace password</label>
              <input type="password" id="joinWorkspacePassword" name="workspacePassword" placeholder="Enter password" autocomplete="current-password" required>
              <p class="field-hint">Ask the workspace owner if you don’t have the password yet.</p>
              <p class="field-error" hidden></p>
            </div>
          ` : ''}
          <p class="field-error" id="joinSecurityError" role="alert" hidden></p>
          <div class="workspace-flow__actions">
            <button type="submit" class="btn-primary" data-loading-text="Joining…">
              <span class="btn-icon">🚀</span>
              <span class="btn-label">${passwordRequired ? 'Unlock workspace' : 'Join workspace'}</span>
            </button>
            <button type="button" class="btn-secondary" data-action="back-to-join">Back</button>
          </div>
        </form>
      </div>
    `;

    const form = this.flowBody.querySelector('#joinWorkspaceSecurity');
    form.addEventListener('submit', event => {
      event.preventDefault();
      this.handleJoinSecuritySubmit(form, workspace);
    });

    form.querySelector('[data-action="back-to-join"]')?.addEventListener('click', () => {
      this.flowState.step = 'details';
      this.updateFlowUI();
    });
  }

  async handleJoinSecuritySubmit(form, workspace) {
    this.clearFormErrors(form);
    const passwordRequired = Boolean(workspace.security?.passwordEnabled && workspace.security?.passwordDigest);
    const passwordInput = form.querySelector('#joinWorkspacePassword');
    const errorEl = form.querySelector('#joinSecurityError');
    const submitButton = form.querySelector('button[type="submit"]');

    if (passwordRequired && !passwordInput?.value.trim()) {
      this.setFieldError(form, 'workspacePassword', 'Password is required to join this workspace.');
      passwordInput?.focus();
      return;
    }

    this.setButtonLoading(submitButton, true);

    try {
      if (passwordRequired && passwordInput) {
        const digest = await hashWorkspaceSecret(passwordInput.value.trim());
        if (digest !== workspace.security?.passwordDigest) {
          this.setFieldError(form, 'workspacePassword', 'That password is incorrect.');
          passwordInput.value = '';
          passwordInput.focus();
          return;
        }
      }

      this.finalizeJoin(workspace);
    } catch (error) {
      console.warn('Unable to join workspace', error);
      if (errorEl) {
        errorEl.textContent = 'We hit a snag while joining. Please try again.';
        errorEl.hidden = false;
      }
    } finally {
      this.setButtonLoading(submitButton, false);
    }
  }

  finalizeJoin(workspace) {
    const profile = getLocalWorkspaceProfile();
    const stored = readWorkspace(workspace.id) || workspace;
    const safeWorkspace = ensureWorkspaceShape({ ...stored });

    if (!safeWorkspace.members.some(member => member.id === profile.id)) {
      safeWorkspace.members.push({
        id: profile.id,
        name: profile.name,
        peerId: window.App?.peer?.id || null,
        role: safeWorkspace.members.length ? 'member' : 'owner',
        joined: Date.now()
      });
    }

    saveWorkspace(safeWorkspace);

    this.flowState.resultWorkspace = safeWorkspace;
    this.flowState.joinTarget = safeWorkspace;
    this.flowState.step = 'success';
    this.flowState.mode = 'join';
    this.updateAfterWorkspaceChange();
    this.updateFlowUI();
    this.scrollFlowIntoView();
  }

  renderSuccessStep() {
    const workspace = this.flowState.resultWorkspace;
    if (!workspace) {
      this.resetFlow();
      return;
    }

    const inviteLink = `${window.location.origin}/#/${workspace.id}`;
    const mode = this.flowState.mode || 'create';
    const badgeText = mode === 'create' ? 'Workspace ready' : 'Access granted';
    const heading = mode === 'create' ? 'You just unlocked a secure workspace.' : 'You’re in. Say hello to your teammates!';

    this.flowBody.innerHTML = `
      <div class="success-panel">
        <span class="success-panel__badge">${badgeText}</span>
        <h3>${heading}</h3>
        <div class="success-panel__meta">
          <div class="success-meta__row">
            <span>🔑</span>
            <span>Invite code</span>
            <code>${workspace.inviteCode}</code>
          </div>
          <div class="success-meta__row">
            <span>🔗</span>
            <span>Share link</span>
            <code>${inviteLink}</code>
          </div>
          ${workspace.security?.passwordEnabled ? `
            <div class="success-meta__row">
              <span>🛡️</span>
              <span>Password strength</span>
              <strong>${workspace.security.passwordStrength || 'protected'}</strong>
            </div>
          ` : ''}
          ${workspace.security?.twoFactor ? `
            <div class="success-meta__row">
              <span>✅</span>
              <span>Two-factor approvals required</span>
            </div>
          ` : ''}
        </div>
        <div class="success-panel__actions">
          <button type="button" class="btn-primary" data-action="enter-workspace" data-workspace-id="${workspace.id}">
            <span class="btn-icon">➡️</span>
            <span class="btn-label">Open workspace</span>
          </button>
          <button type="button" class="btn-secondary" data-action="copy-invite" data-link="${inviteLink}">
            <span class="btn-icon">📋</span>
            <span class="btn-label">Copy invite link</span>
          </button>
          <button type="button" class="btn-secondary" data-action="reset-flow">
            <span class="btn-icon">➕</span>
            <span class="btn-label">Start another</span>
          </button>
        </div>
      </div>
    `;

    this.attachSuccessActions();
  }

  attachSuccessActions() {
    this.flowBody.querySelector('[data-action="enter-workspace"]')?.addEventListener('click', event => {
      const id = event.currentTarget.getAttribute('data-workspace-id');
      enterWorkspace(id);
    });

    this.flowBody.querySelector('[data-action="copy-invite"]')?.addEventListener('click', async event => {
      const link = event.currentTarget.getAttribute('data-link');
      try {
        await navigator.clipboard?.writeText(link);
        event.currentTarget.classList.add('copied');
        setTimeout(() => event.currentTarget.classList.remove('copied'), 1200);
      } catch (error) {
        window.alert(`Invite link: ${link}`);
      }
    });

    this.flowBody.querySelector('[data-action="reset-flow"]')?.addEventListener('click', () => this.resetFlow());
  }

  renderWorkspaceList(workspaces = []) {
    if (!this.librarySection) {
      return;
    }

    if (!workspaces.length) {
      this.librarySection.innerHTML = `
        <div class="workspace-empty">
          <div class="empty-illustration">🌟</div>
          <h2>No workspaces yet</h2>
          <p>Create a new secure workspace or join one with an invite code.</p>
          <div class="workspace-empty__actions">
            <button class="btn-primary large" data-action="start-create">Create workspace</button>
            <button class="btn-secondary large" data-action="start-join">I have an invite</button>
          </div>
        </div>
      `;

      this.librarySection.querySelector('[data-action="start-create"]')?.addEventListener('click', () => this.startFlow('create'));
      this.librarySection.querySelector('[data-action="start-join"]')?.addEventListener('click', () => this.startFlow('join'));
      return;
    }

    const cards = workspaces.map(workspace => {
      const inviteLink = `${window.location.origin}/#/${workspace.id}`;
      const securityLabel = workspace.security?.passwordEnabled ? 'Protected' : 'Open';
      const securityIcon = workspace.security?.passwordEnabled ? '🔐' : '🔓';
      const twoFactor = workspace.security?.twoFactor ? '<span class="workspace-pill">2FA Enabled</span>' : '';
      return `
        <article class="workspace-card" data-id="${workspace.id}">
          <header class="workspace-card-header">
            <div class="workspace-card-title">
              <div class="workspace-card-icon">${workspace.name.charAt(0).toUpperCase()}</div>
              <div>
                <h3>${workspace.name}</h3>
                <p>${workspace.description || 'No description provided.'}</p>
              </div>
            </div>
            <button class="btn-secondary small" data-action="open" data-id="${workspace.id}">
              <span class="btn-icon">➡️</span>
              <span class="btn-label">Open</span>
            </button>
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
              <span class="stat-number">${securityIcon} ${securityLabel}</span>
              <span class="stat-label">Security</span>
            </div>
          </div>
          <footer class="workspace-card-footer">
            <span class="workspace-url" title="Invite link">${inviteLink}</span>
            <span class="workspace-pill">${formatJoinRule(workspace.joinRules)}</span>
            ${twoFactor}
          </footer>
        </article>
      `;
    }).join('');

    this.librarySection.innerHTML = `
      <div class="workspace-grid__header">
        <h3>Your workspaces</h3>
        <button type="button" class="btn-secondary small" data-action="start-create">
          <span class="btn-icon">➕</span>
          <span class="btn-label">New workspace</span>
        </button>
      </div>
      <div class="workspace-grid">${cards}</div>
    `;

    this.librarySection.querySelector('[data-action="start-create"]')?.addEventListener('click', () => this.startFlow('create'));
    this.librarySection.querySelectorAll('[data-action="open"]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const id = button.getAttribute('data-id');
        enterWorkspace(id);
      });
    });

    this.librarySection.querySelectorAll('.workspace-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        enterWorkspace(id);
      });
    });
  }

  updateHeroStats() {
    renderHeroStats(this.heroStats, this.workspaces);
  }

  updateAfterWorkspaceChange() {
    this.workspaces = listWorkspaces();
    this.renderWorkspaceList(this.workspaces);
    this.updateHeroStats();
    this.updateHeroVisibility();
  }

  resetFlow() {
    this.flowState = {
      step: 'mode',
      mode: null,
      draft: null,
      joinTarget: null,
      resultWorkspace: null
    };
    this.currentJoinSearch = '';
    this.updateFlowUI();
    this.scrollFlowIntoView();
  }

  selectMode(mode, options = {}) {
    const { reset = false, scroll = false } = options;

    if (!mode) {
      this.resetFlow();
      return;
    }

    if (reset) {
      this.flowState.draft = null;
      this.flowState.joinTarget = null;
      this.flowState.resultWorkspace = null;
      if (mode === 'join') {
        this.currentJoinSearch = '';
      }
    }

    this.flowState.mode = mode;
    if (this.flowState.step === 'mode' || reset) {
      this.flowState.step = 'details';
    }

    this.updateFlowUI();
    if (scroll) {
      this.scrollFlowIntoView();
    }
  }

  setButtonLoading(button, loading) {
    if (!button) {
      return;
    }
    if (loading) {
      button.setAttribute('data-loading', 'true');
      const label = button.querySelector('.btn-label');
      if (label && !button.dataset.originalLabel) {
        button.dataset.originalLabel = label.textContent.trim();
        const loadingText = button.getAttribute('data-loading-text') || 'Working…';
        label.textContent = loadingText;
      }
    } else {
      button.removeAttribute('data-loading');
      const label = button.querySelector('.btn-label');
      if (label && button.dataset.originalLabel) {
        label.textContent = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
    }
  }

  clearFormErrors(form) {
    if (!form) {
      return;
    }
    form.querySelectorAll('.field-error').forEach(error => {
      error.textContent = '';
      error.hidden = true;
    });
    form.querySelectorAll('.field-group').forEach(group => {
      group.classList.remove('has-error');
    });
  }

  setFieldError(form, fieldName, message) {
    if (!form) {
      return;
    }
    const group = form.querySelector(`[data-field="${fieldName}"]`);
    const error = group?.querySelector('.field-error');
    if (group) {
      group.classList.add('has-error');
    }
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }
}

function initializeWorkspace() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWorkspace, { once: true });
    return;
  }

  if (!window.workspaceApp) {
    window.workspaceApp = new WorkspaceApp();
  }

  window.enterWorkspace = enterWorkspace;
  window.leaveWorkspaceView = leaveWorkspaceView;

  const createBtn = document.getElementById('createWorkspaceBtn');
  const findBtn = document.getElementById('findWorkspaceBtn');

  if (createBtn && !createBtn._initialized) {
    createBtn.addEventListener('click', event => {
      event.preventDefault();
      window.workspaceApp?.startFlow('create');
    });
    createBtn._initialized = true;
  }

  if (findBtn && !findBtn._initialized) {
    findBtn.addEventListener('click', event => {
      event.preventDefault();
      window.workspaceApp?.startFlow('join');
    });
    findBtn._initialized = true;
  }

  window.workspaceApp?.updateHeroStats();

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
  if (window.workspaceApp) {
    window.workspaceApp.updateHeroStats();
    return;
  }
  const statsEl = document.getElementById('workspaceHeroStats');
  const workspaces = listWorkspaces();
  renderHeroStats(statsEl, workspaces);
}
