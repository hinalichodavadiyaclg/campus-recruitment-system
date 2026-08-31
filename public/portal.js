const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const toastRoot = document.querySelector('#toast-root');
const SESSION_KEY = 'campusRecruitSessionToken';
const REMEMBER_KEY = 'campusRecruitRememberedSessionToken';

const state = { me: null, resetToken: null, resetEmail: null, importData: null };

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
const getToken = () => sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(REMEMBER_KEY);
const setToken = (token, remember) => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  (remember ? localStorage : sessionStorage).setItem(remember ? REMEMBER_KEY : SESSION_KEY, token);
};
const clearToken = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  state.me = null;
  state.importData = null;
};
const go = (path) => { location.hash = `#${path}`; };
const path = () => location.hash.replace(/^#/, '') || '/login';
const initials = (email = '') => email.split('@')[0].split(/[._-]/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
const displayName = (user) => user?.email?.split('@')[0].replace(/[._-]/g, ' ') || 'Portal User';
const formatDate = (value) => (value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—');
const badge = (status) => `<span class="badge ${String(status).toLowerCase()}">${esc(status)}</span>`;

// Dynamic Permission Check based strictly on active permissions returned from MongoDB
const has = (permission) => Boolean(state.me?.permissionIds?.includes(permission) || (state.me?.permissions && state.me.permissions.some((p) => p._id === permission && p.isActive)));
const can = (permission) => has(permission);

function toast(message) {
  toastRoot.innerHTML = `<div class="toast">${esc(message)}</div>`;
  setTimeout(() => { toastRoot.innerHTML = ''; }, 3500);
}

function confirmAction({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">${esc(title)}</h2><p>${esc(message)}</p><div class="modal-actions"><button class="ghost" id="modal-cancel" type="button">Cancel</button><button class="${danger ? 'danger' : 'primary'}" id="modal-confirm" type="button">${esc(confirmLabel)}</button></div></section></div>`;
  document.querySelector('#modal-cancel').onclick = () => { modalRoot.innerHTML = ''; };
  document.querySelector('#modal-confirm').onclick = async () => { modalRoot.innerHTML = ''; await onConfirm(); };
}

function showModal(content) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true">${content}</section></div>`;
  const cancelBtn = document.querySelector('#modal-close');
  if (cancelBtn) cancelBtn.onclick = () => { modalRoot.innerHTML = ''; };
}

async function api(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    if (response.status === 401 && getToken()) {
      clearToken();
      go('/login');
    }
    throw new Error(body?.error?.message || 'The request could not be completed.');
  }
  return body.data;
}

function passwordFields(prefix, current = false) {
  return `${current ? `<div class="field password-field"><label for="${prefix}-current">Current or temporary password</label><input id="${prefix}-current" type="password" autocomplete="current-password" required><button class="password-toggle" data-toggle-password="${prefix}-current" type="button">Show</button></div>` : ''}
    <div class="field password-field"><label for="${prefix}-new">New password</label><input id="${prefix}-new" type="password" autocomplete="new-password" required><button class="password-toggle" data-toggle-password="${prefix}-new" type="button">Show</button></div>
    <div class="field password-field"><label for="${prefix}-confirm">Confirm new password</label><input id="${prefix}-confirm" type="password" autocomplete="new-password" required><button class="password-toggle" data-toggle-password="${prefix}-confirm" type="button">Show</button></div>
    <ul class="requirements"><li>At least 12 characters</li><li>Uppercase, lowercase, number, and symbol</li></ul>`;
}

function bindPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.onclick = () => {
      const input = document.querySelector(`#${button.dataset.togglePassword}`);
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? 'Show' : 'Hide';
    };
  });
}

function authFrame(content) {
  app.innerHTML = `<main class="auth-shell"><section class="auth-hero"><a class="brand" href="#/login"><span class="brand-mark">CR</span><span>Campus Recruit</span></a><h1>Career opportunities, securely connected.</h1><p>University Campus Recruitment Portal provides role-based access for students, recruiters, and placement professionals.</p><ul class="hero-list"><li>Students</li><li>Recruiters</li><li>Placement Cell</li><li>Super Admin</li></ul></section><section class="auth-content"><div class="auth-card">${content}</div></section></main>`;
  bindPasswordToggles();
}

function publicLogin() {
  authFrame(`<p class="eyebrow">Secure sign in</p><h2>Welcome back</h2><p class="subcopy">Use your university or organization account to continue.</p><form id="login-form" class="form-grid"><div class="field"><label for="email">User ID or email</label><input id="email" type="email" autocomplete="email" placeholder="you@university.edu" required></div><div class="field password-field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required><button class="password-toggle" data-toggle-password="password" type="button">Show</button></div><div class="row-between"><label class="remember"><input id="remember" type="checkbox">Remember me</label><a class="text-link" href="#/forgot-password">Forgot password?</a></div><p id="form-notice" hidden></p><button class="primary full" type="submit">Sign in</button></form><p class="help-text">Your navigation and permissions are loaded dynamically from MongoDB upon sign-in.</p>`);
  bindPasswordToggles();
  document.querySelector('#login-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const notice = document.querySelector('#form-notice');
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: document.querySelector('#email').value.trim(), password: document.querySelector('#password').value })
      });
      setToken(data.sessionToken, document.querySelector('#remember').checked);
      state.me = null;
      go('/dashboard');
    } catch (error) {
      notice.className = 'notice error';
      notice.textContent = error.message;
      notice.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  };
}

function forgotPassword() {
  authFrame(`<p class="eyebrow">Password recovery</p><h2>Forgot your password?</h2><p class="subcopy">Enter your account email. We will prepare a verification step.</p><form id="forgot-form" class="form-grid"><div class="field"><label for="forgot-email">Email or User ID</label><input id="forgot-email" type="email" autocomplete="email" required></div><p id="forgot-notice" hidden></p><button class="primary" type="submit">Send verification code</button><a class="text-link center" href="#/login">← Back to sign in</a></form>`);
  document.querySelector('#forgot-form').onsubmit = async (event) => {
    event.preventDefault();
    const email = document.querySelector('#forgot-email').value.trim();
    const notice = document.querySelector('#forgot-notice');
    try {
      const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      state.resetEmail = email;
      state.resetToken = data.resetToken || null;
      go('/verify-reset');
    } catch (error) {
      notice.className = 'notice error';
      notice.textContent = error.message;
      notice.hidden = false;
    }
  };
}

function verificationPage() {
  authFrame(`<p class="eyebrow">Password recovery</p><h2>Verify your identity</h2><p class="subcopy">Enter the verification step for <b>${esc(state.resetEmail || 'your email')}</b>.</p><form id="verify-form" class="form-grid"><div class="otp-row">${[0, 1, 2, 3, 4, 5].map((index) => `<input data-otp="${index}" inputmode="numeric" maxlength="1" aria-label="Verification digit ${index + 1}" required>`).join('')}</div><p class="center"><span id="timer">05:00</span> remaining</p><p id="verify-notice" hidden></p><button class="primary" type="submit">Verify and continue</button><button id="resend-code" class="secondary" type="button">Resend code</button><a class="text-link center" href="#/forgot-password">Use another email</a></form>`);
  const digits = [...document.querySelectorAll('[data-otp]')];
  digits.forEach((input, index) => {
    input.oninput = () => {
      input.value = input.value.replace(/\D/g, '');
      if (input.value && digits[index + 1]) digits[index + 1].focus();
    };
  });
  let remaining = 300;
  const timer = setInterval(() => {
    remaining -= 1;
    const element = document.querySelector('#timer');
    if (!element) return clearInterval(timer);
    element.textContent = `${String(Math.max(0, Math.floor(remaining / 60))).padStart(2, '0')}:${String(Math.max(0, remaining % 60)).padStart(2, '0')}`;
    if (!remaining) clearInterval(timer);
  }, 1000);
  document.querySelector('#verify-form').onsubmit = (event) => {
    event.preventDefault();
    const code = digits.map((input) => input.value).join('');
    if (code.length !== 6) {
      const n = document.querySelector('#verify-notice');
      n.className = 'notice error';
      n.textContent = 'Enter all six digits.';
      n.hidden = false;
      return;
    }
    go('/reset-password');
  };
  document.querySelector('#resend-code').onclick = async () => {
    try {
      const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: state.resetEmail }) });
      state.resetToken = data.resetToken || state.resetToken;
      toast('Verification instructions refreshed.');
    } catch (error) {
      toast(error.message);
    }
  };
}

function resetPasswordPage() {
  authFrame(`<p class="eyebrow">Password recovery</p><h2>Set a new password</h2><p class="subcopy">Choose a strong password you have not used before.</p><form id="reset-form" class="form-grid">${passwordFields('reset')}<p id="reset-notice" hidden></p><button class="primary" type="submit">Reset password</button></form>`);
  bindPasswordToggles();
  document.querySelector('#reset-form').onsubmit = async (event) => {
    event.preventDefault();
    const password = document.querySelector('#reset-new').value;
    const notice = document.querySelector('#reset-notice');
    if (password !== document.querySelector('#reset-confirm').value) {
      notice.className = 'notice error';
      notice.textContent = 'Passwords do not match.';
      notice.hidden = false;
      return;
    }
    if (!state.resetToken) {
      notice.className = 'notice warn';
      notice.textContent = 'No reset token available. Please restart the forgot password process.';
      notice.hidden = false;
      return;
    }
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: state.resetToken, newPassword: password }) });
      state.resetToken = null;
      go('/reset-success');
    } catch (error) {
      notice.className = 'notice error';
      notice.textContent = error.message;
      notice.hidden = false;
    }
  };
}

function resetSuccessPage() {
  authFrame(`<div class="center"><div class="success-icon">✓</div><p class="eyebrow">Password updated</p><h2>Password successfully changed</h2><p class="subcopy">Your active sessions have been signed out. Use your new password to sign in.</p><a class="primary full" href="#/login">Continue to sign in</a></div>`);
}

function navItem(route, icon, label) {
  const current = path();
  const isActive = current === route || (route !== '/dashboard' && current.startsWith(`${route}/`));
  return `<a class="nav-link ${isActive ? 'active' : ''}" href="#${route}"><span class="nav-icon">${icon}</span>${label}</a>`;
}

function portalFrame(title, subtitle, content, actions = '') {
  const user = state.me.user;

  // Dynamic Navigation Items rendered based on granted permissions
  const hasAccessNav = has('USER_READ') || has('ROLE_READ') || has('PERMISSION_READ') || has('SESSION_READ');
  const accessNav = hasAccessNav
    ? `<span class="nav-label">Access management</span>
       ${has('USER_READ') ? navItem('/users', '◫', 'Users') : ''}
       ${has('ROLE_READ') ? navItem('/roles', '◈', 'Roles') : ''}
       ${has('PERMISSION_READ') ? navItem('/permissions', '⌘', 'Permissions') : ''}
       ${has('SESSION_READ') ? navItem('/sessions', '◷', 'Login activity') : ''}`
    : '';

  const hasImportNav = has('STUDENT_IMPORT') || has('COMPANY_IMPORT') || has('PLACEMENT_USER_IMPORT');
  const importNav = hasImportNav
    ? `<span class="nav-label">Excel Data Import</span>
       ${has('STUDENT_IMPORT') ? navItem('/import/student', '⤓', 'Import Students') : ''}
       ${has('COMPANY_IMPORT') ? navItem('/import/company', '⤓', 'Import Companies') : ''}
       ${has('PLACEMENT_USER_IMPORT') ? navItem('/import/placement', '⤓', 'Import Placement Cell') : ''}`
    : '';

  app.innerHTML = `<div class="portal">
    <aside class="sidebar">
      <a class="brand" href="#/dashboard"><span class="brand-mark">CR</span><span>Campus Recruit</span></a>
      <nav>
        <span class="nav-label">Workspace</span>
        ${navItem('/dashboard', '▦', 'Dashboard')}
        ${navItem('/profile', '◉', 'My account')}
        ${accessNav}
        ${importNav}
      </nav>
      <div class="sidebar-footer">
        <strong>${esc(displayName(user))}</strong>
        <span>${esc(state.me.role.name)}</span>
      </div>
    </aside>
    <section class="main">
      <header class="topbar">
        <div class="breadcrumb">Campus Recruit <span> / </span><b>${esc(title)}</b></div>
        <div class="topbar-actions">
          <a class="user-pill" href="#/profile"><span class="avatar">${initials(user.email)}</span><span>${esc(user.email)}</span></a>
          <button class="ghost" id="top-logout" type="button">Log out</button>
        </div>
      </header>
      <main class="page">
        <header class="page-header">
          <div>
            <p class="eyebrow">${esc(state.me.role.name)}</p>
            <h1>${esc(title)}</h1>
            <p>${esc(subtitle)}</p>
          </div>
          ${actions}
        </header>
        ${content}
      </main>
    </section>
  </div>`;

  document.querySelector('#top-logout').onclick = logoutConfirmation;
}

function logoutConfirmation() {
  confirmAction({
    title: 'Log out?',
    message: 'Your active session will be closed on this device.',
    confirmLabel: 'Log out',
    danger: true,
    onConfirm: async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {}
      clearToken();
      go('/login');
    }
  });
}

async function dashboard() {
  let metrics = '';
  const metricCards = [];

  if (has('USER_READ')) {
    try {
      const users = await api('/api/users?limit=1');
      metricCards.push(`<article class="metric"><span>Total Users</span><strong>${users.total}</strong></article>`);
    } catch {}
  }
  if (has('ROLE_READ')) {
    try {
      const roles = await api('/api/roles');
      metricCards.push(`<article class="metric"><span>Configured Roles</span><strong>${roles.length}</strong></article>`);
    } catch {}
  }
  if (has('PERMISSION_READ')) {
    try {
      const permissions = await api('/api/permissions');
      metricCards.push(`<article class="metric"><span>Active Permissions</span><strong>${permissions.filter((p) => p.isActive).length}</strong></article>`);
    } catch {}
  }
  metricCards.push(`<article class="metric"><span>Role Access</span><strong>${esc(state.me.role.name)}</strong></article>`);

  if (metricCards.length) {
    metrics = `<section class="cards">${metricCards.join('')}</section>`;
  }

  const quickLinks = [];
  if (has('USER_READ')) quickLinks.push(`<a href="#/users">Manage user accounts <span>→</span></a>`);
  if (has('ROLE_READ')) quickLinks.push(`<a href="#/roles">Manage roles & permissions <span>→</span></a>`);
  if (has('STUDENT_IMPORT')) quickLinks.push(`<a href="#/import/student">Import Students from Excel <span>→</span></a>`);
  if (has('COMPANY_IMPORT')) quickLinks.push(`<a href="#/import/company">Import Companies from Excel <span>→</span></a>`);
  if (has('PLACEMENT_USER_IMPORT')) quickLinks.push(`<a href="#/import/placement">Import Placement Cell from Excel <span>→</span></a>`);
  if (has('SESSION_READ')) quickLinks.push(`<a href="#/sessions">Review login & session activity <span>→</span></a>`);
  quickLinks.push(`<a href="#/profile">Review my account <span>→</span></a>`);
  quickLinks.push(`<a href="#/change-password">Change password <span>→</span></a>`);

  portalFrame(
    'Dashboard',
    'Dynamic, permission-based workspace for University Campus Recruitment Portal.',
    `${metrics}
     <section class="dashboard-grid" style="margin-top:16px">
       <article class="feature-card">
         <p class="eyebrow" style="color:#bcecf1">Granted Access</p>
         <h2>Welcome, ${esc(displayName(state.me.user))}</h2>
         <p>Your current role is <b>${esc(state.me.role.name)}</b>. You have <b>${state.me.permissionIds.length}</b> active permissions assigned.</p>
       </article>
       <article class="card">
         <h2>Quick actions</h2>
         <div class="quick-list">${quickLinks.join('')}</div>
       </article>
     </section>`
  );
}

function profilePage() {
  const user = state.me.user;
  const userId = user.universityId || user.employeeId || user.companyId || 'Not assigned';
  portalFrame(
    'My Account',
    'Review your account details and security credentials.',
    `<section class="detail-grid">
       <article class="card">
         <div class="profile-head">
           <div class="profile-avatar">${initials(user.email)}</div>
           <div>
             <h2>${esc(displayName(user))}</h2>
             <p>${esc(state.me.role.name)} · ${esc(user.userType)}</p>
           </div>
         </div>
         <dl class="definition-list">
           <div><dt>User ID</dt><dd>${esc(userId)}</dd></div>
           <div><dt>Email</dt><dd>${esc(user.email)}</dd></div>
           <div><dt>User type</dt><dd>${esc(user.userType)}</dd></div>
           <div><dt>Assigned role</dt><dd>${esc(state.me.role.name)}</dd></div>
           <div><dt>Account status</dt><dd>${badge(user.accountStatus)}</dd></div>
           <div><dt>Last login</dt><dd>${formatDate(user.lastLoginAt)}</dd></div>
         </dl>
       </article>
       <aside class="card">
         <h2>Security</h2>
         <p>Keep your password secure and sign out when finished.</p>
         <div class="form-actions">
           <a class="primary" href="#/change-password">Change password</a>
           <button class="ghost" id="profile-logout">Log out</button>
         </div>
       </aside>
     </section>`
  );
  document.querySelector('#profile-logout').onclick = logoutConfirmation;
}

function changePasswordPage(firstLogin = false) {
  portalFrame(
    firstLogin ? 'First Login Password Change' : 'Change Password',
    'Set a strong, unique password for your account.',
    `<section class="card" style="max-width:620px">
       <form id="change-password-form" class="form-grid">
         ${passwordFields('change', true)}
         <p id="change-notice" hidden></p>
         <div class="form-actions">
           <button class="primary" type="submit">Change password</button>
           <a class="ghost" href="#/profile">Cancel</a>
         </div>
       </form>
     </section>`
  );
  bindPasswordToggles();
  document.querySelector('#change-password-form').onsubmit = async (event) => {
    event.preventDefault();
    const current = document.querySelector('#change-current').value;
    const password = document.querySelector('#change-new').value;
    const n = document.querySelector('#change-notice');
    if (password !== document.querySelector('#change-confirm').value) {
      n.className = 'notice error';
      n.textContent = 'Passwords do not match.';
      n.hidden = false;
      return;
    }
    try {
      await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: password }) });
      n.className = 'notice success';
      n.textContent = 'Password changed successfully.';
      n.hidden = false;
      setTimeout(() => go('/dashboard'), 900);
    } catch (error) {
      n.className = 'notice error';
      n.textContent = error.message;
      n.hidden = false;
    }
  };
}

const actionLink = (label, route) => `<a class="link-button" href="#${route}">${label}</a>`;
const actionButton = (label, id, extraClass = '') => `<button class="link-button ${extraClass}" id="${id}" type="button">${label}</button>`;

// USER MANAGEMENT
async function usersPage() {
  if (!has('USER_READ')) {
    go('/dashboard');
    return;
  }
  const createBtn = has('USER_CREATE') ? `<button class="primary" id="btn-create-user" type="button">+ Create User</button>` : '';
  portalFrame('User Management', 'Search accounts, review access, and manage account statuses.', `<div id="users-content" class="loading">Loading users…</div>`, createBtn);

  if (has('USER_CREATE')) {
    document.querySelector('#btn-create-user').onclick = openCreateUserModal;
  }

  try {
    const [result, roles] = await Promise.all([api('/api/users?limit=100'), has('ROLE_READ') ? api('/api/roles') : Promise.resolve([])]);
    const renderRows = () => {
      const query = document.querySelector('#user-search').value.toLowerCase();
      const type = document.querySelector('#user-type').value;
      const role = document.querySelector('#user-role').value;
      const status = document.querySelector('#user-status').value;
      const items = result.items.filter(
        (u) =>
          (!query || [u.email, u.universityId, u.employeeId].filter(Boolean).join(' ').toLowerCase().includes(query)) &&
          (!type || u.userType === type) &&
          (!role || u.roleId === role) &&
          (!status || u.accountStatus === status)
      );

      document.querySelector('#users-table-body').innerHTML = items.length
        ? items
            .map((u) => {
              const actions = [];
              actions.push(actionLink('View', `/users/${u._id}`));
              if (has('USER_UPDATE')) actions.push(`<button class="link-button" onclick="window.editUserModal('${u._id}')">Edit</button>`);
              if (has('USER_ASSIGN_ROLE')) actions.push(actionLink('Role', `/users/${u._id}/role`));
              if (has('USER_LOCK') && u.accountStatus === 'ACTIVE') actions.push(`<button class="link-button" onclick="window.lockUserAction('${u._id}')">Lock</button>`);
              if (has('USER_UNLOCK') && u.accountStatus === 'LOCKED') actions.push(`<button class="link-button" onclick="window.unlockUserAction('${u._id}')">Unlock</button>`);
              if (has('USER_DELETE')) actions.push(`<button class="link-button" style="color:var(--red)" onclick="window.deleteUserAction('${u._id}')">Delete</button>`);

              return `<tr>
                <td>${esc(u.universityId || u.employeeId || u.companyId || '—')}</td>
                <td>${esc(displayName(u))}</td>
                <td>${esc(u.email)}</td>
                <td>${esc(u.userType)}</td>
                <td>${esc(roles.find((r) => r._id === u.roleId)?.name || u.roleId)}</td>
                <td>${badge(u.accountStatus)}</td>
                <td>${formatDate(u.lastLoginAt)}</td>
                <td class="actions">${actions.join('')}</td>
              </tr>`;
            })
            .join('')
        : `<tr><td colspan="8" class="empty">No users match these filters.</td></tr>`;
    };

    document.querySelector('#users-content').outerHTML = `
      <section>
        <div class="filters">
          <input id="user-search" placeholder="Search email or user ID">
          <select id="user-type"><option value="">All user types</option><option>STUDENT</option><option>COMPANY</option><option>PLACEMENT</option></select>
          <select id="user-role"><option value="">All roles</option>${roles.map((r) => `<option value="${esc(r._id)}">${esc(r.name)}</option>`).join('')}</select>
          <select id="user-status"><option value="">All statuses</option><option>ACTIVE</option><option>INACTIVE</option><option>LOCKED</option></select>
        </div>
        <article class="card table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Type</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
              <tbody id="users-table-body"></tbody>
            </table>
          </div>
        </article>
      </section>`;

    ['#user-search', '#user-type', '#user-role', '#user-status'].forEach((sel) => {
      document.querySelector(sel).oninput = renderRows;
    });
    renderRows();
  } catch (error) {
    document.querySelector('#users-content').textContent = error.message;
  }
}

async function openCreateUserModal() {
  const roles = await api('/api/roles').catch(() => []);
  showModal(`
    <h2>Create New User</h2>
    <form id="create-user-modal-form" class="form-grid" style="margin-top:16px;">
      <div class="field"><label for="cu-email">Email Address</label><input id="cu-email" type="email" required></div>
      <div class="field"><label for="cu-type">User Type</label>
        <select id="cu-type">
          <option value="STUDENT">STUDENT</option>
          <option value="COMPANY">COMPANY</option>
          <option value="PLACEMENT">PLACEMENT</option>
        </select>
      </div>
      <div class="field"><label for="cu-role">Assigned Role</label>
        <select id="cu-role">${roles.map((r) => `<option value="${esc(r._id)}">${esc(r.name)}</option>`).join('')}</select>
      </div>
      <div class="field" id="cu-id-group"><label for="cu-id">University ID / Employee ID</label><input id="cu-id" placeholder="Optional identifier"></div>
      <div class="field"><label for="cu-password">Password (leave blank to auto-generate)</label><input id="cu-password" type="password" placeholder="Min 12 chars with symbol, uppercase, number"></div>
      <p id="cu-notice" hidden></p>
      <div class="modal-actions">
        <button class="ghost" id="modal-close" type="button">Cancel</button>
        <button class="primary" type="submit">Create User</button>
      </div>
    </form>
  `);

  document.querySelector('#create-user-modal-form').onsubmit = async (event) => {
    event.preventDefault();
    const type = document.querySelector('#cu-type').value;
    const body = {
      email: document.querySelector('#cu-email').value.trim(),
      userType: type,
      roleId: document.querySelector('#cu-role').value,
      accountStatus: 'ACTIVE',
      isEmailVerified: true
    };
    const idVal = document.querySelector('#cu-id').value.trim();
    if (type === 'STUDENT' && idVal) body.universityId = idVal;
    if (type === 'PLACEMENT' && idVal) body.employeeId = idVal;
    const pwd = document.querySelector('#cu-password').value;
    if (pwd) body.password = pwd;

    try {
      const created = await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
      modalRoot.innerHTML = '';
      if (created.temporaryPassword) {
        confirmAction({
          title: 'User Created Successfully',
          message: `Temporary password generated: ${created.temporaryPassword}`,
          confirmLabel: 'OK',
          onConfirm: () => usersPage()
        });
      } else {
        toast('User account created.');
        usersPage();
      }
    } catch (error) {
      const n = document.querySelector('#cu-notice');
      n.className = 'notice error';
      n.textContent = error.message;
      n.hidden = false;
    }
  };
}

window.editUserModal = async (id) => {
  try {
    const [user, roles] = await Promise.all([api(`/api/users/${id}`), api('/api/roles')]);
    showModal(`
      <h2>Edit User Details</h2>
      <form id="edit-user-modal-form" class="form-grid" style="margin-top:16px;">
        <div class="field"><label for="eu-email">Email Address</label><input id="eu-email" type="email" value="${esc(user.email)}" required></div>
        <div class="field"><label for="eu-role">Role</label>
          <select id="eu-role">${roles.map((r) => `<option value="${esc(r._id)}" ${r._id === user.roleId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label for="eu-status">Account Status</label>
          <select id="eu-status">
            <option value="ACTIVE" ${user.accountStatus === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
            <option value="INACTIVE" ${user.accountStatus === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option>
            <option value="LOCKED" ${user.accountStatus === 'LOCKED' ? 'selected' : ''}>LOCKED</option>
          </select>
        </div>
        <div class="field"><label for="eu-password">Reset Password (leave blank to keep current)</label><input id="eu-password" type="password" placeholder="New strong password"></div>
        <p id="eu-notice" hidden></p>
        <div class="modal-actions">
          <button class="ghost" id="modal-close" type="button">Cancel</button>
          <button class="primary" type="submit">Save Changes</button>
        </div>
      </form>
    `);

    document.querySelector('#edit-user-modal-form').onsubmit = async (event) => {
      event.preventDefault();
      const body = {
        email: document.querySelector('#eu-email').value.trim(),
        roleId: document.querySelector('#eu-role').value,
        accountStatus: document.querySelector('#eu-status').value
      };
      const pwd = document.querySelector('#eu-password').value;
      if (pwd) body.password = pwd;

      try {
        await api(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        modalRoot.innerHTML = '';
        toast('User updated successfully.');
        usersPage();
      } catch (error) {
        const n = document.querySelector('#eu-notice');
        n.className = 'notice error';
        n.textContent = error.message;
        n.hidden = false;
      }
    };
  } catch (error) {
    toast(error.message);
  }
};

window.lockUserAction = (id) => {
  confirmAction({
    title: 'Lock Account',
    message: 'Are you sure you want to lock this user account for 30 minutes?',
    confirmLabel: 'Lock Account',
    danger: true,
    onConfirm: async () => {
      try {
        await api(`/api/users/${id}/lock`, { method: 'PATCH', body: JSON.stringify({ lockMinutes: 30 }) });
        toast('Account locked.');
        render();
      } catch (error) {
        toast(error.message);
      }
    }
  });
};

window.unlockUserAction = (id) => {
  confirmAction({
    title: 'Unlock Account',
    message: 'Unlock this user account and reset failed login attempts?',
    confirmLabel: 'Unlock Account',
    onConfirm: async () => {
      try {
        await api(`/api/users/${id}/unlock`, { method: 'PATCH', body: '{}' });
        toast('Account unlocked.');
        render();
      } catch (error) {
        toast(error.message);
      }
    }
  });
};

window.deleteUserAction = (id) => {
  confirmAction({
    title: 'Delete User',
    message: 'Are you sure you want to delete this user permanently? This action cannot be undone.',
    confirmLabel: 'Delete User',
    danger: true,
    onConfirm: async () => {
      try {
        await api(`/api/users/${id}`, { method: 'DELETE' });
        toast('User deleted successfully.');
        usersPage();
      } catch (error) {
        toast(error.message);
      }
    }
  });
};

async function userDetailsPage(id) {
  if (!has('USER_READ')) {
    go('/dashboard');
    return;
  }
  portalFrame('User Details', 'Review account access, assigned permissions, and session history.', `<div class="loading">Loading user details…</div>`);
  try {
    const user = await api(`/api/users/${id}`);
    const [role, sessions] = await Promise.all([
      api(`/api/roles/${user.roleId}`).catch(() => ({ name: user.roleId, permissionIds: [] })),
      has('SESSION_READ') ? api(`/api/sessions?userId=${id}&limit=5`).catch(() => ({ items: [] })) : Promise.resolve({ items: [] })
    ]);

    const actions = [];
    if (has('USER_UPDATE')) actions.push(`<button class="primary" onclick="window.editUserModal('${user._id}')">Edit User</button>`);
    if (has('USER_ASSIGN_ROLE')) actions.push(`<a class="secondary" href="#/users/${id}/role">Change role</a>`);
    if (has('USER_MANAGE_STATUS') || has('USER_LOCK') || has('USER_UNLOCK')) {
      actions.push(`<button class="ghost" id="user-status-action" type="button">${user.accountStatus === 'LOCKED' ? 'Unlock account' : user.accountStatus === 'INACTIVE' ? 'Activate account' : 'Manage status'}</button>`);
    }
    if (has('USER_DELETE')) actions.push(`<button class="danger" onclick="window.deleteUserAction('${user._id}')">Delete User</button>`);

    portalFrame(
      'User Details',
      'Review account access, assigned permissions, and login activity.',
      `<section class="detail-grid">
         <article class="card">
           <div class="profile-head">
             <div class="profile-avatar">${initials(user.email)}</div>
             <div>
               <h2>${esc(displayName(user))}</h2>
               <p>${esc(user.email)}</p>
             </div>
           </div>
           <dl class="definition-list">
             <div><dt>User ID</dt><dd>${esc(user.universityId || user.employeeId || user.companyId || '—')}</dd></div>
             <div><dt>User type</dt><dd>${esc(user.userType)}</dd></div>
             <div><dt>Assigned role</dt><dd>${esc(role.name)}</dd></div>
             <div><dt>Account status</dt><dd>${badge(user.accountStatus)}</dd></div>
             <div><dt>Last login</dt><dd>${formatDate(user.lastLoginAt)}</dd></div>
           </dl>
           <div class="form-actions">${actions.join('')}</div>
         </article>
         <aside class="card">
           <h2>Assigned permissions</h2>
           <div class="quick-list">
             ${role.permissionIds?.length ? role.permissionIds.map((p) => `<span>${esc(p)}</span>`).join('') : '<p>No permissions assigned.</p>'}
           </div>
           ${has('SESSION_READ') ? `
             <div class="section-title"><h3>Recent login activity</h3><a class="text-link" href="#/sessions">View all</a></div>
             ${sessions.items.length ? `<div class="quick-list">${sessions.items.map((s) => `<span>${formatDate(s.loginAt)} · ${badge(s.status)}</span>`).join('')}</div>` : '<p>No session activity found.</p>'}
           ` : ''}
         </aside>
       </section>`
    );

    const statusBtn = document.querySelector('#user-status-action');
    if (statusBtn) statusBtn.onclick = () => userStatusDialog(user);
  } catch (error) {
    portalFrame('User Details', '', `<p class="notice error">${esc(error.message)}</p>`);
  }
}

function userStatusDialog(user) {
  const actions =
    user.accountStatus === 'LOCKED'
      ? [['Unlock account', 'unlock', false]]
      : user.accountStatus === 'INACTIVE'
        ? [['Activate account', 'activate', false], ['Lock account', 'lock', true]]
        : [['Deactivate account', 'deactivate', true], ['Lock account', 'lock', true]];

  confirmAction({
    title: 'Manage account status',
    message: `Select an action for ${user.email}.`,
    confirmLabel: actions[0][0],
    danger: actions[0][2],
    onConfirm: async () => {
      const [, action] = actions[0];
      try {
        if (action === 'unlock') await api(`/api/users/${user._id}/unlock`, { method: 'PATCH', body: '{}' });
        else if (action === 'lock') await api(`/api/users/${user._id}/lock`, { method: 'PATCH', body: JSON.stringify({ lockMinutes: 30 }) });
        else await api(`/api/users/${user._id}/status`, { method: 'PATCH', body: JSON.stringify({ accountStatus: action === 'activate' ? 'ACTIVE' : 'INACTIVE' }) });
        toast('Account status updated.');
        render();
      } catch (error) {
        toast(error.message);
      }
    }
  });
}

async function userRolePage(id) {
  if (!has('USER_ASSIGN_ROLE')) {
    go('/dashboard');
    return;
  }
  portalFrame('Assign User Role', 'Review the access preview before confirming a role change.', `<div class="loading">Loading role assignment…</div>`);
  try {
    const [user, roles] = await Promise.all([api(`/api/users/${id}`), api('/api/roles')]);
    const usable = roles.filter((r) => r.isActive);
    portalFrame(
      'Assign User Role',
      'Review the access preview before confirming a role change.',
      `<section class="card" style="max-width:720px">
         <p><b>${esc(user.email)}</b> · Current role: <b>${esc(roles.find((r) => r._id === user.roleId)?.name || user.roleId)}</b></p>
         <form id="user-role-form" class="form-grid">
           <div class="field">
             <label for="new-role">New role</label>
             <select id="new-role">${usable.map((r) => `<option value="${esc(r._id)}" ${r._id === user.roleId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
           </div>
           <div id="role-preview" class="notice"></div>
           <div class="form-actions">
             <button class="primary" type="submit">Confirm role change</button>
             <a class="ghost" href="#/users/${id}">Cancel</a>
           </div>
         </form>
       </section>`
    );
    const preview = () => {
      const r = usable.find((role) => role._id === document.querySelector('#new-role').value);
      document.querySelector('#role-preview').textContent = `Permission preview: ${r?.permissionIds?.length ? r.permissionIds.join(', ') : 'No permissions assigned.'}`;
    };
    document.querySelector('#new-role').onchange = preview;
    preview();
    document.querySelector('#user-role-form').onsubmit = (event) => {
      event.preventDefault();
      confirmAction({
        title: 'Change user role?',
        message: 'The user’s active sessions will be signed out and updated permissions apply immediately.',
        confirmLabel: 'Confirm change',
        onConfirm: async () => {
          try {
            await api(`/api/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ roleId: document.querySelector('#new-role').value }) });
            toast('User role changed.');
            go(`/users/${id}`);
          } catch (error) {
            toast(error.message);
          }
        }
      });
    };
  } catch (error) {
    toast(error.message);
  }
}

// ROLE MANAGEMENT
async function rolesPage() {
  if (!has('ROLE_READ')) {
    go('/dashboard');
    return;
  }
  const createBtn = has('ROLE_CREATE') ? `<a class="primary" href="#/roles/new">+ Create role</a>` : '';
  portalFrame('Role Management', 'Define roles, manage assigned permissions, and configure access.', `<div id="roles-content" class="loading">Loading roles…</div>`, createBtn);

  try {
    const roles = await api('/api/roles');
    document.querySelector('#roles-content').outerHTML = `
      <article class="card table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Role</th><th>Description</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead>
            <tbody>
              ${roles.map((r) => {
                const actions = [];
                actions.push(actionLink('View', `/roles/${r._id}`));
                if (has('ROLE_UPDATE')) actions.push(actionLink('Edit', `/roles/${r._id}/edit`));
                if (has('ROLE_ASSIGN_PERMISSION')) actions.push(actionLink('Permissions', `/roles/${r._id}/permissions`));
                if (has('ROLE_DELETE') && r._id !== 'ROLE_SUPER_ADMIN') actions.push(`<button class="link-button" style="color:var(--red)" onclick="window.deleteRoleAction('${r._id}')">Delete</button>`);
                return `<tr>
                  <td><b>${esc(r.name)}</b><br><span class="badge neutral">${esc(r._id)}</span></td>
                  <td>${esc(r.description)}</td>
                  <td>${badge(r.isActive ? 'ACTIVE' : 'INACTIVE')}</td>
                  <td>${r.permissionIds.length}</td>
                  <td class="actions">${actions.join('')}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </article>`;
  } catch (error) {
    toast(error.message);
  }
}

window.deleteRoleAction = (id) => {
  confirmAction({
    title: 'Delete Role',
    message: `Are you sure you want to delete role '${id}'? This cannot be undone.`,
    confirmLabel: 'Delete Role',
    danger: true,
    onConfirm: async () => {
      try {
        await api(`/api/roles/${id}`, { method: 'DELETE' });
        toast('Role deleted.');
        rolesPage();
      } catch (error) {
        toast(error.message);
      }
    }
  });
};

async function roleFormPage(id) {
  const editing = Boolean(id);
  if (editing && !has('ROLE_UPDATE')) { go('/roles'); return; }
  if (!editing && !has('ROLE_CREATE')) { go('/roles'); return; }

  portalFrame(editing ? 'Edit Role' : 'Create Role', 'Configure role details and metadata.', `<div class="loading">Loading role form…</div>`);
  try {
    const role = editing ? await api(`/api/roles/${id}`) : { _id: '', name: '', description: '', permissionIds: [], isActive: true };
    portalFrame(
      editing ? 'Edit Role' : 'Create Role',
      'Configure role details and metadata.',
      `<section class="card" style="max-width:720px">
         <form id="role-form" class="form-grid">
           <div class="field">
             <label for="role-id">Role ID</label>
             <input id="role-id" value="${esc(role._id)}" ${editing ? 'disabled' : ''} placeholder="ROLE_NAME" required>
           </div>
           <div class="field">
             <label for="role-name">Role name</label>
             <input id="role-name" value="${esc(role.name)}" required>
           </div>
           <div class="field">
             <label for="role-description">Description</label>
             <textarea id="role-description" required>${esc(role.description)}</textarea>
           </div>
           ${has('ROLE_MANAGE_STATUS') ? `<label class="remember"><input id="role-active" type="checkbox" ${role.isActive ? 'checked' : ''}>Role is active</label>` : ''}
           <p id="role-notice" hidden></p>
           <div class="form-actions">
             <button class="primary" type="submit">${editing ? 'Save changes' : 'Create role'}</button>
             <a class="ghost" href="#/roles">Cancel</a>
           </div>
         </form>
       </section>`
    );

    document.querySelector('#role-form').onsubmit = async (event) => {
      event.preventDefault();
      const body = {
        name: document.querySelector('#role-name').value.trim(),
        description: document.querySelector('#role-description').value.trim()
      };
      try {
        let saved;
        if (editing) {
          saved = await api(`/api/roles/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          saved = await api('/api/roles', { method: 'POST', body: JSON.stringify({ ...body, id: document.querySelector('#role-id').value.trim() }) });
        }
        const activeCheck = document.querySelector('#role-active');
        if (activeCheck && saved.isActive !== activeCheck.checked) {
          await api(`/api/roles/${saved._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: activeCheck.checked }) });
        }
        toast('Role saved.');
        go(`/roles/${saved._id}`);
      } catch (error) {
        const n = document.querySelector('#role-notice');
        n.className = 'notice error';
        n.textContent = error.message;
        n.hidden = false;
      }
    };
  } catch (error) {
    toast(error.message);
  }
}

async function roleDetailsPage(id) {
  if (!has('ROLE_READ')) { go('/dashboard'); return; }
  portalFrame('Role Details', 'Review permissions, assigned users, and status.', `<div class="loading">Loading role…</div>`);
  try {
    const [role, users] = await Promise.all([
      api(`/api/roles/${id}`),
      has('USER_READ') ? api(`/api/users?roleId=${id}&limit=100`).catch(() => ({ items: [], total: 0 })) : Promise.resolve({ items: [], total: 0 })
    ]);

    const actions = [];
    if (has('ROLE_ASSIGN_PERMISSION')) actions.push(`<a class="primary" href="#/roles/${id}/permissions">Manage permissions</a>`);
    if (has('ROLE_UPDATE')) actions.push(`<a class="ghost" href="#/roles/${id}/edit">Edit role</a>`);
    if (has('ROLE_DELETE') && id !== 'ROLE_SUPER_ADMIN') actions.push(`<button class="danger" onclick="window.deleteRoleAction('${id}')">Delete role</button>`);

    portalFrame(
      'Role Details',
      'Review permissions, users, and status for this role.',
      `<section class="detail-grid">
         <article class="card">
           <h2>${esc(role.name)}</h2>
           <p>${esc(role.description)}</p>
           <dl class="definition-list">
             <div><dt>Role ID</dt><dd>${esc(role._id)}</dd></div>
             <div><dt>Status</dt><dd>${badge(role.isActive ? 'ACTIVE' : 'INACTIVE')}</dd></div>
             <div><dt>Assigned permissions</dt><dd>${role.permissionIds.length}</dd></div>
             <div><dt>Users in role</dt><dd>${users.total}</dd></div>
           </dl>
           <div class="form-actions">${actions.join('')}</div>
         </article>
         <aside class="card">
           <h2>Assigned permissions</h2>
           <div class="quick-list">
             ${role.permissionIds.length ? role.permissionIds.map((p) => `<span>${esc(p)}</span>`).join('') : '<p>No permissions assigned.</p>'}
           </div>
           ${has('USER_READ') ? `
             <div class="section-title"><h3>Users having this role</h3></div>
             <div class="quick-list">${users.items.length ? users.items.slice(0, 6).map((u) => `<a href="#/users/${u._id}">${esc(u.email)} <span>→</span></a>`).join('') : '<p>No users have this role.</p>'}</div>
           ` : ''}
         </aside>
       </section>`
    );
  } catch (error) {
    toast(error.message);
  }
}

async function rolePermissionsPage(id) {
  if (!has('ROLE_ASSIGN_PERMISSION')) { go('/roles'); return; }
  portalFrame('Assign Permissions to Role', 'Configure granular capabilities for this role.', `<div class="loading">Loading permissions…</div>`);
  try {
    const [role, permissions] = await Promise.all([api(`/api/roles/${id}`), api('/api/permissions')]);
    const groups = Object.groupBy(permissions, (p) => p.module);

    portalFrame(
      'Assign Permissions to Role',
      `Role: ${role.name} (${role._id})`,
      `<section class="card">
         <form id="role-permissions-form" class="form-grid">
           ${Object.entries(groups)
             .map(
               ([module, items]) => `
             <section class="permission-module">
               <h3>${esc(module)}</h3>
               <div class="permission-grid">
                 ${items
                   .map(
                     (p) => `
                   <label class="check-card">
                     <input type="checkbox" value="${esc(p._id)}" ${role.permissionIds.includes(p._id) ? 'checked' : ''} ${!p.isActive ? 'disabled' : ''}>
                     <span>
                       <strong>${esc(p.action)} · ${esc(p.name)}</strong>
                       <span><code>${esc(p._id)}</code><br>${esc(p.description)}</span>
                     </span>
                   </label>`
                   )
                   .join('')}
               </div>
             </section>`
             )
             .join('')}
           <p id="permission-notice" hidden></p>
           <div class="form-actions">
             <button class="primary" type="submit">Save permissions</button>
             <a class="ghost" href="#/roles/${id}">Cancel</a>
           </div>
         </form>
       </section>`
    );

    document.querySelector('#role-permissions-form').onsubmit = async (event) => {
      event.preventDefault();
      const permissionIds = [...document.querySelectorAll('#role-permissions-form input[type="checkbox"]:checked')].map((input) => input.value);
      try {
        await api(`/api/roles/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionIds }) });
        toast('Role permissions updated successfully.');
        go(`/roles/${id}`);
      } catch (error) {
        const n = document.querySelector('#permission-notice');
        n.className = 'notice error';
        n.textContent = error.message;
        n.hidden = false;
      }
    };
  } catch (error) {
    toast(error.message);
  }
}

// PERMISSION MANAGEMENT
async function permissionsPage() {
  if (!has('PERMISSION_READ')) { go('/dashboard'); return; }
  const createBtn = has('PERMISSION_CREATE') ? `<a class="primary" href="#/permissions/new">+ Create permission</a>` : '';
  portalFrame('Permission Management', 'Search and review all canonical permissions.', `<div id="permissions-content" class="loading">Loading permissions…</div>`, createBtn);

  try {
    const permissions = await api('/api/permissions');
    const render = () => {
      const q = document.querySelector('#permission-search').value.toLowerCase();
      const module = document.querySelector('#permission-module').value;
      const action = document.querySelector('#permission-action').value;
      const items = permissions.filter((p) => (!q || `${p.name} ${p._id} ${p.description}`.toLowerCase().includes(q)) && (!module || p.module === module) && (!action || p.action === action));

      document.querySelector('#permissions-table-body').innerHTML = items.length
        ? items
            .map((p) => {
              const actions = [];
              actions.push(actionLink('View', `/permissions/${p._id}`));
              if (has('PERMISSION_UPDATE')) actions.push(actionLink('Edit', `/permissions/${p._id}/edit`));
              if (has('PERMISSION_DELETE')) actions.push(`<button class="link-button" style="color:var(--red)" onclick="window.deletePermissionAction('${p._id}')">Delete</button>`);
              return `<tr>
                <td><b>${esc(p.name)}</b><br><span class="badge neutral">${esc(p._id)}</span></td>
                <td>${esc(p.module)}</td>
                <td>${badge(p.action)}</td>
                <td>${badge(p.isActive ? 'ACTIVE' : 'INACTIVE')}</td>
                <td class="actions">${actions.join('')}</td>
              </tr>`;
            })
            .join('')
        : '<tr><td colspan="5" class="empty">No permissions match these filters.</td></tr>';
    };

    document.querySelector('#permissions-content').outerHTML = `
      <section>
        <div class="filters">
          <input id="permission-search" placeholder="Search permissions by name, ID or description">
          <select id="permission-module"><option value="">All modules</option>${[...new Set(permissions.map((p) => p.module))].map((m) => `<option>${esc(m)}</option>`).join('')}</select>
          <select id="permission-action"><option value="">All actions</option>${['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'].map((a) => `<option>${a}</option>`).join('')}</select>
          <span></span>
        </div>
        <article class="card table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Permission</th><th>Module</th><th>Action</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody id="permissions-table-body"></tbody>
            </table>
          </div>
        </article>
      </section>`;

    ['#permission-search', '#permission-module', '#permission-action'].forEach((s) => {
      document.querySelector(s).oninput = render;
    });
    render();
  } catch (error) {
    toast(error.message);
  }
}

window.deletePermissionAction = (id) => {
  confirmAction({
    title: 'Delete Permission',
    message: `Are you sure you want to delete permission '${id}'? It will be removed from all roles.`,
    confirmLabel: 'Delete Permission',
    danger: true,
    onConfirm: async () => {
      try {
        await api(`/api/permissions/${id}`, { method: 'DELETE' });
        toast('Permission deleted.');
        permissionsPage();
      } catch (error) {
        toast(error.message);
      }
    }
  });
};

async function permissionFormPage(id) {
  const editing = Boolean(id);
  if (editing && !has('PERMISSION_UPDATE')) { go('/permissions'); return; }
  if (!editing && !has('PERMISSION_CREATE')) { go('/permissions'); return; }

  portalFrame(editing ? 'Edit Permission' : 'Create Permission', 'Configure canonical permission definitions.', `<div class="loading">Loading permission form…</div>`);
  try {
    const permission = editing ? await api(`/api/permissions/${id}`) : { _id: '', name: '', module: 'User Management', action: 'READ', description: '', isActive: true };
    portalFrame(
      editing ? 'Edit Permission' : 'Create Permission',
      'Configure canonical permission definitions.',
      `<section class="card" style="max-width:720px">
         <form id="permission-form" class="form-grid">
           <div class="field">
             <label for="permission-id">Permission ID (Canonical RESOURCE_ACTION format)</label>
             <input id="permission-id" value="${esc(permission._id)}" ${editing ? 'disabled' : ''} placeholder="e.g. USER_CREATE, ROLE_UPDATE" required>
           </div>
           <div class="field">
             <label for="permission-name">Permission name</label>
             <input id="permission-name" value="${esc(permission.name)}" required>
           </div>
           <div class="field">
             <label for="permission-module-name">Module</label>
             <input id="permission-module-name" value="${esc(permission.module)}" required>
           </div>
           <div class="field">
             <label for="permission-action">Action</label>
             <select id="permission-action">${['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'].map((a) => `<option ${a === permission.action ? 'selected' : ''}>${a}</option>`).join('')}</select>
           </div>
           <div class="field">
             <label for="permission-description">Description</label>
             <textarea id="permission-description" required>${esc(permission.description)}</textarea>
           </div>
           ${has('PERMISSION_MANAGE_STATUS') ? `<label class="remember"><input id="permission-active" type="checkbox" ${permission.isActive ? 'checked' : ''}>Permission is active</label>` : ''}
           <p id="permission-form-notice" hidden></p>
           <div class="form-actions">
             <button class="primary" type="submit">${editing ? 'Save changes' : 'Create permission'}</button>
             <a class="ghost" href="#/permissions">Cancel</a>
           </div>
         </form>
       </section>`
    );

    document.querySelector('#permission-form').onsubmit = async (event) => {
      event.preventDefault();
      const body = {
        name: document.querySelector('#permission-name').value.trim(),
        module: document.querySelector('#permission-module-name').value.trim(),
        action: document.querySelector('#permission-action').value,
        description: document.querySelector('#permission-description').value.trim()
      };
      try {
        let saved;
        if (editing) {
          saved = await api(`/api/permissions/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          saved = await api('/api/permissions', { method: 'POST', body: JSON.stringify({ ...body, id: document.querySelector('#permission-id').value.trim() }) });
        }
        const activeCheck = document.querySelector('#permission-active');
        if (activeCheck && saved.isActive !== activeCheck.checked) {
          await api(`/api/permissions/${saved._id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: activeCheck.checked }) });
        }
        toast('Permission saved.');
        go(`/permissions/${saved._id}`);
      } catch (error) {
        const n = document.querySelector('#permission-form-notice');
        n.className = 'notice error';
        n.textContent = error.message;
        n.hidden = false;
      }
    };
  } catch (error) {
    toast(error.message);
  }
}

async function permissionDetailsPage(id) {
  if (!has('PERMISSION_READ')) { go('/dashboard'); return; }
  portalFrame('Permission Details', 'Review role assignments for this permission.', `<div class="loading">Loading permission…</div>`);
  try {
    const [permission, roles] = await Promise.all([
      api(`/api/permissions/${id}`),
      has('ROLE_READ') ? api('/api/roles').catch(() => []) : Promise.resolve([])
    ]);
    const using = roles.filter((role) => role.permissionIds.includes(id));

    portalFrame(
      'Permission Details',
      'Review where this permission is used.',
      `<section class="detail-grid">
         <article class="card">
           <h2>${esc(permission.name)}</h2>
           <p>${esc(permission.description)}</p>
           <dl class="definition-list">
             <div><dt>Permission ID</dt><dd><code>${esc(permission._id)}</code></dd></div>
             <div><dt>Module</dt><dd>${esc(permission.module)}</dd></div>
             <div><dt>Action</dt><dd>${badge(permission.action)}</dd></div>
             <div><dt>Status</dt><dd>${badge(permission.isActive ? 'ACTIVE' : 'INACTIVE')}</dd></div>
           </dl>
           <div class="form-actions">
             ${has('PERMISSION_UPDATE') ? `<a class="primary" href="#/permissions/${id}/edit">Edit permission</a>` : ''}
             ${has('PERMISSION_DELETE') ? `<button class="danger" onclick="window.deletePermissionAction('${id}')">Delete permission</button>` : ''}
           </div>
         </article>
         <aside class="card">
           <h2>Roles using this permission</h2>
           <div class="quick-list">${using.length ? using.map((role) => `<a href="#/roles/${role._id}">${esc(role.name)} <span>→</span></a>`).join('') : '<p>No roles currently use this permission.</p>'}</div>
         </aside>
       </section>`
    );
  } catch (error) {
    toast(error.message);
  }
}

// SESSION AUDIT
async function sessionsPage() {
  if (!has('SESSION_READ')) { go('/dashboard'); return; }
  portalFrame('Login & Session Activity', 'Review authentication logs and session activity.', `
    <section>
      <form id="session-filters" class="filters">
        <select id="session-type"><option value="">All user types</option><option>STUDENT</option><option>COMPANY</option><option>PLACEMENT</option></select>
        <select id="session-status"><option value="">All session states</option><option>ACTIVE</option><option>EXPIRED</option><option>LOGGED_OUT</option></select>
        <input id="session-from" type="date" aria-label="Login date from">
        <button class="secondary" type="submit">Apply filters</button>
      </form>
      <div id="sessions-content" class="loading">Loading activity…</div>
    </section>`);

  const load = async () => {
    const q = new URLSearchParams({ limit: '100' });
    if (document.querySelector('#session-type').value) q.set('userType', document.querySelector('#session-type').value);
    if (document.querySelector('#session-status').value) q.set('status', document.querySelector('#session-status').value);
    if (document.querySelector('#session-from').value) q.set('dateFrom', document.querySelector('#session-from').value);
    try {
      const result = await api(`/api/sessions?${q}`);
      document.querySelector('#sessions-content').innerHTML = `
        <article class="card table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>User</th><th>Login time</th><th>Last activity</th><th>Logout</th><th>IP / device</th><th>Status</th></tr></thead>
              <tbody>
                ${result.items.length ? result.items.map((s) => `<tr>
                    <td>${s.user ? `<a class="text-link" href="#/users/${s.user._id}">${esc(s.user.email)}</a><br><span class="badge neutral">${esc(s.user.userType)}</span>` : 'Deleted user'}</td>
                    <td>${formatDate(s.loginAt)}</td>
                    <td>${formatDate(s.lastActivityAt)}</td>
                    <td>${formatDate(s.logoutAt)}</td>
                    <td>${esc(s.ipAddress || '—')}<br><small>${esc(s.userAgent || '—')}</small></td>
                    <td>${badge(s.status)}</td>
                  </tr>`).join('') : '<tr><td colspan="6" class="empty">No session activity matches the filters.</td></tr>'}
              </tbody>
            </table>
          </div>
        </article>`;
    } catch (error) {
      document.querySelector('#sessions-content').innerHTML = `<p class="notice error">${esc(error.message)}</p>`;
    }
  };

  document.querySelector('#session-filters').onsubmit = (event) => {
    event.preventDefault();
    load();
  };
  load();
}

// EXCEL DATA IMPORT
async function excelImportPage(type) {
  const permMap = {
    student: 'STUDENT_IMPORT',
    company: 'COMPANY_IMPORT',
    placement: 'PLACEMENT_USER_IMPORT'
  };
  const requiredPerm = permMap[type];
  if (!has(requiredPerm)) {
    go('/dashboard');
    return;
  }

  const titles = {
    student: 'Import Students',
    company: 'Import Companies',
    placement: 'Import Placement Cell'
  };
  const subtitles = {
    student: 'Upload Excel/CSV file to validate and import student records directly into the portal database.',
    company: 'Upload Excel/CSV file to validate and import partner companies and recruiters.',
    placement: 'Upload Excel/CSV file to create Placement Head and Coordinator staff accounts.'
  };

  portalFrame(
    titles[type],
    subtitles[type],
    `<section class="card" style="max-width:960px">
       <div id="import-step-container">
         <div class="row-between" style="margin-bottom:20px;">
           <p>Supported file formats: <b>.xlsx, .xls, .csv</b></p>
           <a class="secondary" href="/api/imports/templates/${type}" download="${type}_template.xlsx">Download Excel Template ⤓</a>
         </div>

         <div class="upload-dropzone" id="dropzone">
           <div class="upload-icon">📄</div>
           <h3>Choose an Excel or CSV file</h3>
           <p>Drag and drop your file here, or click to browse</p>
           <input type="file" id="file-input" accept=".xlsx, .xls, .csv" style="display:none">
           <button class="primary" id="btn-browse" type="button" style="margin-top:12px;">Select File</button>
         </div>
         <p id="import-upload-notice" hidden></p>
         <div id="import-preview-area" style="margin-top:24px;" hidden></div>
       </div>
     </section>`
  );

  const fileInput = document.querySelector('#file-input');
  const dropzone = document.querySelector('#dropzone');
  const btnBrowse = document.querySelector('#btn-browse');
  const notice = document.querySelector('#import-upload-notice');
  const previewArea = document.querySelector('#import-preview-area');

  btnBrowse.onclick = () => fileInput.click();
  dropzone.onclick = (e) => { if (e.target !== btnBrowse) fileInput.click(); };

  dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--teal)'; };
  dropzone.ondragleave = () => { dropzone.style.borderColor = '#b8cddf'; };
  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#b8cddf';
    if (e.dataTransfer.files.length) handleFileSelected(e.dataTransfer.files[0]);
  };

  fileInput.onchange = () => {
    if (fileInput.files.length) handleFileSelected(fileInput.files[0]);
  };

  async function handleFileSelected(file) {
    notice.className = 'notice warn';
    notice.textContent = `Validating ${file.name}… Please wait.`;
    notice.hidden = false;
    previewArea.hidden = true;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const data = await api(`/api/imports/validate/${type}`, { method: 'POST', body: formData });
      state.importData = { type, file, data };
      renderPreview(data);
      notice.hidden = true;
    } catch (error) {
      notice.className = 'notice error';
      notice.textContent = error.message;
      notice.hidden = false;
    }
  }

  function renderPreview(data) {
    previewArea.hidden = false;
    previewArea.innerHTML = `
      <div class="stat-pill-row">
        <div class="stat-pill"><span>Total Rows</span><strong>${data.totalRows}</strong></div>
        <div class="stat-pill valid"><span>Valid Rows</span><strong>${data.validCount}</strong></div>
        <div class="stat-pill invalid"><span>Invalid Rows</span><strong>${data.invalidCount}</strong></div>
        <div class="stat-pill duplicate"><span>Duplicate Rows</span><strong>${data.duplicateCount}</strong></div>
      </div>

      <div class="notice warn" style="margin-bottom:16px;">
        <strong>Important:</strong> Only valid records will be imported into MongoDB. Invalid and duplicate rows will be skipped.
      </div>

      <article class="card table-card" style="margin-bottom:20px;">
        <div class="table-wrap" style="max-height:360px;">
          <table class="data-table">
            <thead>
              <tr><th>Row #</th><th>Primary ID</th><th>Email / Name</th><th>Status</th><th>Validation Notes / Errors</th></tr>
            </thead>
            <tbody>
              ${data.preview
                .map((row) => {
                  const id = row.data.universityId || row.data.employeeId || row.data.companyName || '—';
                  const title = row.data.email || `${row.data.firstName || ''} ${row.data.lastName || ''}`.trim() || '—';
                  const errors = row.errors.length ? `<ul class="error-list">${row.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '<span style="color:var(--green)">Ready to import</span>';
                  return `<tr>
                    <td><b>${row.rowNumber}</b></td>
                    <td>${esc(id)}</td>
                    <td>${esc(title)}</td>
                    <td>${badge(row.status)}</td>
                    <td>${errors}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </article>

      <div class="form-actions" style="justify-content:space-between; align-items:center;">
        <span>${data.validCount} valid record(s) eligible for import</span>
        <div style="display:flex; gap:10px;">
          <button class="ghost" id="btn-cancel-import" type="button">Cancel</button>
          <button class="primary" id="btn-confirm-import" type="button" ${data.validCount === 0 ? 'disabled' : ''}>Confirm Import (${data.validCount})</button>
        </div>
      </div>
    `;

    document.querySelector('#btn-cancel-import').onclick = () => excelImportPage(type);
    document.querySelector('#btn-confirm-import').onclick = () => {
      confirmAction({
        title: 'Confirm Database Import',
        message: `Are you sure you want to import ${data.validCount} valid record(s) into the database?`,
        confirmLabel: 'Proceed with Import',
        onConfirm: executeImport
      });
    };
  }

  async function executeImport() {
    const formData = new FormData();
    formData.append('file', state.importData.file);

    previewArea.innerHTML = `<div class="loading">Importing records into MongoDB…</div>`;
    try {
      const result = await api(`/api/imports/confirm/${type}`, { method: 'POST', body: formData });
      previewArea.innerHTML = `
        <div class="center" style="padding:24px 0;">
          <div class="success-icon">✓</div>
          <h2>Import Completed</h2>
          <p class="subcopy">Records have been saved to the MongoDB database and are now live in the recruitment portal.</p>
          <div class="stat-pill-row" style="max-width:500px; margin:20px auto;">
            <div class="stat-pill valid"><span>Imported</span><strong>${result.importedCount}</strong></div>
            <div class="stat-pill duplicate"><span>Skipped</span><strong>${result.skippedCount}</strong></div>
          </div>
          <div class="form-actions" style="justify-content:center; margin-top:20px;">
            <button class="primary" id="btn-import-more" type="button">Import Another File</button>
            <a class="ghost" href="#/${type === 'student' ? 'dashboard' : type === 'company' ? 'dashboard' : 'users'}">Go to Management</a>
          </div>
        </div>`;
      document.querySelector('#btn-import-more').onclick = () => excelImportPage(type);
    } catch (error) {
      previewArea.innerHTML = `<p class="notice error">${esc(error.message)}</p><button class="secondary" onclick="window.location.reload()">Try Again</button>`;
    }
  }
}

// ROUTER
async function render() {
  const current = path();
  const publicRoutes = ['/login', '/forgot-password', '/verify-reset', '/reset-password', '/reset-success'];

  if (!publicRoutes.includes(current) && !getToken()) {
    go('/login');
    return;
  }

  if (getToken() && !state.me) {
    app.innerHTML = '<div class="loading">Loading your secure workspace…</div>';
    try {
      state.me = await api('/api/auth/me');
    } catch {
      return;
    }
  }

  if (current === '/login') return publicLogin();
  if (current === '/forgot-password') return forgotPassword();
  if (current === '/verify-reset') return verificationPage();
  if (current === '/reset-password') return resetPasswordPage();
  if (current === '/reset-success') return resetSuccessPage();
  if (current === '/dashboard') return dashboard();
  if (current === '/profile') return profilePage();
  if (current === '/change-password') return changePasswordPage();
  if (current === '/first-login-password') return changePasswordPage(true);

  // Excel Import routes
  if (current === '/import/student') return excelImportPage('student');
  if (current === '/import/company') return excelImportPage('company');
  if (current === '/import/placement') return excelImportPage('placement');

  const parts = current.split('/').filter(Boolean);

  // Users routes
  if (parts[0] === 'users' && parts.length === 1) return usersPage();
  if (parts[0] === 'users' && parts[2] === 'role') return userRolePage(parts[1]);
  if (parts[0] === 'users' && parts[1]) return userDetailsPage(parts[1]);

  // Roles routes
  if (parts[0] === 'roles' && parts[1] === 'new') return roleFormPage();
  if (parts[0] === 'roles' && parts[2] === 'edit') return roleFormPage(parts[1]);
  if (parts[0] === 'roles' && parts[2] === 'permissions') return rolePermissionsPage(parts[1]);
  if (parts[0] === 'roles' && parts[1]) return roleDetailsPage(parts[1]);
  if (parts[0] === 'roles') return rolesPage();

  // Permissions routes
  if (parts[0] === 'permissions' && parts[1] === 'new') return permissionFormPage();
  if (parts[0] === 'permissions' && parts[2] === 'edit') return permissionFormPage(parts[1]);
  if (parts[0] === 'permissions' && parts[1]) return permissionDetailsPage(parts[1]);
  if (parts[0] === 'permissions') return permissionsPage();

  // Sessions routes
  if (parts[0] === 'sessions') return sessionsPage();

  go('/dashboard');
}

window.addEventListener('hashchange', render);
render();
