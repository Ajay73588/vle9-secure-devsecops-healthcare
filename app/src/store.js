class HealthcareStore {
  constructor() {
    this.nextPatientNum = 1007;
    this.nextAppointmentNum = 5007;

    this.patients = [
      {
        id: 'SC-1001',
        fullName: 'Aarav Sharma (Synthetic)',
        age: 34,
        gender: 'Male',
        bloodGroup: 'O+',
        department: 'Cardiology',
        maskedContact: 'XXXX-XX-4102',
        summaryNote: 'Synthetic demo record: routine ECG wellness screening',
        synthetic: true,
        updatedAt: '2026-11-10T09:15:00Z',
      },
      {
        id: 'SC-1002',
        fullName: 'Priya Nair (Synthetic)',
        age: 29,
        gender: 'Female',
        bloodGroup: 'A+',
        department: 'General Medicine',
        maskedContact: 'XXXX-XX-8831',
        summaryNote: 'Synthetic demo record: annual preventive checkup',
        synthetic: true,
        updatedAt: '2026-11-10T10:30:00Z',
      },
      {
        id: 'SC-1003',
        fullName: 'Vikram Menon (Synthetic)',
        age: 52,
        gender: 'Male',
        bloodGroup: 'B+',
        department: 'Orthopedics',
        maskedContact: 'XXXX-XX-2294',
        summaryNote: 'Synthetic demo record: physiotherapy progress follow-up',
        synthetic: true,
        updatedAt: '2026-11-10T11:45:00Z',
      },
      {
        id: 'SC-1004',
        fullName: 'Ananya Iyer (Synthetic)',
        age: 41,
        gender: 'Female',
        bloodGroup: 'AB+',
        department: 'Neurology',
        maskedContact: 'XXXX-XX-5510',
        summaryNote: 'Synthetic demo record: outpatient consultation review',
        synthetic: true,
        updatedAt: '2026-11-10T13:20:00Z',
      },
      {
        id: 'SC-1005',
        fullName: 'Kabir Verma (Synthetic)',
        age: 8,
        gender: 'Male',
        bloodGroup: 'O-',
        department: 'Pediatrics',
        maskedContact: 'XXXX-XX-7745',
        summaryNote: 'Synthetic demo record: immunization schedule review',
        synthetic: true,
        updatedAt: '2026-11-10T14:10:00Z',
      },
      {
        id: 'SC-1006',
        fullName: 'Meera Kulkarni (Synthetic)',
        age: 47,
        gender: 'Female',
        bloodGroup: 'A-',
        department: 'Oncology',
        maskedContact: 'XXXX-XX-6093',
        summaryNote: 'Synthetic demo record: scheduled lab panel review',
        synthetic: true,
        updatedAt: '2026-11-10T15:50:00Z',
      },
    ];

    this.appointments = [
      {
        id: 'APT-5001',
        patientId: 'SC-1001',
        patientName: 'Aarav Sharma (Synthetic)',
        clinician: 'Dr. Kavita Sharma',
        department: 'Cardiology',
        scheduledDate: '2026-11-12T09:30',
        reason: 'Annual cardiac wellness check',
        status: 'Scheduled',
      },
      {
        id: 'APT-5002',
        patientId: 'SC-1002',
        patientName: 'Priya Nair (Synthetic)',
        clinician: 'Dr. Arjun Rao',
        department: 'General Medicine',
        scheduledDate: '2026-11-12T10:15',
        reason: 'Routine preventive consultation',
        status: 'Checked-In',
      },
      {
        id: 'APT-5003',
        patientId: 'SC-1003',
        patientName: 'Vikram Menon (Synthetic)',
        clinician: 'Dr. Sneha Joshi',
        department: 'Orthopedics',
        scheduledDate: '2026-11-12T11:00',
        reason: 'Post-rehab mobility assessment',
        status: 'Scheduled',
      },
      {
        id: 'APT-5004',
        patientId: 'SC-1004',
        patientName: 'Ananya Iyer (Synthetic)',
        clinician: 'Dr. Vivek Deshmukh',
        department: 'Neurology',
        scheduledDate: '2026-11-12T12:30',
        reason: 'Follow-up wellness evaluation',
        status: 'Completed',
      },
      {
        id: 'APT-5005',
        patientId: 'SC-1005',
        patientName: 'Kabir Verma (Synthetic)',
        clinician: 'Dr. Neha Kapoor',
        department: 'Pediatrics',
        scheduledDate: '2026-11-12T14:00',
        reason: 'Pediatric growth milestone check',
        status: 'Scheduled',
      },
      {
        id: 'APT-5006',
        patientId: 'SC-1006',
        patientName: 'Meera Kulkarni (Synthetic)',
        clinician: 'Dr. Kavita Sharma',
        department: 'Oncology',
        scheduledDate: '2026-11-12T15:30',
        reason: 'Routine diagnostic follow-up',
        status: 'Checked-In',
      },
    ];
  }

  listPatients(search = '') {
    const q = search.trim().toLowerCase();
    if (!q) {
      return [...this.patients];
    }
    return this.patients.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.fullName.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q)
    );
  }

  getPatientById(id) {
    return this.patients.find((p) => p.id === id) || null;
  }

  createPatient(input) {
    const id = `SC-${this.nextPatientNum++}`;
    const record = {
      id,
      ...input,
      synthetic: true,
      updatedAt: new Date().toISOString(),
    };
    this.patients.unshift(record);
    return record;
  }

  updatePatient(id, partial) {
    const idx = this.patients.findIndex((p) => p.id === id);
    if (idx === -1) {
      return null;
    }
    this.patients[idx] = {
      ...this.patients[idx],
      ...partial,
      id: this.patients[idx].id,
      synthetic: true,
      updatedAt: new Date().toISOString(),
    };
    return this.patients[idx];
  }

  deletePatient(id) {
    const idx = this.patients.findIndex((p) => p.id === id);
    if (idx === -1) {
      return false;
    }
    this.patients.splice(idx, 1);
    this.appointments = this.appointments.filter((a) => a.patientId !== id);
    return true;
  }

  listAppointments(statusFilter = '') {
    const s = statusFilter.trim();
    if (!s) {
      return [...this.appointments];
    }
    return this.appointments.filter((a) => a.status === s);
  }

  createAppointment(input) {
    const patient = this.getPatientById(input.patientId);
    if (!patient) {
      return null;
    }
    const id = `APT-${this.nextAppointmentNum++}`;
    const record = {
      id,
      patientId: patient.id,
      patientName: patient.fullName,
      clinician: input.clinician,
      department: input.department,
      scheduledDate: input.scheduledDate,
      reason: input.reason,
      status: 'Scheduled',
    };
    this.appointments.unshift(record);
    return record;
  }

  updateAppointmentStatus(id, status) {
    const appt = this.appointments.find((a) => a.id === id);
    if (!appt) {
      return null;
    }
    appt.status = status;
    return appt;
  }

  getSummary() {
    const byDepartment = {};
    for (const p of this.patients) {
      byDepartment[p.department] = (byDepartment[p.department] || 0) + 1;
    }
    const byStatus = { Scheduled: 0, 'Checked-In': 0, Completed: 0, Cancelled: 0 };
    for (const a of this.appointments) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    }
    return {
      totalPatients: this.patients.length,
      totalAppointments: this.appointments.length,
      activeDepartments: Object.keys(byDepartment).length,
      byDepartment,
      appointmentsByStatus: byStatus,
      dataClassification: '100% Synthetic Demo Data (Zero Real PHI)',
    };
  }
}

module.exports = { HealthcareStore };

