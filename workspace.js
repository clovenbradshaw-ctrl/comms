
class WorkspaceApp {
  constructor() {
    this.storageKey = 'workspaceApp.v1';
    this.profileKey = 'workspaceApp.profile';
    this.elements = {
      root: document.getElementById('workspaceApp'),
      content: document.getElementById('workspaceContent'),
      heroStats: document.getElementById('workspaceHeroStats'),
      createBtn: document.getElementById('createWorkspaceBtn'),
      findBtn: document.getElementById('findWorkspaceBtn')
    };

    if (!this.elements.root) {
      return;
    }

    this.state = this.loadState();
    this.profile = this.loadProfile();
    this.currentWorkspaceId = null;
    this.activeView = null;

    this.bindHeroButtons();
    this.renderLanding();
  }

  loadState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return { workspaces: [] };
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.workspaces)) {
        parsed.workspaces = [];
      }
      return parsed;
    } catch (error) {
      console.warn('Unable to load workspace state', error);
      return { workspaces: [] };
    }
  }

  loadProfile() {
    try {
      const raw = localStorage.getItem(this.profileKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.id && parsed.displayName) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Unable to load profile, using defaults', error);
    }
    const profile = {
      id: crypto.randomUUID(),
      displayName: 'Workspace Owner'
    };
    localStorage.setItem(this.profileKey, JSON.stringify(profile));
    return profile;
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.warn('Unable to save workspace state', error);
    }
  }

  bindHeroButtons() {
    this.elements.createBtn?.addEventListener('click', () => this.showCreation());
    this.elements.findBtn?.addEventListener('click', () => this.showJoin());
  }

  updateHeroStats() {
    if (!this.elements.heroStats) {
      return;
    }
    const workspaces = this.state.workspaces.length;
    const members = this.state.workspaces.reduce((acc, ws) => acc + ws.members.length, 0);
    const pending = this.state.workspaces.reduce((acc, ws) => acc + ws.pendingRequests.length, 0);
    const channels = this.state.workspaces.reduce((acc, ws) => acc + ws.channels.length, 0);
    this.elements.heroStats.innerHTML = `
      <div class="stat">
        <span class="stat-number">${workspaces}</span>
        <span class="stat-label">Workspaces</span>
      </div>
      <div class="stat">
        <span class="stat-number">${members}</span>
        <span class="stat-label">Members</span>
      </div>
      <div class="stat">
        <span class="stat-number">${pending}</span>
        <span class="stat-label">Pending Requests</span>
      </div>
      <div class="stat">
        <span class="stat-number">${channels}</span>
        <span class="stat-label">Channels</span>
      </div>
    `;
  }

  renderLanding() {
    if (!this.elements.content) {
      return;
    }
    this.updateHeroStats();
    if (!this.state.workspaces.length) {
      this.elements.content.innerHTML = `
        <div class="workspace-empty">
          <div class="empty-illustration">✨</div>
          <h2>Create your first workspace</h2>
          <p>Persistent hubs keep members, invites, and channels available even after everyone leaves.</p>
          <button class="btn-primary large" id="emptyCreateBtn">Start Workspace Setup</button>
        </div>
      `;
      document.getElementById('emptyCreateBtn')?.addEventListener('click', () => this.showCreation());
      return;
    }

    const cards = this.state.workspaces.map(workspace => {
      const pendingBadge = workspace.pendingRequests.length
        ? `<span class="pending-badge">${workspace.pendingRequests.length}</span>`
        : '';
      return `
        <article class="workspace-card" data-id="${workspace.id}">
          <header class="workspace-card-header">
            <div class="workspace-card-title">
              <div class="workspace-card-icon">${this.generateIcon(workspace.name)}</div>
              <div>
                <h3>${workspace.name}</h3>
                <p>${workspace.description || 'Private workspace'}</p>
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
              <span class="stat-number">${workspace.pendingRequests.length}</span>
              <span class="stat-label">Pending</span>
            </div>
          </div>
          <footer class="workspace-card-footer">
            <span class="workspace-url">${window.location.origin}/#/${workspace.id}</span>
            ${pendingBadge}
          </footer>
        </article>
      `;
    }).join('');

    this.elements.content.innerHTML = `<div class="workspace-grid">${cards}</div>`;
    this.elements.content.querySelectorAll('[data-action="open"]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const id = button.getAttribute('data-id');
        this.openWorkspace(id);
      });
    });
    this.elements.content.querySelectorAll('.workspace-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        this.openWorkspace(id);
      });
    });
  }

  showCreation() {
    if (!this.elements.content) {
      return;
    }
    const creation = new WorkspaceCreation(this);
    creation.render();
    this.activeView = creation;
  }

  showJoin(initialId = '') {
    if (!this.elements.content) {
      return;
    }
    const joinShell = new WorkspaceJoinShell(this, initialId);
    joinShell.render();
    this.activeView = joinShell;
  }

  openWorkspace(workspaceId) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      this.showJoin(workspaceId);
      return;
    }
    this.currentWorkspaceId = workspaceId;
    this.renderWorkspaceDashboard(workspace);
  }

  renderWorkspaceDashboard(workspace) {
    if (!this.elements.content) {
      return;
    }
    const created = new Date(workspace.created).toLocaleDateString();
    this.elements.content.innerHTML = `
      <section class="workspace-dashboard" data-id="${workspace.id}">
        <header class="workspace-dashboard-header">
          <div class="workspace-card-icon large">${this.generateIcon(workspace.name)}</div>
          <div class="workspace-dashboard-meta">
            <h2>${workspace.name}</h2>
            <p>${workspace.description || 'Private workspace'}</p>
            <div class="workspace-dashboard-stats">
              <span>${workspace.members.length} members</span>
              <span>${workspace.channels.length} channels</span>
              <span>Created ${created}</span>
            </div>
          </div>
          <div class="workspace-dashboard-actions">
            <button class="btn-secondary" data-action="share">Copy Workspace Link</button>
            <button class="btn-primary" data-action="invite">Generate Invite</button>
          </div>
        </header>
        <nav class="workspace-tabs" aria-label="Workspace sections">
          <button class="tab-btn active" data-tab="overview">Overview</button>
          <button class="tab-btn" data-tab="approvals">Approvals</button>
          <button class="tab-btn" data-tab="members">Members</button>
          <button class="tab-btn" data-tab="settings">Settings</button>
        </nav>
        <div class="workspace-tab-content" id="workspaceTabContent"></div>
      </section>
    `;

    const actions = this.elements.content.querySelector('.workspace-dashboard-actions');
    actions?.querySelector('[data-action="share"]').addEventListener('click', () => this.copyWorkspaceLink(workspace.id));
    actions?.querySelector('[data-action="invite"]').addEventListener('click', () => {
      this.generateInvite(workspace.id);
      this.refreshCurrentWorkspace();
    });

    const renderTab = tab => {
      const fresh = this.getWorkspace(workspace.id);
      if (!fresh) {
        this.renderLanding();
        return;
      }
      const target = document.getElementById('workspaceTabContent');
      if (!target) {
        return;
      }
      switch (tab) {
        case 'approvals': {
          const approvals = new ApprovalQueue(this, fresh, target);
          approvals.renderApprovalPanel();
          this.activeView = approvals;
          break;
        }
        case 'members': {
          const members = new WorkspaceMemberManagement(this, fresh, target);
          members.renderMembersTab();
          this.activeView = members;
          break;
        }
        case 'settings': {
          const settings = new WorkspaceSettings(this, fresh, target);
          settings.renderSettingsPanel();
          this.activeView = settings;
          break;
        }
        default:
          target.innerHTML = this.renderOverview(fresh);
          this.activeView = null;
          break;
      }
    };

    this.elements.content.querySelectorAll('.tab-btn').forEach(button => {
      button.addEventListener('click', event => {
        this.elements.content.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        event.currentTarget.classList.add('active');
        renderTab(event.currentTarget.getAttribute('data-tab'));
      });
    });

    renderTab('overview');
  }

  renderOverview(workspace) {
    const invites = workspace.activeInvites.length
      ? workspace.activeInvites.map(invite => `
          <div class="invite-summary">
            <div>
              <strong>${invite.code}</strong>
              <span class="invite-meta">Created by ${invite.creatorName}</span>
            </div>
            <div class="invite-meta">Expires ${this.formatRelative(invite.expiresAt)}</div>
          </div>
        `).join('')
      : '<p class="muted">No active invites yet.</p>';

    const pending = workspace.pendingRequests.length
      ? workspace.pendingRequests.slice(0, 3).map(req => `
          <div class="request-mini">
            <div>
              <strong>${req.requester.name}</strong>
              <span class="request-meta">${this.formatRelative(req.timestamp)}</span>
            </div>
            <span class="request-meta">${req.approvals.length}/${this.getRequiredApprovals(workspace)}</span>
          </div>
        `).join('')
      : '<p class="muted">All caught up.</p>';

    return `
      <section class="overview-grid">
        <div class="overview-card">
          <h3>Activity</h3>
          <div class="overview-stats">
            <div>
              <span class="stat-number">${workspace.members.length}</span>
              <span class="stat-label">Members</span>
            </div>
            <div>
              <span class="stat-number">${workspace.pendingRequests.length}</span>
              <span class="stat-label">Pending approvals</span>
            </div>
            <div>
              <span class="stat-number">${workspace.channels.length}</span>
              <span class="stat-label">Channels</span>
            </div>
          </div>
        </div>
        <div class="overview-card">
          <h3>Pending Requests</h3>
          ${pending}
        </div>
        <div class="overview-card">
          <h3>Active Invites</h3>
          ${invites}
        </div>
      </section>
    `;
  }

  copyWorkspaceLink(id) {
    const link = `${window.location.origin}/#/${id}`;
    navigator.clipboard?.writeText(link)
      .then(() => this.showToast('Workspace link copied'))
      .catch(() => this.showToast('Unable to copy link automatically'));
  }

  generateInvite(workspaceId) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    const invite = {
      id: crypto.randomUUID(),
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      creatorId: this.profile.id,
      creatorName: this.profile.displayName,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 24
    };
    workspace.activeInvites.push(invite);
    this.saveState();
    this.updateHeroStats();
    this.showToast(`Invite ${invite.code} created`);
  }

  addWorkspace(workspace) {
    this.state.workspaces.push(workspace);
    this.saveState();
    this.updateHeroStats();
    this.openWorkspace(workspace.id);
  }

  getWorkspace(id) {
    return this.state.workspaces.find(ws => ws.id === id);
  }

  updateWorkspace(updated) {
    const index = this.state.workspaces.findIndex(ws => ws.id === updated.id);
    if (index >= 0) {
      this.state.workspaces[index] = updated;
      this.saveState();
      this.updateHeroStats();
    }
  }

  handleJoinRequest(workspaceId, request) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    workspace.pendingRequests.push(request);
    this.saveState();
    this.updateHeroStats();
  }

  finalizeApproval(workspaceId, request, status) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    workspace.pendingRequests = workspace.pendingRequests.filter(item => item.id !== request.id);
    if (status === 'approved') {
      workspace.members.push({
        id: request.requester.publicKey,
        displayName: request.requester.name || 'New Member',
        email: request.requester.email || '',
        role: 'member',
        joinedAt: Date.now(),
        avatar: this.generateAvatar(request.requester.name)
      });
    }
    this.saveState();
    this.updateHeroStats();
  }

  removePendingRequest(workspaceId, requestId) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    workspace.pendingRequests = workspace.pendingRequests.filter(req => req.id !== requestId);
    this.saveState();
    this.updateHeroStats();
  }

  addMember(workspaceId, member) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    workspace.members.push(member);
    this.saveState();
    this.updateHeroStats();
  }

  updateWorkspaceSettings(workspaceId, updates) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    workspace.name = updates.name;
    workspace.description = updates.description;
    workspace.settings = updates.settings;
    this.saveState();
    this.updateHeroStats();
  }

  refreshCurrentWorkspace() {
    if (!this.currentWorkspaceId) {
      return;
    }
    const workspace = this.getWorkspace(this.currentWorkspaceId);
    if (!workspace) {
      this.renderLanding();
      return;
    }
    this.renderWorkspaceDashboard(workspace);
  }

  removeMember(workspaceId, memberId) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    workspace.members = workspace.members.filter(member => member.id !== memberId);
    this.saveState();
    this.updateHeroStats();
  }

  promoteMember(workspaceId, memberId) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    const member = workspace.members.find(item => item.id === memberId);
    if (member) {
      member.role = 'admin';
      this.saveState();
    }
  }

  revokeInvite(workspaceId, inviteId) {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      return;
    }
    workspace.activeInvites = workspace.activeInvites.filter(invite => invite.id !== inviteId);
    this.saveState();
  }

  showToast(message) {
    let toast = document.getElementById('workspaceToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'workspaceToast';
      toast.className = 'workspace-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2400);
  }

  getRequiredApprovals(workspace) {
    const members = workspace.settings.adminOnlyApprove
      ? workspace.members.filter(member => member.role === 'admin').length
      : workspace.members.length;
    switch (workspace.settings.approvalCount) {
      case 'majority':
        return Math.floor(members / 2) + 1;
      case 'all':
        return members;
      default:
        return Number.parseInt(workspace.settings.approvalCount, 10) || 1;
    }
  }

  formatRelative(timestamp) {
    const diff = timestamp - Date.now();
    if (!Number.isFinite(diff)) {
      return 'soon';
    }
    const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const table = [
      ['day', 1000 * 60 * 60 * 24],
      ['hour', 1000 * 60 * 60],
      ['minute', 1000 * 60],
      ['second', 1000]
    ];
    for (const [unit, value] of table) {
      if (Math.abs(diff) >= value || unit === 'second') {
        return rel.format(Math.round(diff / value), unit);
      }
    }
    return 'soon';
  }

  generateIcon(name = '') {
    const initial = (name || 'W').trim().charAt(0).toUpperCase();
    return initial || 'W';
  }

  generateAvatar(name = '') {
    const initial = this.generateIcon(name);
    return `<span class="avatar-initial">${initial}</span>`;
  }
}

class WorkspaceCreation {
  constructor(app) {
    this.app = app;
    this.container = app.elements.content;
    this.approvalCount = '1';
  }

  render() {
    if (!this.container) {
      return;
    }
    this.container.innerHTML = `
      <div class="workspace-setup">
        <div class="setup-header">
          <h1>Create Your Workspace</h1>
          <p>Build a secure, persistent space for your team</p>
        </div>
        <div class="setup-section">
          <label for="workspaceName">Workspace Name</label>
          <input type="text" id="workspaceName" placeholder="e.g., Acme Team" maxlength="50" />
          <label for="workspaceId">Workspace URL</label>
          <div class="url-preview">
            <span class="url-base">${window.location.origin}/#/</span>
            <input type="text" id="workspaceId" placeholder="your-workspace" pattern="[a-z0-9-]+" maxlength="30" />
            <span class="url-status" id="urlStatus"></span>
          </div>
          <label for="workspaceDesc">Description (optional)</label>
          <textarea id="workspaceDesc" rows="2" placeholder="What's this workspace for?"></textarea>
        </div>
        <div class="setup-section">
          <h3>Who can join?</h3>
          <div class="access-options">
            <label class="access-option">
              <input type="radio" name="access" value="invite" checked />
              <div class="option-content">
                <span class="option-title">Invite Only</span>
                <span class="option-desc">People need an invite link from a member</span>
              </div>
            </label>
            <label class="access-option">
              <input type="radio" name="access" value="approval" />
              <div class="option-content">
                <span class="option-title">Request to Join</span>
                <span class="option-desc">Anyone with the link can request access</span>
              </div>
            </label>
            <label class="access-option">
              <input type="radio" name="access" value="domain" />
              <div class="option-content">
                <span class="option-title">Domain Restricted</span>
                <span class="option-desc">Auto-approve emails from specific domains</span>
                <input type="text" id="allowedDomains" placeholder="@company.com, @school.edu" style="margin-top:0.5rem;display:none;" />
              </div>
            </label>
          </div>
        </div>
        <div class="setup-section" id="approvalRules" style="display:none;">
          <h3>Approval Settings</h3>
          <div class="approval-settings">
            <label>How many approvals needed?</label>
            <div class="approval-options">
              <button class="count-option active" data-count="1">1</button>
              <button class="count-option" data-count="2">2</button>
              <button class="count-option" data-count="3">3</button>
              <button class="count-option" data-count="majority">Majority</button>
              <button class="count-option" data-count="all">All</button>
            </div>
            <label class="checkbox-option">
              <input type="checkbox" id="adminOnlyApprove" />
              <span>Only admins can approve</span>
            </label>
            <label class="checkbox-option">
              <input type="checkbox" id="autoExpire" checked />
              <span>Auto-reject after 48 hours</span>
            </label>
          </div>
        </div>
        <button class="btn-primary large" id="createWorkspaceAction">Create Workspace</button>
        <button class="btn-text" id="cancelWorkspaceCreation">Cancel</button>
      </div>
    `;
    this.bindEvents();
  }

  bindEvents() {
    const nameInput = document.getElementById('workspaceName');
    const idInput = document.getElementById('workspaceId');
    const accessOptions = document.querySelectorAll('input[name="access"]');
    const approvalRules = document.getElementById('approvalRules');
    const allowedDomains = document.getElementById('allowedDomains');

    nameInput?.addEventListener('input', () => this.generateWorkspaceId(nameInput.value));
    idInput?.addEventListener('input', () => {
      idInput.dataset.manual = 'true';
      this.validateWorkspaceId(idInput.value);
    });

    accessOptions.forEach(option => {
      option.addEventListener('change', event => {
        if (event.target.value === 'approval') {
          approvalRules.style.display = '';
          allowedDomains.style.display = 'none';
        } else if (event.target.value === 'domain') {
          approvalRules.style.display = 'none';
          allowedDomains.style.display = 'block';
        } else {
          approvalRules.style.display = 'none';
          allowedDomains.style.display = 'none';
        }
      });
    });

    document.querySelectorAll('.approval-options .count-option').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        document.querySelectorAll('.approval-options .count-option').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.approvalCount = button.getAttribute('data-count');
      });
    });

    document.getElementById('createWorkspaceAction')?.addEventListener('click', () => this.finalizeWorkspace());
    document.getElementById('cancelWorkspaceCreation')?.addEventListener('click', () => this.app.renderLanding());
  }

  generateWorkspaceId(name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
    const idInput = document.getElementById('workspaceId');
    if (idInput && idInput.dataset.manual !== 'true') {
      idInput.value = slug;
      this.validateWorkspaceId(slug);
    }
  }

  validateWorkspaceId(id) {
    const status = document.getElementById('urlStatus');
    if (!status) {
      return true;
    }
    if (!id) {
      status.textContent = '';
      status.className = 'url-status';
      return false;
    }
    if (!/^[a-z0-9-]{3,}$/.test(id)) {
      status.textContent = 'Invalid';
      status.className = 'url-status error';
      return false;
    }
    const exists = this.app.state.workspaces.some(workspace => workspace.id === id);
    if (exists) {
      status.textContent = 'Taken';
      status.className = 'url-status error';
      return false;
    }
    status.textContent = 'Available';
    status.className = 'url-status success';
    return true;
  }

  parseAllowedDomains(raw) {
    if (!raw) {
      return [];
    }
    return raw.split(/[\s,]+/)
      .map(domain => domain.trim())
      .filter(Boolean)
      .map(domain => domain.startsWith('@') ? domain : `@${domain}`);
  }

  finalizeWorkspace() {
    const nameInput = document.getElementById('workspaceName');
    const idInput = document.getElementById('workspaceId');
    const descInput = document.getElementById('workspaceDesc');
    const access = document.querySelector('input[name="access"]:checked');
    const adminOnly = document.getElementById('adminOnlyApprove');
    const autoExpire = document.getElementById('autoExpire');
    const allowedDomains = document.getElementById('allowedDomains');

    if (!nameInput?.value.trim()) {
      this.app.showToast('Workspace name is required');
      nameInput?.focus();
      return;
    }
    const workspaceId = idInput?.value.trim();
    if (!workspaceId || !this.validateWorkspaceId(workspaceId)) {
      this.app.showToast('Choose a valid workspace URL');
      idInput?.focus();
      return;
    }

    const settings = {
      access: access?.value || 'invite',
      approvalCount: this.approvalCount,
      adminOnlyApprove: adminOnly?.checked || false,
      autoExpireHours: autoExpire?.checked ? 48 : null,
      allowedDomains: access?.value === 'domain' ? this.parseAllowedDomains(allowedDomains?.value || '') : []
    };

    const workspace = {
      id: workspaceId,
      name: nameInput.value.trim(),
      description: descInput?.value.trim() || '',
      created: Date.now(),
      settings,
      members: [
        {
          id: this.app.profile.id,
          displayName: this.app.profile.displayName,
          role: 'admin',
          joinedAt: Date.now(),
          avatar: this.app.generateAvatar(this.app.profile.displayName)
        }
      ],
      pendingRequests: [],
      channels: [
        { id: 'general', name: 'general', description: 'General discussion' }
      ],
      activeInvites: []
    };

    this.app.addWorkspace(workspace);
    this.app.showToast('Workspace created');
  }
}

class WorkspaceJoinShell {
  constructor(app, initialId) {
    this.app = app;
    this.container = app.elements.content;
    this.initialId = initialId;
    this.joinFlow = null;
  }

  render() {
    if (!this.container) {
      return;
    }
    this.container.innerHTML = `
      <div class="join-shell">
        <div class="join-card">
          <h2>Find a Workspace</h2>
          <p>Enter the workspace URL to request access.</p>
          <label for="joinWorkspaceId">Workspace URL</label>
          <div class="join-input-row">
            <span class="url-base">${window.location.origin}/#/</span>
            <input type="text" id="joinWorkspaceId" placeholder="team-name" value="${this.initialId || ''}" />
            <button class="btn-primary" id="loadWorkspaceBtn">Open</button>
          </div>
          <div id="joinWorkspaceStatus" class="join-status"></div>
        </div>
        <div id="joinWorkspaceContent"></div>
      </div>
    `;

    document.getElementById('loadWorkspaceBtn')?.addEventListener('click', () => this.loadWorkspace());
    document.getElementById('joinWorkspaceId')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.loadWorkspace();
      }
    });

    if (this.initialId) {
      this.loadWorkspace();
    }
  }

  async loadWorkspace() {
    const input = document.getElementById('joinWorkspaceId');
    const status = document.getElementById('joinWorkspaceStatus');
    const container = document.getElementById('joinWorkspaceContent');
    if (!input || !status || !container) {
      return;
    }
    const id = input.value.trim();
    if (!id) {
      status.textContent = 'Enter a workspace URL to continue.';
      status.className = 'join-status error';
      container.innerHTML = '';
      return;
    }
    const workspace = this.app.getWorkspace(id);
    if (!workspace) {
      status.textContent = 'Workspace not found. Double-check the link from your host.';
      status.className = 'join-status error';
      container.innerHTML = '';
      return;
    }
    status.textContent = '';
    status.className = 'join-status';
    this.joinFlow = new JoinRequestFlow(this.app, workspace, container);
    await this.joinFlow.render();
  }
}

class JoinRequestFlow {
  constructor(app, workspace, container) {
    this.app = app;
    this.workspace = workspace;
    this.container = container;
    this.pendingRequest = null;
  }

  async render() {
    const stats = this.computeStats();
    this.container.innerHTML = `
      <div class="join-request-screen">
        <div class="workspace-preview">
          <div class="workspace-icon">${this.app.generateIcon(this.workspace.name)}</div>
          <h2>${this.workspace.name}</h2>
          <p>${this.workspace.description || 'Private workspace'}</p>
          <div class="workspace-stats">
            <div class="stat">
              <span class="stat-number">${stats.memberCount}</span>
              <span class="stat-label">Members</span>
            </div>
            <div class="stat">
              <span class="stat-number">${this.workspace.channels.length}</span>
              <span class="stat-label">Channels</span>
            </div>
            <div class="stat">
              <span class="stat-number">${stats.activeNow}</span>
              <span class="stat-label">Active now</span>
            </div>
          </div>
        </div>
        ${this.renderJoinSection()}
      </div>
    `;
    this.bindEvents();
  }

  computeStats() {
    const memberCount = this.workspace.members.length;
    const activeNow = Math.max(1, Math.min(memberCount, Math.floor(memberCount / 2) || 1));
    return { memberCount, activeNow };
  }

  renderJoinSection() {
    if (this.workspace.settings.access === 'invite') {
      return `
        <div class="invite-required">
          <div class="locked-icon">🔒</div>
          <h3>Invite Required</h3>
          <p>This workspace requires an invitation from a current member.</p>
          <div class="invite-input">
            <label for="inviteCode">Have an invite code?</label>
            <input type="text" id="inviteCode" placeholder="Enter invite code" />
            <button class="btn-primary" id="joinWithInvite">Join with Invite</button>
          </div>
          <button class="btn-text" id="requestInvite">Request an invitation</button>
        </div>
      `;
    }
    const domains = this.workspace.settings.allowedDomains || [];
    return `
      <div class="request-form">
        <h3>Request to Join</h3>
        <p>Your request will be reviewed by workspace members.</p>
        <label for="requesterName">Your Name</label>
        <input type="text" id="requesterName" placeholder="How should we call you?" value="${this.getSavedName()}" />
        <label for="requesterEmail">Email (optional)</label>
        <input type="email" id="requesterEmail" placeholder="your@email.com" />
        <label for="requestMessage">Message to admins</label>
        <textarea id="requestMessage" rows="3" placeholder="Why do you want to join? (optional)"></textarea>
        ${domains.length ? '<div class="auto-approve-notice" id="autoApproveNotice" style="display:none;">✅ Email domain eligible for automatic approval</div>' : ''}
        <button class="btn-primary" id="submitJoinRequest">Send Join Request</button>
      </div>
    `;
  }

  bindEvents() {
    const emailInput = this.container.querySelector('#requesterEmail');
    const submitBtn = this.container.querySelector('#submitJoinRequest');
    const inviteBtn = this.container.querySelector('#joinWithInvite');
    const requestInvite = this.container.querySelector('#requestInvite');

    emailInput?.addEventListener('input', () => this.checkDomainAutoApproval(emailInput.value));
    submitBtn?.addEventListener('click', () => this.submitJoinRequest());
    inviteBtn?.addEventListener('click', () => this.useInvite());
    requestInvite?.addEventListener('click', () => this.app.showToast('Invite request sent to admins'));
  }

  useInvite() {
    const input = this.container.querySelector('#inviteCode');
    if (!input?.value.trim()) {
      this.app.showToast('Enter an invite code first');
      return;
    }
    const match = this.workspace.activeInvites.find(invite => invite.code === input.value.trim());
    if (!match) {
      this.app.showToast('Invalid invite code');
      return;
    }
    this.workspace.activeInvites = this.workspace.activeInvites.filter(invite => invite.id !== match.id);
    const member = {
      id: crypto.randomUUID(),
      displayName: `Member ${this.workspace.members.length + 1}`,
      role: 'member',
      joinedAt: Date.now(),
      avatar: this.app.generateAvatar(`Member ${this.workspace.members.length + 1}`)
    };
    this.app.addMember(this.workspace.id, member);
    this.app.showToast('Invite accepted');
    this.container.innerHTML = this.showSuccess(member.displayName);
    this.bindSuccessActions();
    this.app.refreshCurrentWorkspace();
  }

  checkDomainAutoApproval(value) {
    const notice = this.container.querySelector('#autoApproveNotice');
    if (!notice) {
      return;
    }
    const eligible = (this.workspace.settings.allowedDomains || []).some(domain => value.endsWith(domain));
    notice.style.display = eligible ? 'block' : 'none';
  }

  async submitJoinRequest() {
    const nameInput = this.container.querySelector('#requesterName');
    const emailInput = this.container.querySelector('#requesterEmail');
    const messageInput = this.container.querySelector('#requestMessage');
    if (!nameInput?.value.trim()) {
      this.app.showToast('Please enter your name');
      nameInput?.focus();
      return;
    }
    const request = {
      id: crypto.randomUUID(),
      workspaceId: this.workspace.id,
      requester: {
        name: nameInput.value.trim(),
        email: emailInput?.value.trim() || '',
        message: messageInput?.value.trim() || '',
        publicKey: await this.generatePublicKey()
      },
      timestamp: Date.now(),
      status: 'pending',
      approvals: [],
      rejections: []
    };
    if (this.checkAutoApproval(request)) {
      this.app.finalizeApproval(this.workspace.id, request, 'approved');
      this.container.innerHTML = this.showSuccess(request.requester.name);
      this.app.showToast('Automatically approved');
      this.bindSuccessActions();
      this.app.refreshCurrentWorkspace();
    } else {
      this.app.handleJoinRequest(this.workspace.id, request);
      this.pendingRequest = request;
      this.container.innerHTML = this.showPendingScreen(request);
      localStorage.setItem('workspaceApp.lastName', request.requester.name);
      this.app.showToast('Join request sent');
      this.bindPendingActions(request);
      this.app.refreshCurrentWorkspace();
    }
  }

  checkAutoApproval(request) {
    if (this.workspace.settings.access === 'domain') {
      return this.workspace.settings.allowedDomains.some(domain => request.requester.email.endsWith(domain));
    }
    return false;
  }

  showSuccess(name) {
    return `
      <div class="request-success">
        <div class="success-icon">🎉</div>
        <h2>Welcome to ${this.workspace.name}</h2>
        <p>${name}, you're in! Explore channels and start collaborating.</p>
        <button class="btn-primary" id="openWorkspaceBtn">Open Workspace</button>
      </div>
    `;
  }

  showPendingScreen(request) {
    return `
      <div class="request-pending">
        <div class="pending-icon">⏳</div>
        <h2>Request Sent!</h2>
        <p>Your request to join <strong>${this.workspace.name}</strong> is pending approval.</p>
        <div class="request-status">
          <div class="status-item">
            <span class="label">Request ID:</span>
            <span class="value">${request.id.slice(0, 8)}</span>
          </div>
          <div class="status-item">
            <span class="label">Required approvals:</span>
            <span class="value">${this.app.getRequiredApprovals(this.workspace)}</span>
          </div>
          <div class="status-item">
            <span class="label">Expires:</span>
            <span class="value">48 hours</span>
          </div>
        </div>
        <div class="pending-actions">
          <button class="btn-primary" id="copyRequestLink">Copy Request Link</button>
          <button class="btn-secondary" id="checkStatus">Check Status</button>
        </div>
        <p class="hint">💡 You'll be notified when your request is approved. Bookmark this page to check your status.</p>
      </div>
    `;
  }

  bindSuccessActions() {
    this.container.querySelector('#openWorkspaceBtn')?.addEventListener('click', () => {
      this.app.openWorkspace(this.workspace.id);
    });
  }

  bindPendingActions(request) {
    this.container.querySelector('#copyRequestLink')?.addEventListener('click', () => {
      const link = `${window.location.origin}/#/${this.workspace.id}?request=${request.id}`;
      navigator.clipboard?.writeText(link)
        .then(() => this.app.showToast('Request link copied'))
        .catch(() => this.app.showToast('Unable to copy request link automatically'));
    });
    this.container.querySelector('#checkStatus')?.addEventListener('click', () => {
      this.app.showToast('We will refresh the status for you.');
      this.app.refreshCurrentWorkspace();
    });
  }

  async generatePublicKey() {
    try {
      if (crypto.subtle) {
        const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
        const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
        return JSON.stringify(jwk);
      }
    } catch (error) {
      console.warn('Falling back to random key', error);
    }
    return crypto.randomUUID();
  }

  getSavedName() {
    return localStorage.getItem('workspaceApp.lastName') || '';
  }
}

class ApprovalQueue {
  constructor(app, workspace, container) {
    this.app = app;
    this.workspace = workspace;
    this.container = container;
  }

  refresh() {
    this.workspace = this.app.getWorkspace(this.workspace.id);
    this.renderApprovalPanel();
  }

  renderApprovalPanel() {
    if (!this.container) {
      return;
    }
    const required = this.app.getRequiredApprovals(this.workspace);
    const requests = this.workspace.pendingRequests.map(request => `
      <div class="request-card" data-id="${request.id}">
        <div class="request-header">
          <div class="requester-info">
            <div class="requester-avatar">${this.app.generateIcon(request.requester.name)}</div>
            <div class="requester-details">
              <span class="requester-name">${request.requester.name}</span>
              <span class="request-time">${this.app.formatRelative(request.timestamp)}</span>
            </div>
          </div>
          <div class="approval-status">
            <span class="approval-count">${request.approvals.length}/${required}</span>
            <span class="approval-label">approvals</span>
          </div>
        </div>
        ${request.requester.email ? `
          <div class="request-email">
            <span class="email-icon">✉️</span>
            <span>${request.requester.email}</span>
            ${this.isDomainAllowed(request.requester.email) ? '<span class="auto-approve-badge">Auto-approve eligible</span>' : ''}
          </div>` : ''}
        ${request.requester.message ? `
          <div class="request-message"><p>${request.requester.message}</p></div>` : ''}
        <div class="vote-status">
          ${request.approvals.map(approval => `<span class="voter approved">✅ ${approval.memberName}</span>`).join('')}
          ${request.rejections.map(rejection => `<span class="voter rejected">❌ ${rejection.memberName}</span>`).join('')}
        </div>
        ${this.hasVoted(request.id) ? `
          <div class="vote-recorded">✓ You ${this.getMyVote(request.id)}</div>` : `
          <div class="request-actions">
            <button class="btn-approve" data-action="approve" data-id="${request.id}"><span>✓</span> Approve</button>
            <button class="btn-reject" data-action="reject" data-id="${request.id}"><span>×</span> Reject</button>
            <button class="btn-text" data-action="view" data-id="${request.id}">View Profile</button>
          </div>`}
      </div>
    `).join('');

    this.container.innerHTML = `
      <div class="approval-panel">
        <div class="panel-header">
          <h3>Pending Join Requests</h3>
          <span class="request-count">${this.workspace.pendingRequests.length}</span>
        </div>
        ${requests || '<div class="no-requests"><span class="empty-icon">✨</span><p>No pending requests</p></div>'}
      </div>
    `;

    this.container.querySelectorAll('[data-action="approve"]').forEach(button => {
      button.addEventListener('click', event => this.approveRequest(event.currentTarget.getAttribute('data-id')));
    });
    this.container.querySelectorAll('[data-action="reject"]').forEach(button => {
      button.addEventListener('click', event => this.rejectRequest(event.currentTarget.getAttribute('data-id')));
    });
    this.container.querySelectorAll('[data-action="view"]').forEach(button => {
      button.addEventListener('click', event => this.viewProfile(event.currentTarget.getAttribute('data-id')));
    });
  }

  hasVoted(requestId) {
    const request = this.workspace.pendingRequests.find(item => item.id === requestId);
    if (!request) {
      return false;
    }
    const memberId = this.app.profile.id;
    return request.approvals.some(approval => approval.memberId === memberId) ||
      request.rejections.some(rejection => rejection.memberId === memberId);
  }

  getMyVote(requestId) {
    const request = this.workspace.pendingRequests.find(item => item.id === requestId);
    if (!request) {
      return 'have not voted';
    }
    const memberId = this.app.profile.id;
    if (request.approvals.some(approval => approval.memberId === memberId)) {
      return 'approved';
    }
    if (request.rejections.some(rejection => rejection.memberId === memberId)) {
      return 'rejected';
    }
    return 'have not voted';
  }

  approveRequest(requestId) {
    const request = this.workspace.pendingRequests.find(item => item.id === requestId);
    if (!request) {
      return;
    }
    request.approvals.push({
      memberId: this.app.profile.id,
      memberName: this.app.profile.displayName,
      timestamp: Date.now()
    });
    if (this.isApprovalThresholdMet(request)) {
      this.app.finalizeApproval(this.workspace.id, request, 'approved');
      this.app.showToast(`${request.requester.name} approved`);
      this.refresh();
      this.app.refreshCurrentWorkspace();
    } else {
      this.app.saveState();
      this.refresh();
      this.app.showToast('Approval recorded');
    }
  }

  rejectRequest(requestId) {
    const request = this.workspace.pendingRequests.find(item => item.id === requestId);
    if (!request) {
      return;
    }
    request.rejections.push({
      memberId: this.app.profile.id,
      memberName: this.app.profile.displayName,
      timestamp: Date.now()
    });
    this.app.removePendingRequest(this.workspace.id, requestId);
    this.refresh();
    this.app.refreshCurrentWorkspace();
    this.app.showToast('Request rejected');
  }

  isApprovalThresholdMet(request) {
    const required = this.app.getRequiredApprovals(this.workspace);
    return request.approvals.length >= required;
  }

  isDomainAllowed(email) {
    return (this.workspace.settings.allowedDomains || []).some(domain => email.endsWith(domain));
  }

  viewProfile(requestId) {
    const request = this.workspace.pendingRequests.find(item => item.id === requestId);
    if (!request) {
      return;
    }
    alert(`Name: ${request.requester.name}
Email: ${request.requester.email || '—'}
Message: ${request.requester.message || '—'}`);
  }
}

class WorkspaceMemberManagement {
  constructor(app, workspace, container) {
    this.app = app;
    this.workspace = workspace;
    this.container = container;
  }

  refresh() {
    this.workspace = this.app.getWorkspace(this.workspace.id);
    this.renderMembersTab();
  }

  renderMembersTab() {
    if (!this.container) {
      return;
    }
    const admins = this.workspace.members.filter(member => member.role === 'admin');
    const members = this.workspace.members.filter(member => member.role !== 'admin');
    const pending = this.workspace.pendingRequests;
    const invites = this.workspace.activeInvites;

    this.container.innerHTML = `
      <div class="members-management">
        <div class="members-section">
          <h3>Members (${this.workspace.members.length})</h3>
          <div class="member-group">
            <h4>Admins</h4>
            ${admins.map(member => this.renderMember(member, 'admin')).join('') || '<p class="muted">No admins yet.</p>'}
          </div>
          <div class="member-group">
            <h4>Members</h4>
            ${members.map(member => this.renderMember(member, 'member')).join('') || '<p class="muted">Invite teammates to start collaborating.</p>'}
          </div>
          ${pending.length ? `<div class="member-group"><h4>Pending (${pending.length})</h4>${pending.map(req => this.renderPending(req)).join('')}</div>` : ''}
        </div>
        <div class="invite-section">
          <h3>Invite People</h3>
          <div class="invite-methods">
            <button class="invite-method" data-action="generate"><span class="method-icon">🔗</span><span class="method-label">Generate Invite Link</span></button>
            <button class="invite-method" data-action="email"><span class="method-icon">✉️</span><span class="method-label">Invite by Email</span></button>
            <button class="invite-method" data-action="bulk"><span class="method-icon">📋</span><span class="method-label">Bulk Invite</span></button>
          </div>
          <div class="active-invites">
            <h4>Active Invites</h4>
            ${invites.length ? invites.map(invite => this.renderInvite(invite)).join('') : '<p class="muted">No active invites yet.</p>'}
          </div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.invite-method').forEach(button => {
      button.addEventListener('click', event => this.handleInviteAction(event.currentTarget.getAttribute('data-action')));
    });
    this.container.querySelectorAll('[data-action="make-admin"]').forEach(button => {
      button.addEventListener('click', event => this.makeAdmin(event.currentTarget.getAttribute('data-id')));
    });
    this.container.querySelectorAll('[data-action="remove-member"]').forEach(button => {
      button.addEventListener('click', event => this.removeMember(event.currentTarget.getAttribute('data-id')));
    });
    this.container.querySelectorAll('[data-action="revoke-invite"]').forEach(button => {
      button.addEventListener('click', event => this.revokeInvite(event.currentTarget.getAttribute('data-id')));
    });
  }

  renderMember(member, role) {
    const isSelf = member.id === this.app.profile.id;
    return `
      <div class="member-item">
        <div class="member-avatar">${member.avatar || this.app.generateAvatar(member.displayName)}</div>
        <div class="member-info">
          <span class="member-name">${member.displayName}${isSelf ? ' (You)' : ''}</span>
          <span class="member-joined">Joined ${new Date(member.joinedAt).toLocaleDateString()}</span>
        </div>
        <div class="member-actions">
          ${role === 'member' ? `<button class="btn-small" data-action="make-admin" data-id="${member.id}">Make Admin</button>` : ''}
          ${!isSelf ? `<button class="btn-small danger" data-action="remove-member" data-id="${member.id}">Remove</button>` : ''}
        </div>
      </div>
    `;
  }

  renderPending(request) {
    return `
      <div class="member-item pending">
        <div class="member-avatar">${this.app.generateIcon(request.requester.name)}</div>
        <div class="member-info">
          <span class="member-name">${request.requester.name}</span>
          <span class="member-joined">Requested ${this.app.formatRelative(request.timestamp)}</span>
        </div>
        <div class="member-actions">
          <span class="badge">${request.approvals.length}/${this.app.getRequiredApprovals(this.workspace)} approvals</span>
        </div>
      </div>
    `;
  }

  renderInvite(invite) {
    return `
      <div class="invite-item">
        <span class="invite-code">${invite.code}</span>
        <span class="invite-created">Created by ${invite.creatorName}</span>
        <span class="invite-expires">Expires ${this.app.formatRelative(invite.expiresAt)}</span>
        <button class="btn-small danger" data-action="revoke-invite" data-id="${invite.id}">Revoke</button>
      </div>
    `;
  }

  handleInviteAction(action) {
    if (action === 'generate') {
      this.app.generateInvite(this.workspace.id);
      this.refresh();
    } else if (action === 'email') {
      this.app.showToast('Email invites coming soon');
    } else if (action === 'bulk') {
      this.app.showToast('Bulk invite uploads coming soon');
    }
  }

  makeAdmin(memberId) {
    this.app.promoteMember(this.workspace.id, memberId);
    this.refresh();
    this.app.showToast('Member promoted to admin');
  }

  removeMember(memberId) {
    this.app.removeMember(this.workspace.id, memberId);
    this.refresh();
    this.app.showToast('Member removed');
  }

  revokeInvite(inviteId) {
    this.app.revokeInvite(this.workspace.id, inviteId);
    this.refresh();
    this.app.showToast('Invite revoked');
  }
}

class WorkspaceSettings {
  constructor(app, workspace, container) {
    this.app = app;
    this.workspace = workspace;
    this.container = container;
  }

  renderSettingsPanel() {
    if (!this.container) {
      return;
    }
    const access = this.workspace.settings.access;
    const approvals = this.workspace.settings.approvalCount;
    this.container.innerHTML = `
      <div class="workspace-settings">
        <h2>Workspace Settings</h2>
        <div class="settings-section">
          <h3>General</h3>
          <label for="settingsWorkspaceName">Workspace Name</label>
          <input id="settingsWorkspaceName" value="${this.workspace.name}" />
          <label for="settingsWorkspaceDesc">Description</label>
          <textarea id="settingsWorkspaceDesc">${this.workspace.description || ''}</textarea>
          <label>Workspace URL</label>
          <div class="url-display">
            <span>${window.location.origin}/#/${this.workspace.id}</span>
            <button id="copyWorkspaceUrl">Copy</button>
          </div>
        </div>
        <div class="settings-section">
          <h3>Access Control</h3>
          <label for="joinMethod">Join Method</label>
          <select id="joinMethod">
            <option value="invite" ${access === 'invite' ? 'selected' : ''}>Invite Only</option>
            <option value="approval" ${access === 'approval' ? 'selected' : ''}>Request to Join</option>
            <option value="domain" ${access === 'domain' ? 'selected' : ''}>Domain Restricted</option>
          </select>
          <div id="approvalSettings" style="${access === 'approval' ? '' : 'display:none;'}">
            <label for="approvalCount">Approvals Required</label>
            <select id="approvalCount">
              <option value="1" ${approvals === '1' ? 'selected' : ''}>1 approval</option>
              <option value="2" ${approvals === '2' ? 'selected' : ''}>2 approvals</option>
              <option value="3" ${approvals === '3' ? 'selected' : ''}>3 approvals</option>
              <option value="majority" ${approvals === 'majority' ? 'selected' : ''}>Majority of members</option>
              <option value="all" ${approvals === 'all' ? 'selected' : ''}>All members</option>
            </select>
            <label class="checkbox">
              <input type="checkbox" id="adminOnly" ${this.workspace.settings.adminOnlyApprove ? 'checked' : ''} />
              Only admins can approve join requests
            </label>
            <label class="checkbox">
              <input type="checkbox" id="autoReject" ${this.workspace.settings.autoExpireHours ? 'checked' : ''} />
              Auto-reject requests after 48 hours
            </label>
          </div>
          <div id="domainSettings" style="${access === 'domain' ? '' : 'display:none;'}">
            <label for="allowedDomainsSettings">Allowed Email Domains</label>
            <textarea id="allowedDomainsSettings" rows="3">${(this.workspace.settings.allowedDomains || []).join('
')}</textarea>
            <span class="hint">One domain per line. Users with these email domains can join automatically.</span>
          </div>
        </div>
        <div class="settings-section">
          <h3>Notifications</h3>
          <label class="checkbox">
            <input type="checkbox" id="notifyJoinRequests" checked />
            Notify all admins of new join requests
          </label>
          <label class="checkbox">
            <input type="checkbox" id="notifyNewMembers" checked />
            Announce new members in #general
          </label>
        </div>
        <button class="btn-primary" id="saveWorkspaceSettings">Save Settings</button>
      </div>
    `;

    const joinMethod = this.container.querySelector('#joinMethod');
    const approvalSettings = this.container.querySelector('#approvalSettings');
    const domainSettings = this.container.querySelector('#domainSettings');

    joinMethod?.addEventListener('change', () => {
      if (joinMethod.value === 'approval') {
        approvalSettings.style.display = '';
        domainSettings.style.display = 'none';
      } else if (joinMethod.value === 'domain') {
        approvalSettings.style.display = 'none';
        domainSettings.style.display = '';
      } else {
        approvalSettings.style.display = 'none';
        domainSettings.style.display = 'none';
      }
    });

    this.container.querySelector('#copyWorkspaceUrl')?.addEventListener('click', () => this.app.copyWorkspaceLink(this.workspace.id));
    this.container.querySelector('#saveWorkspaceSettings')?.addEventListener('click', () => this.saveSettings());
  }

  saveSettings() {
    const nameInput = this.container.querySelector('#settingsWorkspaceName');
    const descInput = this.container.querySelector('#settingsWorkspaceDesc');
    const joinMethod = this.container.querySelector('#joinMethod');
    const approvalCount = this.container.querySelector('#approvalCount');
    const adminOnly = this.container.querySelector('#adminOnly');
    const autoReject = this.container.querySelector('#autoReject');
    const allowedDomains = this.container.querySelector('#allowedDomainsSettings');

    const settings = {
      access: joinMethod?.value || 'invite',
      approvalCount: approvalCount?.value || '1',
      adminOnlyApprove: adminOnly?.checked || false,
      autoExpireHours: autoReject?.checked ? 48 : null,
      allowedDomains: joinMethod?.value === 'domain'
        ? (allowedDomains?.value.split(/
+/).map(domain => domain.trim()).filter(Boolean).map(domain => domain.startsWith('@') ? domain : `@${domain}`))
        : []
    };

    this.app.updateWorkspaceSettings(this.workspace.id, {
      name: nameInput?.value.trim() || this.workspace.name,
      description: descInput?.value.trim() || '',
      settings
    });

    this.app.showToast('Workspace settings saved');
    this.app.refreshCurrentWorkspace();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.workspaceApp = new WorkspaceApp();
});
