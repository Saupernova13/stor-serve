(function () {
  'use strict';

  var state = {
    libraries: [],
    libId: null,
    path: [],      // array of path segments
    items: [],
    filter: ''
  };

  var el = {
    libraries: document.getElementById('libraries'),
    breadcrumb: document.getElementById('breadcrumb'),
    content: document.getElementById('content'),
    search: document.getElementById('search')
  };

  // --- SVG icons ---
  var ICONS = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    empty: '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
  };

  var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
  var VIDEO_EXT = ['mp4', 'webm', 'mov', 'mkv', 'avi'];
  var AUDIO_EXT = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'];

  function ext(name) {
    var i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  function iconFor(item) {
    if (item.type === 'directory') return { svg: ICONS.folder, cls: 'folder' };
    var e = ext(item.name);
    if (IMAGE_EXT.indexOf(e) >= 0) return { svg: ICONS.image, cls: '' };
    if (VIDEO_EXT.indexOf(e) >= 0) return { svg: ICONS.video, cls: '' };
    if (AUDIO_EXT.indexOf(e) >= 0) return { svg: ICONS.audio, cls: '' };
    return { svg: ICONS.file, cls: '' };
  }

  function formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return bytes + ' B';
    var units = ['KB', 'MB', 'GB', 'TB'];
    var i = -1;
    do { bytes /= 1024; i++; } while (bytes >= 1024 && i < units.length - 1);
    return bytes.toFixed(bytes >= 10 || i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Build the API path for the current library + a relative path array.
  function apiPath(segments) {
    var rel = segments.map(encodeURIComponent).join('/');
    return '/api/public/browse/' + state.libId + (rel ? '/' + rel : '');
  }

  // --- URL hash state (shareable / back-button friendly) ---
  function writeHash() {
    var rel = state.path.map(encodeURIComponent).join('/');
    var h = '#/' + (state.libId || '') + (rel ? '/' + rel : '');
    if (location.hash !== h) {
      history.pushState(null, '', h);
    }
  }

  function readHash() {
    var h = location.hash.replace(/^#\/?/, '');
    if (!h) return { libId: null, path: [] };
    var parts = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { libId: parts.shift() || null, path: parts };
  }

  // --- Rendering ---
  function renderLibraries() {
    if (state.libraries.length <= 1) {
      el.libraries.innerHTML = '';
      return;
    }
    el.libraries.innerHTML = state.libraries.map(function (lib) {
      var active = lib.id === state.libId ? ' active' : '';
      return '<button class="lib-pill' + active + '" data-lib="' + esc(lib.id) + '">' + esc(lib.name) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.libraries.querySelectorAll('.lib-pill'), function (btn) {
      btn.addEventListener('click', function () {
        selectLibrary(btn.getAttribute('data-lib'));
      });
    });
  }

  function renderBreadcrumb() {
    var lib = state.libraries.find(function (l) { return l.id === state.libId; });
    if (!lib) { el.breadcrumb.innerHTML = ''; return; }

    var html = '';
    var rootCurrent = state.path.length === 0 ? ' current' : '';
    html += '<span class="crumb' + rootCurrent + '" data-depth="0">' + esc(lib.name) + '</span>';
    for (var i = 0; i < state.path.length; i++) {
      var current = i === state.path.length - 1 ? ' current' : '';
      html += '<span class="crumb-sep">/</span>';
      html += '<span class="crumb' + current + '" data-depth="' + (i + 1) + '">' + esc(state.path[i]) + '</span>';
    }
    el.breadcrumb.innerHTML = html;
    Array.prototype.forEach.call(el.breadcrumb.querySelectorAll('.crumb'), function (c) {
      if (c.classList.contains('current')) return;
      c.addEventListener('click', function () {
        state.path = state.path.slice(0, parseInt(c.getAttribute('data-depth'), 10));
        writeHash();
        loadDirectory();
      });
    });
  }

  function renderLoading() {
    el.content.innerHTML = '<div class="state"><div class="spinner"></div></div>';
  }

  function renderEmpty(title, sub) {
    el.content.innerHTML =
      '<div class="state"><div class="state-icon">' + ICONS.empty + '</div>' +
      '<div class="state-title">' + esc(title) + '</div>' +
      (sub ? '<div class="state-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function renderItems() {
    var filter = state.filter.trim().toLowerCase();
    var items = state.items;
    if (filter) {
      items = items.filter(function (it) { return it.name.toLowerCase().indexOf(filter) >= 0; });
    }

    if (!items.length) {
      if (filter) { renderEmpty('No matches', 'Nothing here matches "' + state.filter + '".'); }
      else { renderEmpty('This folder is empty', 'There are no files to show yet.'); }
      return;
    }

    var rows = items.map(function (it) {
      var ic = iconFor(it);
      var meta = it.type === 'directory'
        ? 'Folder'
        : formatSize(it.size) + ' · <span class="modified">' + formatDate(it.modified) + '</span>';

      var actions = '';
      if (it.type === 'file') {
        if (it.previewable) {
          actions += '<button class="action" data-act="preview" data-name="' + esc(it.name) + '">' + ICONS.eye + '<span>Preview</span></button>';
        }
        actions += '<button class="action primary" data-act="download" data-name="' + esc(it.name) + '">' + ICONS.download + '<span>Download</span></button>';
      } else if (it.type === 'directory') {
        actions += '<button class="action primary" data-act="download-zip" data-name="' + esc(it.name) + '">' + ICONS.download + '<span>Download Folder</span></button>';
      }

      var clickable = it.type === 'directory' ? ' clickable' : '';
      return '<div class="row' + clickable + '" data-type="' + it.type + '" data-name="' + esc(it.name) + '">' +
        '<div class="row-icon ' + ic.cls + '">' + ic.svg + '</div>' +
        '<div class="row-main"><div class="row-name">' + esc(it.name) + '</div>' +
        '<div class="row-meta">' + meta + '</div></div>' +
        '<div class="row-actions">' + actions + '</div></div>';
    }).join('');

    el.content.innerHTML = '<div class="file-list">' + rows + '</div>';

    Array.prototype.forEach.call(el.content.querySelectorAll('.row'), function (row) {
      var name = row.getAttribute('data-name');
      var type = row.getAttribute('data-type');
      if (type === 'directory') {
        row.addEventListener('click', function () {
          state.path.push(name);
          state.filter = '';
          el.search.value = '';
          writeHash();
          loadDirectory();
        });
      }
    });

    Array.prototype.forEach.call(el.content.querySelectorAll('.action'), function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var name = btn.getAttribute('data-name');
        var url = apiPath(state.path.concat([name]));
        var act = btn.getAttribute('data-act');
        if (act === 'preview') {
          window.open(url + '?inline=1', '_blank', 'noopener');
        } else if (act === 'download-zip') {
          // Download folder as zip via a temporary anchor.
          var a = document.createElement('a');
          a.href = url + '?download=zip';
          a.download = name + '.zip';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          // Force download via a temporary anchor.
          var a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      });
    });
  }

  // --- Data loading ---
  function loadDirectory() {
    renderBreadcrumb();
    renderLoading();
    fetch(apiPath(state.path))
      .then(function (res) {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then(function (data) {
        state.items = data.items || [];
        renderItems();
      })
      .catch(function () {
        renderEmpty('Folder unavailable', 'This location could not be opened.');
      });
  }

  function selectLibrary(libId) {
    state.libId = libId;
    state.path = [];
    state.filter = '';
    el.search.value = '';
    renderLibraries();
    writeHash();
    loadDirectory();
  }

  function boot() {
    fetch('/api/public/libraries')
      .then(function (res) { return res.json(); })
      .then(function (libs) {
        state.libraries = libs || [];
        if (!state.libraries.length) {
          el.libraries.innerHTML = '';
          el.breadcrumb.innerHTML = '';
          renderEmpty('Nothing shared yet', 'The owner has not published any files.');
          return;
        }
        var fromHash = readHash();
        var match = fromHash.libId && state.libraries.find(function (l) { return l.id === fromHash.libId; });
        state.libId = match ? fromHash.libId : state.libraries[0].id;
        state.path = match ? fromHash.path : [];
        renderLibraries();
        loadDirectory();
      })
      .catch(function () {
        renderEmpty('Unavailable', 'Could not reach the server.');
      });
  }

  // Search (filters current folder client-side).
  el.search.addEventListener('input', function () {
    state.filter = el.search.value;
    if (state.libId) renderItems();
  });

  // Browser back/forward.
  window.addEventListener('popstate', function () {
    var h = readHash();
    if (!h.libId || !state.libraries.find(function (l) { return l.id === h.libId; })) {
      if (state.libraries.length) { state.libId = state.libraries[0].id; state.path = []; }
    } else {
      state.libId = h.libId;
      state.path = h.path;
    }
    state.filter = '';
    el.search.value = '';
    renderLibraries();
    if (state.libId) loadDirectory();
  });

  boot();
})();
