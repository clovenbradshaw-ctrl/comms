(function () {
  const mountNode = document.getElementById('prototypeWorkspace');
  const select = document.getElementById('prototypeWorkspaceSelect');
  const addMemberBtn = document.getElementById('prototypeAddMember');
  const addChannelBtn = document.getElementById('prototypeAddChannel');

  if (!mountNode || !select) {
    return;
  }

  const demoWorkspaces = [
    {
      id: 'ws-design-lab',
      name: 'Design Lab',
      description: 'Collaborate on product design experiments and feedback loops.',
      created: Date.now() - 1000 * 60 * 60 * 24 * 3,
      type: 'public',
      joinRules: 'open',
      inviteCode: 'DESIGN1',
      channels: [
        { id: 'general', name: 'general', created: Date.now() - 1000 * 60 * 60 * 24 * 3 },
        { id: 'wireframes', name: 'wireframes', created: Date.now() - 1000 * 60 * 60 * 5 },
        { id: 'critiques', name: 'critiques', created: Date.now() - 1000 * 60 * 60 * 2 }
      ],
      members: [
        { id: 'member-1', name: 'Asha', role: 'owner' },
        { id: 'member-2', name: 'Marta', role: 'member' },
        { id: 'member-3', name: 'Theo', role: 'member' }
      ]
    },
    {
      id: 'ws-ml-research',
      name: 'ML Research Guild',
      description: 'A private guild for sharing research papers, datasets, and evaluations.',
      created: Date.now() - 1000 * 60 * 60 * 24 * 12,
      type: 'private',
      joinRules: 'invite',
      inviteCode: 'MLR-842',
      channels: [
        { id: 'announcements', name: 'announcements', created: Date.now() - 1000 * 60 * 60 * 24 * 12 },
        { id: 'benchmarks', name: 'benchmarks', created: Date.now() - 1000 * 60 * 60 * 24 * 4 },
        { id: 'evals', name: 'evals', created: Date.now() - 1000 * 60 * 60 * 8 }
      ],
      members: [
        { id: 'member-5', name: 'Leah', role: 'owner' },
        { id: 'member-6', name: 'Nikhil', role: 'member' },
        { id: 'member-7', name: 'Robin', role: 'member' },
        { id: 'member-8', name: 'Zhang', role: 'member' }
      ]
    }
  ];

  let activeWorkspace = structuredClone ? structuredClone(demoWorkspaces[0]) : JSON.parse(JSON.stringify(demoWorkspaces[0]));
  let currentView = null;

  function slugifyChannelName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || `channel-${Math.random().toString(36).slice(2, 8)}`;
  }

  function randomName() {
    const names = ['Ivy', 'Jonah', 'Priya', 'Kei', 'Sasha', 'Luca', 'Emre', 'Noor'];
    return names[Math.floor(Math.random() * names.length)];
  }

  function randomChannelName() {
    const topics = ['synthesis', 'planning', 'retro', 'ideas', 'ops', 'signals'];
    return topics[Math.floor(Math.random() * topics.length)];
  }

  function cloneWorkspace(workspace) {
    return structuredClone ? structuredClone(workspace) : JSON.parse(JSON.stringify(workspace));
  }

  function hydrateSelect() {
    select.innerHTML = '';
    demoWorkspaces.forEach((workspace, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = workspace.name;
      select.appendChild(option);
    });
  }

  function createSubpages() {
    return [
      {
        id: 'activity',
        label: 'Activity',
        render: (workspace) => {
          const memberCount = Array.isArray(workspace.members) ? workspace.members.length : 0;
          const channelCount = Array.isArray(workspace.channels) ? workspace.channels.length : 0;
          return `
            <div class="workspace-ui__panel">
              <h2>Workspace activity</h2>
              <p class="workspace-ui__panelSummary">${memberCount} members · ${channelCount} channels</p>
              <div class="workspace-ui__metricGrid">
                <div class="workspace-ui__metric">
                  <span class="workspace-ui__metricLabel">Active invites</span>
                  <span class="workspace-ui__metricValue">${Math.max(1, Math.floor(memberCount / 2))}</span>
                </div>
                <div class="workspace-ui__metric">
                  <span class="workspace-ui__metricLabel">Pending approvals</span>
                  <span class="workspace-ui__metricValue">${workspace.requests?.length || 0}</span>
                </div>
              </div>
            </div>
          `;
        }
      },
      {
        id: 'visualizations',
        label: 'Visualizations',
        render: (workspace) => `
          <div class="workspace-ui__panel">
            <h2>Data visualizations</h2>
            <p class="workspace-ui__panelSummary">Prototype area for charts and alternate workspace layouts.</p>
            <ul class="workspace-ui__panelList">
              <li>Membership growth timeline</li>
              <li>Channel activity heatmap</li>
              <li>Network connectivity graph</li>
            </ul>
          </div>
        `
      }
    ];
  }

  function mountWorkspace(workspace) {
    if (currentView) {
      currentView.destroy();
      currentView = null;
    }

    const options = {
      subpages: createSubpages(),
      onLeave: () => console.info('Returning to workspace directory (prototype view)'),
      onCopyLink: (data) => {
        const link = `${window.location.origin}/#/workspace/${data.id}`;
        options.fallbackLink = link;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          return navigator.clipboard.writeText(link);
        }
        window.alert(`Workspace link: ${link}`);
        return false;
      },
      onChannelCreate: (name) => {
        const nextWorkspace = cloneWorkspace(activeWorkspace);
        const id = slugifyChannelName(name);
        nextWorkspace.channels.push({ id, name, created: Date.now() });
        activeWorkspace = nextWorkspace;
        currentView.updateWorkspace(activeWorkspace);
      },
      onSubpageChange: (id) => console.debug('Subpage selected', id)
    };

    currentView = new WorkspaceView(workspace, options);
    mountNode.innerHTML = '';
    currentView.mount(mountNode);
  }

  function switchWorkspace(index) {
    const baseWorkspace = demoWorkspaces[index];
    if (!baseWorkspace) {
      return;
    }
    activeWorkspace = cloneWorkspace(baseWorkspace);
    mountWorkspace(activeWorkspace);
  }

  hydrateSelect();
  switchWorkspace(0);

  select.addEventListener('change', (event) => {
    const index = Number(event.target.value || 0);
    switchWorkspace(index);
  });

  addMemberBtn?.addEventListener('click', () => {
    const nextWorkspace = cloneWorkspace(activeWorkspace);
    nextWorkspace.members.push({
      id: `member-${Math.random().toString(36).slice(2, 10)}`,
      name: randomName(),
      role: 'member'
    });
    activeWorkspace = nextWorkspace;
    currentView.updateWorkspace(activeWorkspace);
  });

  addChannelBtn?.addEventListener('click', () => {
    const nextWorkspace = cloneWorkspace(activeWorkspace);
    const name = randomChannelName();
    const id = slugifyChannelName(`${name}-${nextWorkspace.channels.length + 1}`);
    nextWorkspace.channels.push({ id, name, created: Date.now() });
    activeWorkspace = nextWorkspace;
    currentView.updateWorkspace(activeWorkspace);
  });
})();
