(function (global) {
  const noop = () => {};

  function toElement(documentRef, value) {
    if (value == null) {
      const placeholder = documentRef.createElement('div');
      placeholder.className = 'workspace-ui__empty';
      placeholder.textContent = 'No content available for this view yet.';
      return placeholder;
    }

    if (typeof value === 'string') {
      const template = documentRef.createElement('template');
      template.innerHTML = value.trim();
      return template.content.firstElementChild || documentRef.createElement('div');
    }

    if (value instanceof Node) {
      return value;
    }

    return toElement(documentRef, String(value));
  }

  class WorkspaceView {
    constructor(workspace, options = {}) {
      this.options = options || {};
      this.workspace = workspace || {};
      this.document = this.options.document || (typeof document !== 'undefined' ? document : null);
      if (!this.document) {
        throw new Error('WorkspaceView requires a document to render into.');
      }

      this.window = this.options.window || (typeof window !== 'undefined' ? window : null);
      this.onLeave = this.options.onLeave || noop;
      this.onCopyLink = this.options.onCopyLink || noop;
      this.onChannelCreate = this.options.onChannelCreate || noop;
      this.onSubpageChange = this.options.onSubpageChange || noop;

      this.container = this.options.container || this.document.createElement('div');
      this.container.classList.add('workspace-ui');

      this.subpages = new Map();
      this.activeSubpage = null;

      this.dom = {};
      this.renderBase();
      this.bindBaseHandlers();

      const initialSubpages = Array.isArray(options.subpages) ? options.subpages : [];
      this.registerSubpage('overview', {
        label: 'Overview',
        render: () => this.renderOverview()
      });
      initialSubpages.forEach((config) => {
        if (config && config.id) {
          this.registerSubpage(config.id, config);
        }
      });
      this.showSubpage(options.initialSubpage || 'overview');
      this.updateWorkspace(this.workspace);
    }

    renderBase() {
      this.container.innerHTML = `
        <div class="workspace-ui__header">
          <div class="workspace-ui__headerText">
            <h1 data-ref="title">Untitled workspace</h1>
            <p data-ref="description">No description provided.</p>
            <div class="workspace-ui__meta" data-ref="meta"></div>
          </div>
          <div class="workspace-ui__actions">
            <div class="invite-code" data-ref="inviteCode" title="Invite code">Invite code: <strong>------</strong></div>
            <button class="btn-secondary" type="button" data-action="copy-link">Copy Link</button>
            <button class="btn-primary" type="button" data-action="leave">Back to Workspaces</button>
          </div>
        </div>
        <div class="workspace-ui__layout">
          <aside class="workspace-ui__sidebar">
            <h2>Channels</h2>
            <ul data-ref="channels"></ul>
            <button class="btn-text" type="button" data-action="add-channel">+ Add Channel</button>
          </aside>
          <section class="workspace-ui__main">
            <nav class="workspace-ui__subnav" role="tablist" data-ref="subnav"></nav>
            <div class="workspace-ui__subpages" data-ref="subpages"></div>
          </section>
          <aside class="workspace-ui__members">
            <h2 data-ref="membersTitle">Members (0)</h2>
            <ul data-ref="members"></ul>
          </aside>
        </div>
      `;

      this.dom = {
        title: this.container.querySelector('[data-ref="title"]'),
        description: this.container.querySelector('[data-ref="description"]'),
        meta: this.container.querySelector('[data-ref="meta"]'),
        inviteCode: this.container.querySelector('[data-ref="inviteCode"]'),
        channelList: this.container.querySelector('[data-ref="channels"]'),
        addChannelBtn: this.container.querySelector('[data-action="add-channel"]'),
        copyLinkBtn: this.container.querySelector('[data-action="copy-link"]'),
        leaveBtn: this.container.querySelector('[data-action="leave"]'),
        members: this.container.querySelector('[data-ref="members"]'),
        membersTitle: this.container.querySelector('[data-ref="membersTitle"]'),
        subnav: this.container.querySelector('[data-ref="subnav"]'),
        subpages: this.container.querySelector('[data-ref="subpages"]')
      };
    }

    bindBaseHandlers() {
      this.dom.leaveBtn?.addEventListener('click', () => {
        this.onLeave();
      });

      this.dom.copyLinkBtn?.addEventListener('click', () => {
        const result = this.onCopyLink(this.workspace);
        if (result && typeof result.then === 'function') {
          this.dom.copyLinkBtn.disabled = true;
          Promise.resolve(result)
            .then((value) => {
              if (value !== false) {
                this.showCopySuccess();
              }
            })
            .catch(() => this.showCopyFallback())
            .finally(() => {
              this.dom.copyLinkBtn.disabled = false;
            });
          return;
        }

        if (result !== false) {
          this.showCopySuccess();
        }
      });

      this.dom.addChannelBtn?.addEventListener('click', async () => {
        if (!this.onChannelCreate) {
          return;
        }
        const channelName = this.window?.prompt ? this.window.prompt('Channel name') : null;
        if (!channelName) {
          return;
        }
        const response = this.onChannelCreate(channelName, this.workspace);
        if (response && typeof response.then === 'function') {
          this.dom.addChannelBtn.disabled = true;
          try {
            await response;
          } finally {
            this.dom.addChannelBtn.disabled = false;
          }
          return;
        }

        if (response === false) {
          return;
        }

        this.updateWorkspace(this.workspace);
      });
    }

    showCopySuccess() {
      if (!this.dom.copyLinkBtn) {
        return;
      }
      const { copyLinkBtn } = this.dom;
      const originalText = copyLinkBtn.textContent;
      copyLinkBtn.textContent = 'Link Copied!';
      copyLinkBtn.classList.add('btn-success');
      setTimeout(() => {
        copyLinkBtn.textContent = originalText;
        copyLinkBtn.classList.remove('btn-success');
      }, 1600);
    }

    showCopyFallback() {
      if (!this.window || !this.window.alert) {
        return;
      }
      const link = this.options?.fallbackLink;
      if (link) {
        this.window.alert(`Workspace link: ${link}`);
      }
    }

    mount(target) {
      const mountTarget = target || this.document.body;
      mountTarget.appendChild(this.container);
    }

    destroy() {
      this.subpages.clear();
      this.container.remove();
    }

    updateWorkspace(workspace = {}) {
      this.workspace = workspace || {};
      const { title, description, meta, inviteCode, channelList, members, membersTitle } = this.dom;

      if (title) {
        title.textContent = workspace.name || 'Untitled workspace';
      }

      if (description) {
        description.textContent = workspace.description || 'No description provided.';
      }

      if (meta) {
        const joinRule = workspace.joinRules === 'invite'
          ? 'Invite-only'
          : workspace.joinRules === 'request'
            ? 'Request access'
            : 'Open join';
        const created = workspace.created ? new Date(workspace.created).toLocaleString() : 'Unknown creation date';
        const type = workspace.type === 'private' ? 'Private workspace' : 'Public workspace';
        meta.innerHTML = `
          <span>${type}</span>
          <span>${joinRule}</span>
          <span>Created ${created}</span>
        `;
      }

      if (inviteCode) {
        const code = workspace.inviteCode || '------';
        inviteCode.innerHTML = `Invite code: <strong>${code}</strong>`;
      }

      if (channelList) {
        const channels = Array.isArray(workspace.channels) ? workspace.channels : [];
        channelList.innerHTML = channels.length
          ? channels.map(channel => `
              <li data-channel-id="${channel.id}">
                <span>#${channel.name}</span>
                <time>${new Date(channel.created || workspace.created || Date.now()).toLocaleDateString()}</time>
              </li>
            `).join('')
          : '<li class="empty">No channels yet.</li>';
      }

      if (members) {
        const workspaceMembers = Array.isArray(workspace.members) ? workspace.members : [];
        members.innerHTML = workspaceMembers.length
          ? workspaceMembers.map(member => `
              <li>
                <div class="member-avatar">${(member.name || '?').charAt(0).toUpperCase()}</div>
                <div class="member-info">
                  <span class="member-name">${member.name || 'Unknown member'}</span>
                  <span class="member-meta">${member.role === 'owner' ? 'Owner' : 'Member'}</span>
                </div>
              </li>
            `).join('')
          : '<li class="empty">No members yet.</li>';
        if (membersTitle) {
          membersTitle.textContent = `Members (${workspaceMembers.length})`;
        }
      }

      if (this.activeSubpage) {
        this.renderSubpage(this.activeSubpage);
      }
    }

    registerSubpage(id, config) {
      if (!id) {
        return;
      }
      const normalizedId = String(id);
      const entry = {
        id: normalizedId,
        label: config?.label || normalizedId,
        render: typeof config?.render === 'function' ? config.render : () => config?.content,
        badge: config?.badge
      };
      this.subpages.set(normalizedId, entry);
      this.renderSubnav();
    }

    renderSubnav() {
      if (!this.dom.subnav) {
        return;
      }
      const navButtons = Array.from(this.dom.subnav.querySelectorAll('button[data-subpage]'));
      navButtons.forEach(button => button.remove());

      const fragment = this.document.createDocumentFragment();
      this.subpages.forEach((entry) => {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = 'workspace-ui__subnavItem';
        button.dataset.subpage = entry.id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', entry.id === this.activeSubpage ? 'true' : 'false');
        button.textContent = entry.label;
        if (entry.badge != null) {
          const badge = this.document.createElement('span');
          badge.className = 'workspace-ui__subnavBadge';
          badge.textContent = entry.badge;
          button.appendChild(badge);
        }
        button.addEventListener('click', () => {
          this.showSubpage(entry.id);
        });
        fragment.appendChild(button);
      });

      this.dom.subnav.appendChild(fragment);
    }

    showSubpage(id) {
      if (!id || !this.subpages.has(id)) {
        return;
      }
      this.activeSubpage = id;
      this.renderSubnav();
      this.renderSubpage(id);
      this.onSubpageChange(id, this.workspace);
    }

    renderSubpage(id) {
      if (!this.dom.subpages) {
        return;
      }
      const config = this.subpages.get(id);
      if (!config) {
        return;
      }

      const result = config.render(this.workspace, { view: this });
      const element = toElement(this.document, result);
      this.dom.subpages.innerHTML = '';
      this.dom.subpages.appendChild(element);
    }

    renderOverview() {
      const firstChannel = Array.isArray(this.workspace.channels) && this.workspace.channels.length
        ? this.workspace.channels[0]
        : { name: 'general' };
      return `
        <div class="workspace-ui__welcome">
          <h2>Welcome to #${firstChannel.name || 'general'}</h2>
          <p>This is the start of the channel. Share the invite code with teammates to collaborate.</p>
        </div>
      `;
    }
  }

  global.WorkspaceView = WorkspaceView;
})(typeof window !== 'undefined' ? window : globalThis);
