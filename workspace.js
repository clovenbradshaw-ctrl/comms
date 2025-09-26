const WORKSPACE_STORAGE_PREFIX = 'workspace_';
const ACTIVE_WORKSPACE_KEY = 'workspace_active';
const MEMBER_PROFILE_PREFIX = 'workspace_member_profile_';

// Polling configuration for waiting on the WorkspaceView module to initialise.
const WORKSPACE_VIEW_POLL_INTERVAL = 60;
const WORKSPACE_VIEW_POLL_LIMIT = 80;

let activeWorkspaceView = null;
let activeWorkspaceRecord = null;
let workspaceViewReadyPromise = null;

// Lightweight HTML escaping helper so status messages are safe to inject.
function escapeHTML(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeWorkspaceCode(value) {
  if (!value) {
    return '';
  }
  return String(value).replace(/[^a-z0-9]/gi, '').toUpperCase();
}

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
  return normalizeWorkspaceCode(generateRandomSegment(6));
}

function slugifyChannelName(name) {
  if (!name) {
    return generateRandomSegment(6).toLowerCase();
  }
  const normalized = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return normalized || generateRandomSegment(6).toLowerCase();
}

function getWorkspaceMemberProfileKey(workspaceId) {
  if (!workspaceId) {
    throw new Error('workspaceId is required for member profile operations.');
  }
  return `${MEMBER_PROFILE_PREFIX}${workspaceId}`;
}

function readStoredMemberProfile(workspaceId) {
  if (!workspaceId) {
    return null;
  }

  const key = getWorkspaceMemberProfileKey(workspaceId);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && parsed.name && parsed.passwordDigest) {
      return parsed;
    }
  } catch (error) {
    console.warn('Unable to parse stored member profile', error);
  }
  return null;
}

function persistMemberProfile(workspaceId, profile) {
  if (!workspaceId || !profile) {
    return;
  }
  const key = getWorkspaceMemberProfileKey(workspaceId);
  try {
    localStorage.setItem(key, JSON.stringify(profile));
  } catch (error) {
    console.warn('Unable to persist member profile', error);
  }
}

function generateWorkspaceMemberName() {
  return `user-${generateRandomSegment(10).toLowerCase()}`;
}

async function captureWorkspacePassword({ mode }) {
  const manager = window?.masterPasswordManager;
  if (!manager) {
    throw new Error('Master password service unavailable.');
  }

  if (mode === 'create') {
    const password = manager.ensurePassword();
    manager.remember(password);
    return password;
  }

  const existing = manager.getPassword();
  if (existing) {
    return existing;
  }

  const error = new Error('Workspace verification requires the shared password.');
  error.code = 'PASSWORD_REQUIRED';
  throw error;
}

async function ensureWorkspaceMemberProfile(workspaceId, options = {}) {
  const {
    workspaceName = '',
    forceNew = false,
    verify = false,
    password: providedPasswordRaw = ''
  } = options;

  const providedPassword = typeof providedPasswordRaw === 'string'
    ? providedPasswordRaw.trim()
    : '';

  const passwordManager = window?.masterPasswordManager || null;

  if (!workspaceId) {
    throw new Error('workspaceId is required.');
  }

  let profile = forceNew ? null : readStoredMemberProfile(workspaceId);
  const now = Date.now();

  if (!profile) {
    profile = {
      id: `member-${generateRandomSegment(8).toLowerCase()}`,
      name: generateWorkspaceMemberName(),
      created: now,
      passwordDigest: null,
      passwordCreatedAt: null,
      lastVerifiedAt: null
    };
  }

  if (!profile.name || forceNew) {
    profile.name = generateWorkspaceMemberName();
  }

  if (!profile.passwordDigest || forceNew) {
    const password = providedPassword
      || passwordManager?.ensurePassword()
      || await captureWorkspacePassword({ mode: 'create' });
    passwordManager?.remember(password);
    profile.passwordDigest = await hashWorkspaceSecret(password);
    profile.passwordCreatedAt = now;
    profile.lastVerifiedAt = now;
  } else if (verify) {
    let verified = false;
    let attempts = 0;

    if (providedPassword) {
      const digest = await hashWorkspaceSecret(providedPassword);
      if (digest === profile.passwordDigest) {
        verified = true;
        profile.lastVerifiedAt = Date.now();
        passwordManager?.remember(providedPassword);
      } else {
        const error = new Error('Unable to verify workspace credentials.');
        error.code = 'PASSWORD_INVALID';
        throw error;
      }
    }

    while (!verified && attempts < 3) {
      const password = passwordManager?.getPassword();
      if (!password) {
        const error = new Error('Workspace verification requires the shared password.');
        error.code = 'PASSWORD_REQUIRED';
        throw error;
      }
      const digest = await hashWorkspaceSecret(password);
      if (digest === profile.passwordDigest) {
        verified = true;
        profile.lastVerifiedAt = Date.now();
        passwordManager?.remember(password);
      } else {
        attempts += 1;
        if (typeof window !== 'undefined' && typeof window.alert === 'function' && attempts < 3) {
          window.alert('Incorrect password. Try again to verify your workspace identity.');
        }
      }
    }
    if (!verified) {
      const error = new Error('Unable to verify workspace credentials.');
      error.code = 'PASSWORD_INVALID';
      throw error;
    }
  }

  persistMemberProfile(workspaceId, profile);
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
    ? normalizeWorkspaceCode(workspace.inviteCode)
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

// Persist a workspace record to localStorage, returning a boolean for easy error handling.
function saveWorkspace(workspace) {
  if (!workspace || !workspace.id) {
    return false;
  }

  const key = getWorkspaceStorageKey(workspace.id);

  try {
    const payload = JSON.stringify(workspace);
    localStorage.setItem(key, payload);
    return true;
  } catch (error) {
    console.warn('Unable to persist workspace to storage', error);
    return false;
  }
}

// Read, update and persist a workspace record in one go. The updater should be pure.
function updateWorkspace(workspaceId, updater) {
  const existing = readWorkspace(workspaceId);
  if (!existing) {
    return null;
  }
  const updates = typeof updater === 'function' ? updater(existing) : {};
  const next = ensureWorkspaceShape({ ...existing, ...(updates || {}) });
  if (!saveWorkspace(next)) {
    return null;
  }
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
  const normalized = normalizeWorkspaceCode(code);
  if (!normalized) {
    return null;
  }
  const all = listWorkspaces();
  return all.find(workspace => normalizeWorkspaceCode(workspace.id) === normalized
    || normalizeWorkspaceCode(workspace.inviteCode) === normalized);
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

function getWorkspaceShareLink(workspace) {
  if (!workspace?.id) {
    return '';
  }
  if (typeof window === 'undefined') {
    return `workspace://${workspace.id}`;
  }
  const origin = window.location.origin || '';
  const path = window.location.pathname || '';
  const base = `${origin}${path.replace(/\/$/, '')}`;
  return `${base}#/workspace/${workspace.id}`;
}

function showWorkspaceLinkFallback(link) {
  if (typeof window === 'undefined') {
    console.info('Workspace link:', link);
    return;
  }
  if (typeof window.prompt === 'function') {
    window.prompt('Copy this workspace link', link);
    return;
  }
  if (typeof window.alert === 'function') {
    window.alert(`Workspace link: ${link}`);
  }
}

function handleWorkspaceLinkCopy(workspace) {
  const link = getWorkspaceShareLink(workspace);
  if (!link) {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(link).catch(() => {
      showWorkspaceLinkFallback(link);
      return false;
    });
  }
  showWorkspaceLinkFallback(link);
  return false;
}

function ensureUniqueChannelId(baseId, channels) {
  if (!Array.isArray(channels) || !channels.length) {
    return baseId;
  }
  let candidate = baseId;
  let attempt = 1;
  while (channels.some(channel => channel.id === candidate)) {
    candidate = `${baseId}-${attempt}`.slice(0, 24) || `${baseId}${generateRandomSegment(2).toLowerCase()}`;
    attempt += 1;
  }
  return candidate;
}

// Adds a new channel to the active workspace with storage + UI updates.
function handleWorkspaceChannelCreate(workspace, rawName) {
  if (!workspace) {
    return false;
  }
  const name = (rawName || '').trim();
  if (!name) {
    return false;
  }

  const next = updateWorkspace(workspace.id, current => {
    const safeCurrent = ensureWorkspaceShape(current);
    const channels = Array.isArray(safeCurrent.channels) ? [...safeCurrent.channels] : [];
    const baseId = slugifyChannelName(name);
    const id = ensureUniqueChannelId(baseId, channels);
    channels.push({ id, name, created: Date.now() });
    return { channels };
  });

  if (!next) {
    window.workspaceApp?.showWorkspaceAccessError?.('Unable to add a channel right now. Please try again.');
    return false;
  }

  activeWorkspaceRecord = next;
  activeWorkspaceView?.updateWorkspace(next);
  return true;
}

function notifyWorkspaceSubpageChange(workspaceId, subpageId) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
    return;
  }
  const detail = { workspaceId, subpage: subpageId };
  window.dispatchEvent(new CustomEvent('workspace:subpage-change', { detail }));
}

function buildWorkspaceSubpages(workspace) {
  return [
    {
      id: 'activity',
      label: 'Activity',
      render: (data) => {
        const memberCount = Array.isArray(data.members) ? data.members.length : 0;
        const channelCount = Array.isArray(data.channels) ? data.channels.length : 0;
        const requests = Array.isArray(data.requests) ? data.requests : [];
        const requestCount = requests.length;
        const requestItems = requests.map(request => `
          <li>
            <span class="workspace-ui__requestName">${request.name || 'Pending member'}</span>
            <span class="workspace-ui__requestMeta">${request.note || 'Awaiting review'}</span>
          </li>
        `).join('');
        return `
          <div class="workspace-ui__panel">
            <h2>Workspace activity</h2>
            <p class="workspace-ui__panelSummary">${memberCount} members · ${channelCount} channels · ${requestCount} requests</p>
            <div class="workspace-ui__metricGrid">
              <div class="workspace-ui__metric">
                <span class="workspace-ui__metricLabel">Active invites</span>
                <span class="workspace-ui__metricValue">${Math.max(1, Math.floor(memberCount / 2))}</span>
              </div>
            <div class="workspace-ui__metric">
              <span class="workspace-ui__metricLabel">Pending approvals</span>
              <span class="workspace-ui__metricValue">${requestCount}</span>
            </div>
          </div>
          <div class="workspace-ui__requests" aria-live="polite">
            <h3>Join requests</h3>
              ${requests.length ? `<ul class="workspace-ui__panelList">${requestItems}</ul>` : '<p class="workspace-ui__panelEmpty">No pending requests.</p>'}
          </div>
        </div>
      `;
    }
  },
    {
      id: 'visualizations',
      label: 'Visualizations',
      render: () => `
        <div class="workspace-ui__panel">
          <h2>Visualization modes</h2>
          <p class="workspace-ui__panelSummary">Switch between dashboards to explore workspace data.</p>
          <ul class="workspace-ui__panelList">
            <li>Channel message volume</li>
            <li>Member participation over time</li>
            <li>Network routes and latency</li>
          </ul>
          <p class="workspace-ui__panelHint">Hook your data visualizations into this area to prototype alternate layouts.</p>
        </div>
      `
    }
  ];
}

// Waits until the WorkspaceView constructor is available before rendering.
function waitForWorkspaceView(timeout = WORKSPACE_VIEW_POLL_INTERVAL * WORKSPACE_VIEW_POLL_LIMIT) {
  if (typeof WorkspaceView === 'function') {
    return Promise.resolve(WorkspaceView);
  }

  if (workspaceViewReadyPromise) {
    return workspaceViewReadyPromise;
  }

  workspaceViewReadyPromise = new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;

    const check = () => {
      if (typeof WorkspaceView === 'function') {
        resolve(WorkspaceView);
        workspaceViewReadyPromise = null;
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('WorkspaceView module did not load in time.'));
        workspaceViewReadyPromise = null;
        return;
      }
      setTimeout(check, WORKSPACE_VIEW_POLL_INTERVAL);
    };

    check();
  });

  return workspaceViewReadyPromise;
}

// Entry point used by buttons/cards to launch the workspace shell.
async function enterWorkspace(workspaceIdOrCode) {
  const raw = String(workspaceIdOrCode || '').trim();
  const normalized = normalizeWorkspaceCode(raw);
  if (!raw && !normalized) {
    return;
  }

  const lookupCandidates = [];
  if (raw) {
    lookupCandidates.push(raw);
  }
  if (normalized && normalized !== raw) {
    lookupCandidates.push(normalized);
  }

  let workspace = null;
  for (const candidate of lookupCandidates) {
    workspace = readWorkspace(candidate);
    if (workspace) {
      break;
    }
  }

  if (!workspace && normalized) {
    workspace = getWorkspaceByInvite(normalized) || getWorkspaceByInvite(raw);
  }

  if (!workspace) {
    window.workspaceApp?.showWorkspaceAccessError?.('We could not find that workspace. It may have been removed.');
    return;
  }

  try {
    await waitForWorkspaceView();
  } catch (error) {
    console.error('Workspace view failed to load', error);
    window.workspaceApp?.showWorkspaceAccessError?.('The workspace interface is still loading. Please try again in a moment.');
    return;
  }

  const safeWorkspace = ensureWorkspaceShape(workspace);
  activeWorkspaceRecord = safeWorkspace;

  const root = document.getElementById('workspaceRoot');
  if (root) {
    root.hidden = true;
  }

  if (activeWorkspaceView) {
    try {
      activeWorkspaceView.destroy();
    } catch (error) {
      console.warn('Unable to clean up previous workspace view', error);
    }
    activeWorkspaceView = null;
  }

  const container = document.createElement('div');
  container.id = 'activeWorkspaceView';

  const viewOptions = {
    container,
    subpages: buildWorkspaceSubpages(safeWorkspace),
    fallbackLink: getWorkspaceShareLink(safeWorkspace),
    onLeave: leaveWorkspaceView,
    onCopyLink: () => handleWorkspaceLinkCopy(activeWorkspaceRecord),
    onChannelCreate: (name) => handleWorkspaceChannelCreate(activeWorkspaceRecord, name),
    onSubpageChange: (subpageId) => notifyWorkspaceSubpageChange(safeWorkspace.id, subpageId)
  };

  try {
    activeWorkspaceView = new WorkspaceView(safeWorkspace, viewOptions);
    activeWorkspaceView.mount(document.body);
  } catch (error) {
    console.error('Unable to mount workspace view', error);
    activeWorkspaceView = null;
    window.workspaceApp?.showWorkspaceAccessError?.('We hit a snag opening that workspace. Refresh and try again.');
    return;
  }

  window.workspaceApp?.clearLibraryMessage?.();

  const activeState = { workspaceId: safeWorkspace.id, channelId: safeWorkspace.channels[0]?.id || 'general' };
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, JSON.stringify(activeState));
  } catch (error) {
    console.warn('Unable to persist active workspace', error);
  }

  window.workspaceApp?.setActiveWorkspace(safeWorkspace.id);
  if (typeof window !== 'undefined') {
    const targetHash = `#/workspace/${safeWorkspace.id}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }
  initializeWorkspaceConnections(safeWorkspace);
  if (window.App?.setWorkspaceContext) {
    window.App.setWorkspaceContext(safeWorkspace.id);
  }
  if (root) {
    root.hidden = true;
  }
}

function leaveWorkspaceView() {
  if (activeWorkspaceView) {
    activeWorkspaceView.destroy();
    activeWorkspaceView = null;
  } else {
    const view = document.getElementById('activeWorkspaceView');
    view?.remove();
  }
  const root = document.getElementById('workspaceRoot');
  if (root) {
    root.hidden = false;
  }
  localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  activeWorkspaceRecord = null;
  window.workspaceApp?.setActiveWorkspace(null);
  window.workspaceApp?.renderLanding();
  window.workspaceApp?.clearLibraryMessage?.();
  if (typeof window !== 'undefined') {
    const currentHash = window.location.hash || '';
    if (/^#\/?workspace\//i.test(currentHash)) {
      window.location.hash = '#/';
    }
  }
  if (window.App?.setWorkspaceContext) {
    window.App.setWorkspaceContext(null, { ensureIdentity: false });
  }
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
    this.libraryMessage = null;
    this.libraryMessageType = 'info';
    this.libraryMessageTimer = null;
    this.flowState = {
      step: 'mode',
      mode: null,
      draft: null,
      joinTarget: null,
      resultWorkspace: null,
      memberProfile: null,
      plainPassword: ''
    };

    if (this.root) {
      this.renderLanding();
    }
  }

  setActiveWorkspace(id) {
    this.activeWorkspaceId = id || null;
    this.updateHeroVisibility();
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
        resultWorkspace: null,
        memberProfile: null,
        plainPassword: ''
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
      <div
        class="flow-step"
        data-step-index="${step.id}"
        data-step-order="${index + 1}"
        data-state="pending"
      >
        <span class="step-number" aria-hidden="true">${index + 1}</span>
        <span class="step-label">${step.label}</span>
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
      const order = Number.parseInt(stepEl.getAttribute('data-step-order'), 10) || position + 1;
      const number = stepEl.querySelector('.step-number');
      if (position < currentIndex) {
        stepEl.dataset.state = 'complete';
        if (number) {
          number.textContent = '✓';
        }
      } else if (position === currentIndex) {
        stepEl.dataset.state = 'active';
        if (number) {
          number.textContent = `${order}`;
        }
      } else {
        stepEl.dataset.state = 'pending';
        if (number) {
          number.textContent = `${order}`;
        }
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
          <strong>${draft.name}</strong> will be locked with a single master password that we generate for you. Share it carefully—everyone uses the same credential to unlock history, invites, and admin tools.
        </div>
        <form id="createWorkspaceSecurity" class="form-grid" novalidate>
          <div class="field-group" data-field="workspacePassword">
            <h4>Automatic protection</h4>
            <p class="field-hint">We'll generate the master password during setup and show it once on the next screen. Save it securely—it unlocks everything for this workspace.</p>
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
          </div>
        </form>
      </div>
    `;

    const form = this.flowBody.querySelector('#createWorkspaceSecurity');

    form.addEventListener('submit', event => {
      event.preventDefault();
      this.handleCreateSecuritySubmit(form);
    });

    form.querySelector('[data-action="back-to-details"]')?.addEventListener('click', () => {
      this.flowState.step = 'details';
      this.updateFlowUI();
    });

  }

  async handleCreateSecuritySubmit(form) {
    this.clearFormErrors(form);
    const twoFactorInput = form.querySelector('#createWorkspace2FA');
    const errorMessage = form.querySelector('#createSecurityError');
    const submitButton = form.querySelector('button[type="submit"]');

    this.setButtonLoading(submitButton, true);
    try {
      await this.completeWorkspaceSetup({ twoFactor: twoFactorInput?.checked || false });
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

  // Finalise workspace creation by persisting and updating local state.
  async completeWorkspaceSetup({ twoFactor }) {
    const draft = this.flowState.draft;
    if (!draft) {
      return;
    }

    const now = Date.now();
    const workspaceId = ensureUniqueWorkspaceId();
    const inviteCode = generateInviteCode();
    const creatorPeerId = window.App?.peer?.id || null;
    const passwordManager = window?.masterPasswordManager || null;
    const masterPassword = passwordManager?.ensurePassword() || await captureWorkspacePassword({ mode: 'create' });
    passwordManager?.remember(masterPassword);

    const profile = await ensureWorkspaceMemberProfile(workspaceId, {
      workspaceName: draft.name || workspaceId,
      forceNew: true,
      password: masterPassword
    });

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

    const strength = evaluatePasswordStrength(masterPassword);
    workspace.security = {
      passwordEnabled: true,
      passwordStrength: describeStrength(strength),
      passwordDigest: await hashWorkspaceSecret(masterPassword),
      twoFactor: Boolean(twoFactor),
      createdAt: now,
      explanation: 'Protects workspace invites, history, and admin settings.'
    };

    workspace.audit = {
      createdBy: profile.id,
      createdAt: now
    };

    if (!saveWorkspace(workspace)) {
      throw new Error('Workspace could not be saved to local storage.');
    }

    this.flowState.resultWorkspace = workspace;
    this.flowState.mode = 'create';
    this.flowState.step = 'success';
    this.flowState.memberProfile = profile;
    this.flowState.plainPassword = masterPassword || '';
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
    const passwordValue = passwordInput?.value.trim() || '';
    const errorEl = form.querySelector('#joinSecurityError');
    const submitButton = form.querySelector('button[type="submit"]');

    if (passwordRequired && !passwordValue) {
      this.setFieldError(form, 'workspacePassword', 'Password is required to join this workspace.');
      passwordInput?.focus();
      return;
    }

    this.setButtonLoading(submitButton, true);

    try {
      if (passwordRequired && passwordInput) {
        const digest = await hashWorkspaceSecret(passwordValue);
        if (digest !== workspace.security?.passwordDigest) {
          this.setFieldError(form, 'workspacePassword', 'That password is incorrect.');
          passwordInput.value = '';
          passwordInput.focus();
          return;
        }
      }

      await this.finalizeJoin(workspace, passwordValue);
    } catch (error) {
      console.warn('Unable to join workspace', error);
      if (errorEl) {
        if (error?.code === 'PASSWORD_CANCELLED') {
          errorEl.textContent = 'Join cancelled. Password verification is required for this workspace.';
        } else if (error?.code === 'PASSWORD_INVALID') {
          errorEl.textContent = 'That password was incorrect. Please try again.';
        } else {
          errorEl.textContent = 'We hit a snag while joining. Please try again.';
        }
        errorEl.hidden = false;
      }
    } finally {
      this.setButtonLoading(submitButton, false);
    }
  }

  // Apply membership changes locally once a join flow is successful.
  async finalizeJoin(workspace, providedPassword = '') {
    const profile = await ensureWorkspaceMemberProfile(workspace.id, {
      workspaceName: workspace.name || workspace.id,
      verify: true,
      password: providedPassword
    });
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

    if (!saveWorkspace(safeWorkspace)) {
      throw new Error('Workspace membership could not be persisted.');
    }

    this.flowState.resultWorkspace = safeWorkspace;
    this.flowState.joinTarget = safeWorkspace;
    this.flowState.step = 'success';
    this.flowState.mode = 'join';
    this.flowState.memberProfile = profile;
    this.flowState.plainPassword = '';
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

    const inviteLink = escapeHTML(getWorkspaceShareLink(workspace));
    const mode = this.flowState.mode || 'create';
    const badgeText = mode === 'create' ? 'Workspace ready' : 'Access granted';
    const heading = mode === 'create' ? 'Workspace ready!' : 'Access secured!';
    const inviteCode = escapeHTML(workspace.inviteCode || '------');
    const hasPassword = Boolean(workspace.security?.passwordEnabled);
    const plainPassword = this.flowState.plainPassword || '';
    const canShowPassword = hasPassword && plainPassword;
    const passwordCard = canShowPassword ? `
      <div class="credential-card emphasized">
        <div class="credential-header">
          <span class="icon" aria-hidden="true">🔐</span>
          <label>Master password (auto-generated)</label>
        </div>
        <div class="credential-value credential-value--password">${escapeHTML(plainPassword)}</div>
        <button class="btn-copy" type="button" data-copy-value="${escapeHTML(plainPassword)}">
          <span aria-hidden="true">📋</span>
          <span>Copy password</span>
        </button>
        <p class="helper-text">Save this password—it unlocks workspace access, encrypted history, and stored identities.</p>
      </div>
    ` : `
      <div class="credential-card muted">
        <div class="credential-header">
          <span class="icon" aria-hidden="true">🔐</span>
          <label>Master password</label>
        </div>
        <p class="helper-text">Only workspace owners can reveal the master password.</p>
      </div>
    `;
    const warningText = 'Store the master password somewhere safe and share it through a separate channel from the invite link.';

    this.flowBody.innerHTML = `
      <div class="success-container" data-badge="${badgeText}">
        <div class="success-icon" aria-hidden="true">✓</div>
        <h3 class="success-title">${heading}</h3>
        <p class="success-subtitle">Your secure workspace has been created with multi-layer protection.</p>

        <div class="credential-display">
          <div class="invite-code-section">
            <label>Quick access code</label>
            <div class="invite-code">${inviteCode}</div>
          </div>

          <div class="credentials-grid">
            <div class="credential-card">
              <div class="credential-header">
                <span class="icon" aria-hidden="true">🔗</span>
                <label>Encrypted workspace link</label>
              </div>
              <div class="credential-value credential-value--code">${inviteLink}</div>
              <button class="btn-primary" type="button" data-copy-value="${inviteLink}">Copy link</button>
            </div>
            ${passwordCard}
          </div>
        </div>

        <div class="warning-box" role="alert">
          <span class="warning-icon" aria-hidden="true">⚠️</span>
          <div class="warning-content">
            <p class="warning-title">Security reminder</p>
            <p class="warning-text">${warningText}</p>
          </div>
        </div>

        <div class="button-group">
          <button type="button" class="btn btn-primary" data-action="enter-workspace" data-workspace-id="${workspace.id}">
            <span aria-hidden="true">🚀</span>
            <span>Open workspace</span>
          </button>
          <button type="button" class="btn btn-secondary" data-action="reset-flow">
            Start another setup
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

    this.flowBody.querySelectorAll('[data-copy-value]')?.forEach(button => {
      button.addEventListener('click', async event => {
        const value = event.currentTarget.getAttribute('data-copy-value');
        if (!value) {
          return;
        }
        try {
          await navigator.clipboard?.writeText(value);
          event.currentTarget.classList.add('copied');
          setTimeout(() => event.currentTarget.classList.remove('copied'), 1200);
        } catch (error) {
          showWorkspaceLinkFallback(value);
        }
      });
    });

    this.flowBody.querySelector('[data-action="reset-flow"]')?.addEventListener('click', () => this.resetFlow());
  }

  renderWorkspaceList(workspaces = []) {
    if (!this.librarySection) {
      return;
    }

    if (!workspaces.length) {
      this.librarySection.innerHTML = `
        ${this.renderLibraryMessage()}
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
      ${this.renderLibraryMessage()}
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
      resultWorkspace: null,
      memberProfile: null,
      plainPassword: ''
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
      this.flowState.memberProfile = null;
      this.flowState.plainPassword = '';
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

  // Render a contextual banner above the workspace list to guide troubleshooting.
  renderLibraryMessage() {
    if (!this.libraryMessage) {
      return '';
    }
    const variant = this.libraryMessageType || 'info';
    return `
      <div class="workspace-message" data-variant="${escapeHTML(variant)}" role="alert">
        ${escapeHTML(this.libraryMessage)}
      </div>
    `;
  }

  // Helper used by flows to queue a temporary status or error message.
  setLibraryMessage(message, type = 'info', { autoClear = true } = {}) {
    this.libraryMessage = message || null;
    this.libraryMessageType = type;
    if (this.libraryMessageTimer) {
      clearTimeout(this.libraryMessageTimer);
      this.libraryMessageTimer = null;
    }
    if (this.librarySection) {
      this.renderWorkspaceList(this.workspaces);
    }
    if (this.libraryMessage && autoClear) {
      this.libraryMessageTimer = setTimeout(() => this.clearLibraryMessage(), 4000);
    }
  }

  // Remove any active status banner and refresh the library list.
  clearLibraryMessage() {
    this.libraryMessage = null;
    this.libraryMessageType = 'info';
    if (this.libraryMessageTimer) {
      clearTimeout(this.libraryMessageTimer);
      this.libraryMessageTimer = null;
    }
    if (this.librarySection) {
      this.renderWorkspaceList(this.workspaces);
    }
  }

  // Surface workspace access problems in the library panel for quick debugging.
  showWorkspaceAccessError(message) {
    this.setLibraryMessage(message, 'error');
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

  let restored = false;

  if (typeof window !== 'undefined') {
    const hash = window.location.hash || '';
    const match = hash.match(/^#\/?workspace\/([A-Za-z0-9-]+)/);
    if (match && match[1] && readWorkspace(match[1])) {
      enterWorkspace(match[1]);
      restored = true;
    }
  }

  if (!restored) {
    const activeRaw = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if (activeRaw) {
      try {
        const parsed = JSON.parse(activeRaw);
        if (parsed?.workspaceId && readWorkspace(parsed.workspaceId)) {
          enterWorkspace(parsed.workspaceId);
          restored = true;
        }
      } catch (error) {
        console.warn('Unable to restore active workspace', error);
      }
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
