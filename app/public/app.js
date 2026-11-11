(function secureCareClient() {
  let currentUser = null;

  const loginSection = document.getElementById('loginSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const authStatusPill = document.getElementById('authStatusPill');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginForm = document.getElementById('loginForm');
  const loginFeedback = document.getElementById('loginFeedback');

  const kpiPatients = document.getElementById('kpiPatients');
  const kpiAppointments = document.getElementById('kpiAppointments');
  const kpiDepartments = document.getElementById('kpiDepartments');
  const kpiRole = document.getElementById('kpiRole');
  const kpiActorName = document.getElementById('kpiActorName');

  const patientsTableBody = document.getElementById('patientsTableBody');
  const appointmentsTableBody = document.getElementById('appointmentsTableBody');
  const patientSearchInput = document.getElementById('patientSearchInput');
  const apptStatusFilter = document.getElementById('apptStatusFilter');

  const toggleNewPatientBtn = document.getElementById('toggleNewPatientBtn');
  const cancelNewPatientBtn = document.getElementById('cancelNewPatientBtn');
  const newPatientForm = document.getElementById('newPatientForm');
  const patientFormFeedback = document.getElementById('patientFormFeedback');

  const toggleNewApptBtn = document.getElementById('toggleNewApptBtn');
  const cancelNewApptBtn = document.getElementById('cancelNewApptBtn');
  const newApptForm = document.getElementById('newApptForm');
  const apptFormFeedback = document.getElementById('apptFormFeedback');

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function makeCell(text) {
    const td = document.createElement('td');
    td.textContent = String(text ?? '');
    return td;
  }

  function setSignedInView(user) {
    currentUser = user;
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    authStatusPill.textContent = `${user.username} (${user.role.toUpperCase()})`;
    kpiRole.textContent = user.role.toUpperCase();
    kpiActorName.textContent = user.displayName;
    toggleNewPatientBtn.classList.toggle('hidden', user.role === 'nurse');
  }

  function setSignedOutView() {
    currentUser = null;
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    authStatusPill.textContent = 'Signed Out';
  }

  function renderPatients(patients) {
    patientsTableBody.replaceChildren();
    for (const p of patients) {
      const tr = document.createElement('tr');
      tr.appendChild(makeCell(p.id));
      tr.appendChild(makeCell(p.fullName));
      tr.appendChild(makeCell(`${p.age} / ${p.gender}`));
      tr.appendChild(makeCell(p.bloodGroup));
      tr.appendChild(makeCell(p.department));
      tr.appendChild(makeCell(p.maskedContact));
      tr.appendChild(makeCell(p.summaryNote));

      const actionTd = document.createElement('td');
      if (currentUser && currentUser.role === 'admin') {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          await apiFetch(`/api/patients/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
          await refreshAll();
        });
        actionTd.appendChild(delBtn);
      } else {
        actionTd.textContent = 'Read / View';
      }
      tr.appendChild(actionTd);
      patientsTableBody.appendChild(tr);
    }
  }

  function renderAppointments(appointments) {
    appointmentsTableBody.replaceChildren();
    const statuses = ['Scheduled', 'Checked-In', 'Completed', 'Cancelled'];
    for (const a of appointments) {
      const tr = document.createElement('tr');
      tr.appendChild(makeCell(a.id));
      tr.appendChild(makeCell(`${a.patientId} - ${a.patientName}`));
      tr.appendChild(makeCell(a.clinician));
      tr.appendChild(makeCell(a.department));
      tr.appendChild(makeCell(a.scheduledDate.replace('T', ' ')));
      tr.appendChild(makeCell(a.reason));

      const statusTd = document.createElement('td');
      const select = document.createElement('select');
      for (const st of statuses) {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (st === a.status) {
          opt.selected = true;
        }
        select.appendChild(opt);
      }
      select.addEventListener('change', async () => {
        await apiFetch(`/api/appointments/${encodeURIComponent(a.id)}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: select.value }),
        });
        await refreshSummary();
      });
      statusTd.appendChild(select);
      tr.appendChild(statusTd);
      appointmentsTableBody.appendChild(tr);
    }
  }

  async function refreshSummary() {
    const summary = await apiFetch('/api/dashboard/summary');
    kpiPatients.textContent = String(summary.totalPatients);
    kpiAppointments.textContent = String(summary.totalAppointments);
    kpiDepartments.textContent = String(summary.activeDepartments);
  }

  async function refreshPatients() {
    const q = encodeURIComponent(patientSearchInput.value.trim());
    const data = await apiFetch(`/api/patients?q=${q}`);
    renderPatients(data.patients);
  }

  async function refreshAppointments() {
    const st = encodeURIComponent(apptStatusFilter.value);
    const data = await apiFetch(`/api/appointments?status=${st}`);
    renderAppointments(data.appointments);
  }

  async function refreshAll() {
    await Promise.all([refreshSummary(), refreshPatients(), refreshAppointments()]);
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginFeedback.textContent = '';
    const username = document.getElementById('usernameInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      document.getElementById('passwordInput').value = '';
      setSignedInView(data.user);
      await refreshAll();
    } catch (err) {
      loginFeedback.textContent = err.message;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setSignedOutView();
  });

  patientSearchInput.addEventListener('input', () => {
    refreshPatients().catch(() => {});
  });

  apptStatusFilter.addEventListener('change', () => {
    refreshAppointments().catch(() => {});
  });

  toggleNewPatientBtn.addEventListener('click', () => {
    newPatientForm.classList.toggle('hidden');
  });
  cancelNewPatientBtn.addEventListener('click', () => {
    newPatientForm.classList.add('hidden');
    patientFormFeedback.textContent = '';
  });

  newPatientForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    patientFormFeedback.textContent = '';
    patientFormFeedback.classList.remove('feedback-ok');
    try {
      await apiFetch('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          fullName: document.getElementById('pFullName').value.trim(),
          age: Number(document.getElementById('pAge').value),
          gender: document.getElementById('pGender').value,
          bloodGroup: document.getElementById('pBloodGroup').value,
          department: document.getElementById('pDepartment').value,
          maskedContact: document.getElementById('pMaskedContact').value.trim(),
          summaryNote: document.getElementById('pSummaryNote').value.trim(),
        }),
      });
      newPatientForm.reset();
      newPatientForm.classList.add('hidden');
      await refreshAll();
    } catch (err) {
      patientFormFeedback.textContent = err.message;
    }
  });

  toggleNewApptBtn.addEventListener('click', () => {
    newApptForm.classList.toggle('hidden');
  });
  cancelNewApptBtn.addEventListener('click', () => {
    newApptForm.classList.add('hidden');
    apptFormFeedback.textContent = '';
  });

  newApptForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    apptFormFeedback.textContent = '';
    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: document.getElementById('aPatientId').value.trim(),
          clinician: document.getElementById('aClinician').value.trim(),
          department: document.getElementById('aDepartment').value,
          scheduledDate: document.getElementById('aScheduledDate').value,
          reason: document.getElementById('aReason').value.trim(),
        }),
      });
      newApptForm.classList.add('hidden');
      await refreshAll();
    } catch (err) {
      apptFormFeedback.textContent = err.message;
    }
  });

  // Restore active cookie session if already authenticated
  apiFetch('/api/auth/me')
    .then((data) => {
      setSignedInView(data.user);
      return refreshAll();
    })
    .catch(() => {
      setSignedOutView();
    });
})();

