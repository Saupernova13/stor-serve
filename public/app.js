class StorServeApp {
  constructor() {
    this.currentView = 'login';
    this.currentLibrary = null;
    this.currentPath = [];
    this.libraries = [];
    this.shares = {};
    this.pendingShare = null;
    this.init();
  }

  init() {
    this.render();
    this.setupEventListeners();
  }

  setupEventListeners() {
    const app = document.getElementById('app');
    app.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const target = btn.dataset.target;
      if (this[action]) {
        this[action](target);
      }
    });
  }

  async login(password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) throw new Error('Invalid password');
      this.currentView = 'browse';
      await this.loadLibraries();
      this.render();
    } catch (error) {
      alert('Login failed: ' + error.message);
    }
  }

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    this.currentView = 'login';
    this.currentLibrary = null;
    this.currentPath = [];
    this.render();
  }

  async loadLibraries() {
    try {
      const res = await fetch('/api/libraries');
      this.libraries = await res.json();
    } catch (e) {
      console.error('Error loading libraries:', e);
    }
  }

  async selectLibrary(libName) {
    this.currentLibrary = libName;
    this.currentPath = [];
    this.render();
  }

  async browsePath(pathSegment) {
    if (pathSegment === '..') {
      this.currentPath.pop();
    } else if (pathSegment !== '.') {
      this.currentPath.push(pathSegment);
    }
    this.render();
  }

  async shareFile(fileOrDir) {
    const [itemName, itemType] = fileOrDir.split('|');
    const relPath = this.currentPath.length ? this.currentPath.join('/') + '/' + itemName : itemName;
    this.pendingShare = { library: this.currentLibrary, relPath, type: itemType, name: itemName };
    this.showShareModal();
  }

  showShareModal() {
    const modal = document.getElementById('modal-share');
    modal.classList.add('show');
    document.getElementById('share-label').value = this.pendingShare.name;
    document.getElementById('share-expiry').value = '';
  }

  hideShareModal() {
    const modal = document.getElementById('modal-share');
    modal.classList.remove('show');
    this.pendingShare = null;
  }

  async createShare() {
    if (!this.pendingShare) return;
    const label = document.getElementById('share-label').value;
    const expiryStr = document.getElementById('share-expiry').value;
    const expiresAt = expiryStr ? new Date(expiryStr).toISOString() : null;

    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          library: this.pendingShare.library,
          relPath: this.pendingShare.relPath,
          type: this.pendingShare.type,
          label: label || this.pendingShare.name,
          expiresAt
        })
      });

      if (!res.ok) throw new Error('Share creation failed');
      const share = await res.json();

      const protocol = window.location.protocol;
      const host = window.location.host;
      const shareUrl = `${protocol}//${host}/s/${share.token}`;

      alert(`Share created! Link:\n${shareUrl}`);
      this.hideShareModal();
      await this.loadShares();
    } catch (error) {
      alert('Share creation failed: ' + error.message);
    }
  }

  async loadShares() {
    try {
      const res = await fetch('/api/shares');
      this.shares = await res.json();
    } catch (e) {
      console.error('Error loading shares:', e);
    }
  }

  async deleteShare(token) {
    if (!confirm('Delete this share?')) return;
    try {
      await fetch(`/api/shares/${token}`, { method: 'DELETE' });
      await this.loadShares();
      this.render();
    } catch (error) {
      alert('Delete failed: ' + error.message);
    }
  }

  async addLibrary(name, path) {
    try {
      const res = await fetch('/api/admin/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path })
      });
      if (!res.ok) throw new Error('Add library failed');
      await this.loadLibraries();
      this.render();
    } catch (error) {
      alert('Add library failed: ' + error.message);
    }
  }

  async removeLibrary(name) {
    if (!confirm(`Remove library "${name}"?`)) return;
    try {
      await fetch(`/api/admin/libraries/${name}`, { method: 'DELETE' });
      await this.loadLibraries();
      this.render();
    } catch (error) {
      alert('Remove library failed: ' + error.message);
    }
  }

  async loadBrowse() {
    if (!this.currentLibrary) return [];
    const path = this.currentPath.join('/');
    const url = `/api/browse/${this.currentLibrary}/${path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      console.error('Error loading browse:', e);
      return [];
    }
  }

  render() {
    const app = document.getElementById('app');
    if (this.currentView === 'login') {
      app.innerHTML = this.renderLogin();
      this.setupLoginForm();
    } else {
      app.innerHTML = this.renderApp();
      this.setupAppForm();
    }
  }

  renderLogin() {
    return `
      <div class="login-container">
        <div class="login-card">
          <h1>stor-serve</h1>
          <form id="login-form">
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="login-password" placeholder="Enter password" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; padding: var(--spacing-md);">
              Login
            </button>
          </form>
        </div>
      </div>
    `;
  }

  setupLoginForm() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const password = document.getElementById('login-password').value;
      this.login(password);
    });
  }

  renderApp() {
    const tabs = this.renderTabs();
    const content = this.currentView === 'browse' ? this.renderBrowse() : this.renderAdmin();

    return `
      <div class="app-layout">
        ${this.renderHeader()}
        ${this.renderSidebar()}
        <div class="app-content">
          ${tabs}
          ${content}
        </div>
      </div>
    `;
  }

  renderHeader() {
    return `
      <div class="app-header">
        <h1>stor-serve</h1>
        <div class="app-header-actions">
          <button class="btn" onclick="window.app.logout()">Logout</button>
        </div>
      </div>
    `;
  }

  renderSidebar() {
    let html = '<div class="app-sidebar">';
    html += '<div class="app-sidebar-section">';
    html += '<div class="app-sidebar-title">Libraries</div>';

    for (const lib of this.libraries) {
      const active = this.currentLibrary === lib.name ? 'active' : '';
      html += `<a class="app-sidebar-item ${active}" onclick="window.app.selectLibrary('${lib.name}')">${lib.name}</a>`;
    }

    html += '</div>';
    html += '<div class="app-sidebar-section">';
    html += '<div class="app-sidebar-title">Share Links</div>';
    html += '<a class="app-sidebar-item" onclick="window.app.currentView = \'admin\'; window.app.render();">View Shares</a>';
    html += '<a class="app-sidebar-item" onclick="window.app.currentView = \'admin\'; window.app.currentTab = \'libraries\'; window.app.render();">Manage Libraries</a>';
    html += '</div></div>';

    return html;
  }

  renderTabs() {
    return `
      <div class="nav-tabs">
        <div class="nav-tab ${this.currentView === 'browse' ? 'active' : ''}" onclick="window.app.currentView = 'browse'; window.app.render();">Browse</div>
        <div class="nav-tab ${this.currentView === 'admin' ? 'active' : ''}" onclick="window.app.currentView = 'admin'; window.app.currentTab = 'shares'; window.app.render();">Shares</div>
        <div class="nav-tab ${this.currentView === 'admin' && this.currentTab === 'libraries' ? 'active' : ''}" onclick="window.app.currentView = 'admin'; window.app.currentTab = 'libraries'; window.app.render();">Libraries</div>
      </div>
    `;
  }

  renderBrowse() {
    if (!this.currentLibrary) {
      return `<div class="empty-state"><div class="empty-state-icon">📂</div><p>Select a library to browse</p></div>`;
    }

    const items = this.loadBrowseSync();
    const breadcrumb = this.renderBreadcrumb();

    let html = breadcrumb;
    html += '<div class="file-grid" id="file-grid">';

    if (items.length === 0) {
      html += '<div class="empty-state"><p>No files</p></div>';
    } else {
      for (const item of items) {
        const icon = item.type === 'directory' ? '📁' : '📄';
        const size = item.size ? `${(item.size / 1024 / 1024).toFixed(1)}MB` : '';
        html += `
          <div class="file-item" onclick="window.app.browsePath('${item.name}')">
            <div class="file-item-actions">
              <button class="file-action-btn" onclick="event.stopPropagation(); window.app.shareFile('${item.name}|${item.type}'); return false;" title="Share">🔗</button>
            </div>
            <div class="file-item-icon">${icon}</div>
            <div class="file-item-name">${item.name}</div>
            ${size ? `<div class="file-item-meta"><span>${size}</span></div>` : ''}
          </div>
        `;
      }
    }

    html += '</div>';
    return html;
  }

  loadBrowseSync() {
    if (!this.currentLibrary) return [];
    const mockData = [
      { name: 'Sample Folder', type: 'directory', size: null },
      { name: 'sample.txt', type: 'file', size: 1024 }
    ];
    return mockData;
  }

  renderBreadcrumb() {
    let html = '<div class="breadcrumb">';
    html += `<span class="breadcrumb-item" onclick="window.app.currentPath = []; window.app.render();">Home</span>`;

    for (let i = 0; i < this.currentPath.length; i++) {
      html += `<span class="breadcrumb-separator">/</span>`;
      html += `<span class="breadcrumb-item" onclick="window.app.currentPath = window.app.currentPath.slice(0, ${i + 1}); window.app.render();">${this.currentPath[i]}</span>`;
    }

    html += '</div>';
    return html;
  }

  renderAdmin() {
    if (!this.currentTab) this.currentTab = 'shares';

    if (this.currentTab === 'shares') {
      return this.renderSharesTab();
    } else {
      return this.renderLibrariesTab();
    }
  }

  renderSharesTab() {
    const shares = Object.entries(this.shares);

    if (shares.length === 0) {
      return `<div class="empty-state"><p>No active shares</p></div>`;
    }

    let html = '<table class="shares-table"><thead><tr><th>Label</th><th>Type</th><th>Created</th><th>Expires</th><th>Action</th></tr></thead><tbody>';

    for (const [token, share] of shares) {
      const created = new Date(share.createdAt).toLocaleDateString();
      const expires = share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : 'Never';
      html += `
        <tr>
          <td>${share.label}</td>
          <td>${share.type}</td>
          <td>${created}</td>
          <td>${expires}</td>
          <td class="shares-table-actions">
            <button class="btn btn-small" onclick="window.app.copyShareLink('${token}')">Copy</button>
            <button class="btn btn-small btn-danger" onclick="window.app.deleteShare('${token}')">Delete</button>
          </td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    return html;
  }

  renderLibrariesTab() {
    let html = `
      <div class="libraries-form">
        <h3>Add Library</h3>
        <form id="library-form">
          <div class="form-row">
            <input type="text" id="lib-name" placeholder="Library name (e.g., Movies)" required>
            <input type="text" id="lib-path" placeholder="Full path (e.g., D:\\Movies)" required>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      </div>

      <h3>Current Libraries</h3>
      <div class="libraries-list">
    `;

    if (this.libraries.length === 0) {
      html += '<p class="text-muted">No libraries configured</p>';
    } else {
      for (const lib of this.libraries) {
        html += `
          <div class="library-item">
            <div class="library-info">
              <div class="library-name">${lib.name}</div>
              <div class="library-path">${lib.path}</div>
            </div>
            <button class="btn btn-small btn-danger" onclick="window.app.removeLibrary('${lib.name}')">Remove</button>
          </div>
        `;
      }
    }

    html += '</div>';
    return html;
  }

  setupAppForm() {
    const libForm = document.getElementById('library-form');
    if (libForm) {
      libForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('lib-name').value;
        const path = document.getElementById('lib-path').value;
        this.addLibrary(name, path);
      });
    }

    const modal = document.getElementById('modal-share');
    const closeBtn = modal.querySelector('.modal-close');
    const submitBtn = document.getElementById('share-submit');
    const cancelBtn = document.getElementById('share-cancel');

    closeBtn.onclick = () => this.hideShareModal();
    cancelBtn.onclick = () => this.hideShareModal();
    submitBtn.onclick = () => this.createShare();

    document.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideShareModal();
      }
    });
  }

  copyShareLink(token) {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const url = `${protocol}//${host}/s/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied!');
    });
  }
}

window.app = new StorServeApp();
