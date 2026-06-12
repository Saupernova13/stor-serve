class StorServeApp {
  constructor() {
    this.currentView = 'login';
    this.currentLibrary = null;
    this.currentPath = [];
    this.libraries = [];
    this.shares = {};
    this.currentTab = 'shares';
    this.pendingShare = null;
    this.init();
  }

  init() {
    this.render();
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
      this.libraries = [];
    }
  }

  selectLibrary(libName) {
    this.currentLibrary = libName;
    this.currentPath = [];
    this.render();
  }

  async browsePath(itemName, itemType) {
    if (itemType === 'directory') {
      this.currentPath.push(itemName);
    }
    this.render();
  }

  goBack() {
    if (this.currentPath.length > 0) {
      this.currentPath.pop();
      this.render();
    }
  }

  goHome() {
    this.currentPath = [];
    this.render();
  }

  goToBreadcrumb(index) {
    this.currentPath = this.currentPath.slice(0, index);
    this.render();
  }

  shareFile(itemName, itemType) {
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
    const expiresAt = expiryStr ? new Date(expiryStr + 'T23:59:59').toISOString() : null;

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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Share creation failed');
      }
      const share = await res.json();

      const protocol = window.location.protocol;
      const host = window.location.host;
      const shareUrl = `${protocol}//${host}/s/${share.token}`;

      alert(`Share created!\n\n${shareUrl}`);
      this.hideShareModal();
      await this.loadShares();
      this.render();
    } catch (error) {
      alert('Share creation failed: ' + error.message);
    }
  }

  async loadShares() {
    try {
      const res = await fetch('/api/shares');
      if (!res.ok) throw new Error('Failed to load shares');
      this.shares = await res.json();
    } catch (e) {
      console.error('Error loading shares:', e);
      this.shares = {};
    }
  }

  async deleteShare(token) {
    if (!confirm('Delete this share?')) return;
    try {
      const res = await fetch(`/api/shares/${token}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Add library failed');
      }
      await this.loadLibraries();
      this.currentTab = 'libraries';
      this.render();
    } catch (error) {
      alert('Add library failed: ' + error.message);
    }
  }

  async removeLibrary(name) {
    if (!confirm(`Remove library "${name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/libraries/${name}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Remove failed');
      await this.loadLibraries();
      this.render();
    } catch (error) {
      alert('Remove library failed: ' + error.message);
    }
  }

  async loadBrowseDirectory() {
    if (!this.currentLibrary) return [];
    const path = this.currentPath.join('/');
    const url = `/api/browse/${this.currentLibrary}/${path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Browse error:', res.status);
        return [];
      }
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      console.error('Error loading browse:', e);
      return [];
    }
  }

  copyShareLink(token) {
    const protocol = window.location.protocol;
    const host = window.location.host;
    const url = `${protocol}//${host}/s/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied!');
    }).catch(() => {
      alert('Copy failed. Link: ' + url);
    });
  }

  render() {
    const app = document.getElementById('app');
    if (this.currentView === 'login') {
      app.innerHTML = this.renderLogin();
      this.setupLoginForm();
    } else {
      app.innerHTML = this.renderApp();
      this.setupAppEventHandlers();
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
              <input type="password" id="login-password" placeholder="Enter password" required autofocus>
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
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = document.getElementById('login-password').value;
        this.login(password);
      });
    }
  }

  setupAppEventHandlers() {
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

    const libForm = document.getElementById('library-form');
    if (libForm) {
      libForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('lib-name').value;
        const path = document.getElementById('lib-path').value;
        document.getElementById('lib-name').value = '';
        document.getElementById('lib-path').value = '';
        this.addLibrary(name, path);
      });
    }
  }

  renderApp() {
    return `
      <div class="app-layout">
        ${this.renderHeader()}
        ${this.renderSidebar()}
        <div class="app-content">
          ${this.renderTabs()}
          ${this.currentView === 'browse' ? this.renderBrowseView() : this.renderAdminView()}
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

    if (this.libraries.length === 0) {
      html += '<div class="text-muted" style="padding: var(--spacing-md) var(--spacing-lg);">No libraries</div>';
    } else {
      for (const lib of this.libraries) {
        const active = this.currentLibrary === lib.name ? 'active' : '';
        html += `<div class="app-sidebar-item ${active}" onclick="window.app.selectLibrary('${lib.name}')">${lib.name}</div>`;
      }
    }

    html += '</div>';
    html += '<div class="app-sidebar-section">';
    html += '<div class="app-sidebar-title">Menu</div>';
    html += `<div class="app-sidebar-item" onclick="window.app.currentView = 'admin'; window.app.currentTab = 'shares'; window.app.loadShares().then(() => window.app.render());">Active Shares</div>`;
    html += `<div class="app-sidebar-item" onclick="window.app.currentView = 'admin'; window.app.currentTab = 'libraries'; window.app.render();">Manage Libraries</div>`;
    html += '</div></div>';

    return html;
  }

  renderTabs() {
    return `
      <div class="nav-tabs">
        <div class="nav-tab ${this.currentView === 'browse' ? 'active' : ''}" onclick="window.app.currentView = 'browse'; window.app.render();">Browse</div>
        <div class="nav-tab ${this.currentView === 'admin' && this.currentTab === 'shares' ? 'active' : ''}" onclick="window.app.currentView = 'admin'; window.app.currentTab = 'shares'; window.app.loadShares().then(() => window.app.render());">Shares</div>
        <div class="nav-tab ${this.currentView === 'admin' && this.currentTab === 'libraries' ? 'active' : ''}" onclick="window.app.currentView = 'admin'; window.app.currentTab = 'libraries'; window.app.render();">Libraries</div>
      </div>
    `;
  }

  renderBrowseView() {
    if (!this.currentLibrary) {
      return `<div class="empty-state"><div class="empty-state-icon">📂</div><p>Select a library to browse</p></div>`;
    }

    return `<div id="browse-container"></div>`;
  }

  async renderBrowseViewAsync() {
    if (!this.currentLibrary) {
      return `<div class="empty-state"><div class="empty-state-icon">📂</div><p>Select a library to browse</p></div>`;
    }

    const items = await this.loadBrowseDirectory();
    const breadcrumb = this.renderBreadcrumb();

    let html = breadcrumb;

    if (items.length === 0) {
      html += '<div class="empty-state"><p>No files in this directory</p></div>';
    } else {
      html += '<div class="file-grid">';
      for (const item of items) {
        const icon = item.type === 'directory' ? '📁' : '📄';
        const size = item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : '';
        const sizeHtml = size ? `<div class="file-item-meta"><span>${size}</span></div>` : '';
        html += `
          <div class="file-item">
            <div class="file-item-actions">
              <button class="file-action-btn" onclick="event.stopPropagation(); window.app.shareFile('${item.name.replace(/'/g, "\\'")}', '${item.type}');" title="Share">🔗</button>
            </div>
            <div class="file-item-icon" style="cursor: ${item.type === 'directory' ? 'pointer' : 'default'};" onclick="${item.type === 'directory' ? `window.app.browsePath('${item.name.replace(/'/g, "\\'")}', '${item.type}')` : ''}">${icon}</div>
            <div class="file-item-name" style="cursor: ${item.type === 'directory' ? 'pointer' : 'default'};" onclick="${item.type === 'directory' ? `window.app.browsePath('${item.name.replace(/'/g, "\\'")}', '${item.type}')` : ''}">${item.name}</div>
            ${sizeHtml}
          </div>
        `;
      }
      html += '</div>';
    }

    return html;
  }

  renderBreadcrumb() {
    let html = '<div class="breadcrumb">';
    html += `<span class="breadcrumb-item" onclick="window.app.goHome(); window.app.render();" style="cursor: pointer;">Home</span>`;

    for (let i = 0; i < this.currentPath.length; i++) {
      html += `<span class="breadcrumb-separator">/</span>`;
      html += `<span class="breadcrumb-item" onclick="window.app.goToBreadcrumb(${i}); window.app.render();" style="cursor: pointer;">${this.currentPath[i]}</span>`;
    }

    html += '</div>';
    return html;
  }

  renderAdminView() {
    if (this.currentTab === 'shares') {
      return this.renderSharesTab();
    } else {
      return this.renderLibrariesTab();
    }
  }

  renderSharesTab() {
    const shareEntries = Object.entries(this.shares);

    if (shareEntries.length === 0) {
      return `<div class="empty-state"><p>No active shares</p></div>`;
    }

    let html = '<table class="shares-table"><thead><tr><th>Label</th><th>Type</th><th>Created</th><th>Expires</th><th>Action</th></tr></thead><tbody>';

    for (const [token, share] of shareEntries) {
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
            <input type="text" id="lib-path" placeholder="Full path (e.g., D:\\\\Movies)" required>
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
}

window.app = new StorServeApp();

// After render completes, handle async browse content
const originalRender = window.app.render;
window.app.render = async function() {
  originalRender.call(this);
  if (this.currentView === 'browse' && this.currentLibrary) {
    const container = document.getElementById('browse-container');
    if (container) {
      const content = await this.renderBrowseViewAsync();
      container.innerHTML = content;
    }
  }
};
