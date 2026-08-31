const sessionStorageKey = 'campusRecruitSessionToken';
const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginButton = document.querySelector('#login-button');
const loginError = document.querySelector('#login-error');
const rolesList = document.querySelector('#roles-list');
const rolesMessage = document.querySelector('#roles-message');
const permissionManager = document.querySelector('#permission-manager');
const roleSelect = document.querySelector('#role-select');
const permissionChecklist = document.querySelector('#permission-checklist');
const permissionMessage = document.querySelector('#permission-message');
let availableRoles = [];
let availablePermissions = [];

function token() {
  return sessionStorage.getItem(sessionStorageKey);
}

function showLogin(message = '') {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginError.hidden = !message;
  loginError.textContent = message;
}

function showDashboard(data) {
  loginView.hidden = true;
  dashboardView.hidden = false;
  document.querySelector('#welcome-title').textContent = `Welcome, ${data.user.email}`;
  document.querySelector('#account-email').textContent = data.user.email;
  document.querySelector('#account-type').textContent = data.user.userType;
  document.querySelector('#account-role').textContent = data.role.name;
  document.querySelector('#account-status').textContent = data.user.accountStatus;
}

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new Error(body?.error?.message || 'The request could not be completed.');
  }
  return body.data;
}

async function loadCurrentUser() {
  try {
    showDashboard(await requestApi('/api/auth/me'));
  } catch {
    sessionStorage.removeItem(sessionStorageKey);
    showLogin('Your session has expired. Please sign in again.');
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginButton.disabled = true;
  loginButton.textContent = 'Signing in…';
  try {
    const data = await requestApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.querySelector('#email').value.trim(),
        password: document.querySelector('#password').value
      })
    });
    sessionStorage.setItem(sessionStorageKey, data.sessionToken);
    loginForm.reset();
    await loadCurrentUser();
  } catch (error) {
    showLogin(error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await requestApi('/api/auth/logout', { method: 'POST' });
  } catch {
    // The local credential is removed even if an already-expired server session cannot be logged out.
  }
  sessionStorage.removeItem(sessionStorageKey);
  rolesList.replaceChildren();
  permissionManager.hidden = true;
  rolesMessage.hidden = true;
  showLogin();
});

function showRoles(roles) {
  rolesList.replaceChildren();
  for (const role of roles) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    const detail = document.createElement('span');
    title.textContent = role.name;
    detail.textContent = `${role._id} · ${role.permissionIds.length} permission(s)`;
    item.append(title, detail);
    rolesList.append(item);
  }
}

async function loadRoles() {
  rolesMessage.hidden = true;
  try {
    availableRoles = await requestApi('/api/roles');
    showRoles(availableRoles);
    return true;
  } catch (error) {
    rolesMessage.textContent = error.message;
    rolesMessage.className = 'message error';
    rolesMessage.hidden = false;
    return false;
  }
}

function renderPermissionChecklist() {
  const selectedRole = availableRoles.find((role) => role._id === roleSelect.value);
  permissionChecklist.replaceChildren();
  if (!selectedRole) return;
  for (const permission of availablePermissions) {
    const label = document.createElement('label');
    label.className = 'permission-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'permissionId';
    checkbox.value = permission._id;
    checkbox.checked = selectedRole.permissionIds.includes(permission._id);
    checkbox.disabled = !permission.isActive;
    const text = document.createElement('span');
    const title = document.createElement('strong');
    const detail = document.createElement('span');
    title.textContent = permission.name;
    detail.textContent = `${permission._id} · ${permission.module}${permission.isActive ? '' : ' · inactive'}`;
    text.append(title, detail);
    label.append(checkbox, text);
    permissionChecklist.append(label);
  }
}

document.querySelector('#load-roles-button').addEventListener('click', loadRoles);

document.querySelector('#manage-permissions-button').addEventListener('click', async () => {
  permissionMessage.hidden = true;
  const loaded = await loadRoles();
  if (!loaded) return;
  try {
    availablePermissions = await requestApi('/api/permissions');
    roleSelect.replaceChildren();
    for (const role of availableRoles) {
      const option = document.createElement('option');
      option.value = role._id;
      option.textContent = `${role.name} (${role._id})`;
      roleSelect.append(option);
    }
    permissionManager.hidden = false;
    renderPermissionChecklist();
  } catch (error) {
    rolesMessage.textContent = error.message;
    rolesMessage.className = 'message error';
    rolesMessage.hidden = false;
  }
});

roleSelect.addEventListener('change', renderPermissionChecklist);

permissionManager.addEventListener('submit', async (event) => {
  event.preventDefault();
  permissionMessage.hidden = true;
  const selectedRole = availableRoles.find((role) => role._id === roleSelect.value);
  const permissionIds = [...permissionChecklist.querySelectorAll('input:checked')].map((input) => input.value);
  try {
    const updatedRole = await requestApi(`/api/roles/${roleSelect.value}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: selectedRole.name,
        description: selectedRole.description,
        permissionIds
      })
    });
    availableRoles = availableRoles.map((role) => (role._id === updatedRole._id ? updatedRole : role));
    showRoles(availableRoles);
    renderPermissionChecklist();
    permissionMessage.textContent = `Permissions saved for ${updatedRole.name}.`;
    permissionMessage.className = 'message';
    permissionMessage.hidden = false;
  } catch (error) {
    permissionMessage.textContent = error.message;
    permissionMessage.className = 'message error';
    permissionMessage.hidden = false;
  }
});

if (token()) loadCurrentUser();
