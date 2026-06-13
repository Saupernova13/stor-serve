class StorServeApp {
  constructor() {
    this.currentView = 'login';
    this.currentLibrary = null;   // library id
    this.currentPath = [];
    this.libraries = [];
    this.shares = {};
    this.currentTab = 'shares';
    this.pendingShare = null;
    this.publicDir = '';
    this.init();
  }

  async init() {
    // Resume an existing session if there is one.
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.authenticated) {
        this.currentView = 'browse';
        await this.loadLibraries();
      }
    } catch (e) { /* fall through to login */ }
    this.render();
  }

  // --- Auth ---
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
      this.render();
    }
  }

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    this.currentView = 'login';
    this.currentLibrary = null;
    this.currentPath = [];
    this.render();
  }

  // --- Libraries ---
  async loadLibraries() {
    try {
      const res = await fetch('/api/browse/libraries');
      this.libraries = await res.json();
    } catch (e) {
      console.error('Error loading libraries:', e);
      this.libraries = [];
    }
  }

  libName(id) {
    const lib = this.libraries.find(l => l.id === id);
    return lib ? lib.name : id;
  }

  selectLibrary(libId) {
    this.currentView = 'browse';
    this.currentLibrary = libId;
    this.currentPath = [];
    this.render();
  }

  browsePath(itemName, itemType) {
    if (itemType === 'directory') {
      this.currentPath.push(itemName);
    }
    this.render();
  }

  goHome() { this.currentPath = []; }
  goToBreadcrumb(index) { this.currentPath = this.currentPath.slice(0, index); }

  encPath(segments) {
    return segments.map(encodeURIComponent).join('/');
  }

  fileUrl(itemName, inline) {
    const rel = this.encPath(this.currentPath.concat([itemName]));
    return `/api/browse/${this.currentLibrary}/${rel}${inline ? '?inline=1' : ''}`;
  }

  downloadFile(itemName) {
    const a = document.createElement('a');
    a.href = this.fileUrl(itemName, false);
    a.download = itemName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async addLibrary(name, path, isPublic) {
    try {
      const res = await fetch('/api/admin/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path, public: isPublic })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Add library failed');
      }
      await this.loadLibraries();
      this.currentView = 'admin';
      this.currentTab = 'libraries';
      this.render();
    } catch (error) {
      alert('Add library failed: ' + error.message);
    }
  }

  async removeLibrary(id) {
    if (!confirm(`Remove library "${this.libName(id)}"? (Files on disk are not deleted.)`)) return;
    try {
      const res = await fetch(`/api/admin/libraries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Remove failed');
      if (this.currentLibrary === id) this.currentLibrary = null;
      await this.loadLibraries();
      this.render();
    } catch (error) {
      alert('Remove library failed: ' + error.message);
    }
  }

  async togglePublic(id, makePublic) {
    try {
      const res = await fetch(`/api/admin/libraries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public: makePublic })
      });
      if (!res.ok) throw new Error('Update failed');
      await this.loadLibraries();
      this.render();
    } catch (error) {
      alert('Update failed: ' + error.message);
    }
  }

  // --- Shares ---
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
    document.getElementById('modal-share').classList.remove('show');
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
      const shareUrl = `${window.location.origin}/s/${share.token}`;
      this.hideShareModal();
      await this.loadShares();
      this.currentView = 'admin';
      this.currentTab = 'shares';
      this.render();
      this.copyText(shareUrl, 'Share link created and copied to clipboard');
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
    if (!confirm('Delete this share link?')) return;
    try {
      const res = await fetch(`/api/shares/${token}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await this.loadShares();
      this.render();
    } catch (error) {
      alert('Delete failed: ' + error.message);
    }
  }

  copyShareLink(token) {
    this.copyText(`${window.location.origin}/s/${token}`, 'Share link copied');
  }

  copyText(text, msg) {
    navigator.clipboard.writeText(text).then(() => {
      alert(msg + ':\n\n' + text);
    }).catch(() => {
      alert(text);
    });
  }

  async loadBrowseDirectory() {
    if (!this.currentLibrary) return [];
    const url = `/api/browse/${this.currentLibrary}/${this.encPath(this.currentPath)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) { console.error('Browse error:', res.status); return []; }
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      console.error('Error loading browse:', e);
      return [];
    }
  }

  // --- Rendering ---
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
          <h1>stor-serve admin</h1>
          <form id="login-form">
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="login-password" placeholder="Enter password" required autofocus>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; padding: var(--spacing-md);">
              Sign in
            </button>
          </form>
          <p class="text-muted mt-2" style="text-align:center;">
            <a href="/" style="color: var(--color-primary);">&larr; Back to public site</a>
          </p>
        </div>
      </div>
    `;
  }

  setupLoginForm() {
    const form = document.getElementById('login-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.login(document.getElementById('login-password').value);
      });
    }
  }

  setupAppEventHandlers() {
    const modal = document.getElementById('modal-share');
    modal.querySelector('.modal-close').onclick = () => this.hideShareModal();
    document.getElementById('share-cancel').onclick = () => this.hideShareModal();
    document.getElementById('share-submit').onclick = () => this.createShare();
    modal.onclick = (e) => { if (e.target === modal) this.hideShareModal(); };

    const libForm = document.getElementById('library-form');
    if (libForm) {
      libForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('lib-name').value;
        const path = document.getElementById('lib-path').value;
        const isPublic = document.getElementById('lib-public').checked;
        document.getElementById('lib-name').value = '';
        document.getElementById('lib-path').value = '';
        document.getElementById('lib-public').checked = false;
        this.addLibrary(name, path, isPublic);
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
        <h1>stor-serve <span class="text-muted" style="font-weight:400;">admin</span></h1>
        <div class="app-header-actions">
          <a class="btn" href="/" target="_blank" rel="noopener">View public site</a>
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
      html += '<div class="text-muted" style="padding: var(--spacing-sm) var(--spacing-md);">No libraries</div>';
    } else {
      for (const lib of this.libraries) {
        const active = this.currentLibrary === lib.id && this.currentView === 'browse' ? 'active' : '';
        const dot = lib.public ? ' <span title="Public" style="color: var(--color-success);">&bull;</span>' : '';
        html += `<div class="app-sidebar-item ${active}" onclick="window.app.selectLibrary('${lib.id}')">${this.escAttr(lib.name)}${dot}</div>`;
      }
    }

    html += '</div>';
    html += '<div class="app-sidebar-section">';
    html += '<div class="app-sidebar-title">Menu</div>';
    html += `<div class="app-sidebar-item" onclick="window.app.openShares()">Active Shares</div>`;
    html += `<div class="app-sidebar-item" onclick="window.app.openLibraries()">Manage Libraries</div>`;
    html += '</div></div>';
    return html;
  }

  openShares() {
    this.currentView = 'admin';
    this.currentTab = 'shares';
    this.loadShares().then(() => this.render());
  }

  openLibraries() {
    this.currentView = 'admin';
    this.currentTab = 'libraries';
    this.render();
  }

  renderTabs() {
    return `
      <div class="nav-tabs">
        <div class="nav-tab ${this.currentView === 'browse' ? 'active' : ''}" onclick="window.app.currentView='browse'; window.app.render();">Browse</div>
        <div class="nav-tab ${this.currentView === 'admin' && this.currentTab === 'shares' ? 'active' : ''}" onclick="window.app.openShares()">Shares</div>
        <div class="nav-tab ${this.currentView === 'admin' && this.currentTab === 'libraries' ? 'active' : ''}" onclick="window.app.openLibraries()">Libraries</div>
      </div>
    `;
  }

  renderBrowseView() {
    if (!this.currentLibrary) {
      return `<div class="empty-state"><div class="empty-state-icon">&#128194;</div><p>Select a library to browse</p></div>`;
    }
    return `<div id="browse-container"></div>`;
  }

  async renderBrowseViewAsync() {
    if (!this.currentLibrary) return '';
    const items = await this.loadBrowseDirectory();
    let html = this.renderBreadcrumb();

    if (items.length === 0) {
      html += '<div class="empty-state"><p>No files in this directory</p></div>';
      return html;
    }

    html += '<div class="file-grid">';
    for (const item of items) {
      const isDir = item.type === 'directory';
      const icon = isDir ? '&#128193;' : '&#128196;';
      const size = item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : '';
      const sizeHtml = size ? `<div class="file-item-meta"><span>${size}</span></div>` : '';
      const safe = this.escAttr(item.name);
      const open = isDir ? `window.app.browsePath('${safe}', 'directory')` : '';
      const fileActions = isDir ? '' :
        `<button class="file-action-btn" onclick="event.stopPropagation(); window.app.downloadFile('${safe}');" title="Download">&#11015;</button>`;
      html += `
        <div class="file-item">
          <div class="file-item-actions">
            ${fileActions}
            <button class="file-action-btn" onclick="event.stopPropagation(); window.app.shareFile('${safe}', '${item.type}');" title="Create share link">&#128279;</button>
          </div>
          <div class="file-item-icon" style="cursor: ${isDir ? 'pointer' : 'default'};" onclick="${open}">${icon}</div>
          <div class="file-item-name" style="cursor: ${isDir ? 'pointer' : 'default'};" onclick="${open}">${this.escHtml(item.name)}</div>
          ${sizeHtml}
        </div>
      `;
    }
    html += '</div>';
    return html;
  }

  renderBreadcrumb() {
    let html = '<div class="breadcrumb">';
    html += `<span class="breadcrumb-item" onclick="window.app.goHome(); window.app.render();">${this.escHtml(this.libName(this.currentLibrary))}</span>`;
    for (let i = 0; i < this.currentPath.length; i++) {
      html += `<span class="breadcrumb-separator">/</span>`;
      html += `<span class="breadcrumb-item" onclick="window.app.goToBreadcrumb(${i + 1}); window.app.render();">${this.escHtml(this.currentPath[i])}</span>`;
    }
    html += '</div>';
    return html;
  }

  renderAdminView() {
    return this.currentTab === 'shares' ? this.renderSharesTab() : this.renderLibrariesTab();
  }

  renderSharesTab() {
    const entries = Object.entries(this.shares);
    if (entries.length === 0) {
      return `<div class="empty-state"><div class="empty-state-icon">&#128279;</div><p>No active share links</p>
        <p class="text-muted mt-1">Browse a library and use the link button on a file to create one.</p></div>`;
    }
    let html = '<table class="shares-table"><thead><tr><th>Label</th><th>Library</th><th>Type</th><th>Expires</th><th>Action</th></tr></thead><tbody>';
    for (const [token, share] of entries) {
      const expires = share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : 'Never';
      html += `
        <tr>
          <td>${this.escHtml(share.label)}</td>
          <td>${this.escHtml(this.libName(share.library))}</td>
          <td>${share.type}</td>
          <td>${expires}</td>
          <td class="shares-table-actions">
            <button class="btn btn-small" onclick="window.app.copyShareLink('${token}')">Copy link</button>
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
        <p class="text-muted mb-2">Point at any folder on this machine. Mark it public to expose it on the visitor-facing site (no login needed to download).</p>
        <form id="library-form">
          <div class="form-row">
            <input type="text" id="lib-name" placeholder="Display name (e.g. Movies)" required>
            <input type="text" id="lib-path" placeholder="Full path (e.g. D:\\Movies)" required>
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="lib-public" style="width:auto;">
            <span>Public &mdash; anyone can browse &amp; download from the public site</span>
          </label>
        </form>
      </div>

      <h3>Current Libraries</h3>
      <div class="libraries-list">
    `;

    if (this.libraries.length === 0) {
      html += '<p class="text-muted">No libraries configured</p>';
    } else {
      for (const lib of this.libraries) {
        const badge = lib.public
          ? '<span class="badge badge-public">Public</span>'
          : '<span class="badge badge-private">Private</span>';
        const toggleLabel = lib.public ? 'Make private' : 'Make public';
        html += `
          <div class="library-item">
            <div class="library-info">
              <div class="library-name">${this.escHtml(lib.name)} ${badge}</div>
              <div class="library-path">${this.escHtml(lib.path)}</div>
            </div>
            <div class="shares-table-actions">
              <button class="btn btn-small" onclick="window.app.togglePublic('${lib.id}', ${!lib.public})">${toggleLabel}</button>
              <button class="btn btn-small btn-danger" onclick="window.app.removeLibrary('${lib.id}')">Remove</button>
            </div>
          </div>
        `;
      }
    }
    html += '</div>';
    return html;
  }

  escHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  escAttr(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }
}

window.app = new StorServeApp();

// After a synchronous render, fill the async browse content.
const originalRender = window.app.render.bind(window.app);
window.app.render = async function () {
  originalRender();
  if (this.currentView === 'browse' && this.currentLibrary) {
    const container = document.getElementById('browse-container');
    if (container) container.innerHTML = await this.renderBrowseViewAsync();
  }
};
