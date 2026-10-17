import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { workshopService } from '../../services/workshop.service.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '../common/Icons.jsx';

export function AttendanceSheetModal({
  isOpen,
  workshop,
  session,
  onClose,
  onSaved,
  toast
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState([]);
  const [records, setRecords] = useState({}); // studentId -> { attendanceStatus, remarks }
  const [hasExistingRecords, setHasExistingRecords] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Check if caller is assigned trainer
  const isTrainerAssigned = !session?.trainerIds?.length || 
    session?.trainerIds?.some(tId => String(tId) === String(user?.userId) || String(tId) === String(user?._id));

  useEffect(() => {
    if (isOpen && workshop?._id && session?.sessionId) {
      setLoading(true);
      setErrorMessage('');
      setCorrectionReason('');

      Promise.all([
        workshopService.getRoster(workshop._id, { limit: 200, status: 'REGISTERED' }),
        workshopService.getSessionAttendance(workshop._id, session.sessionId, { limit: 200 })
      ])
        .then(([rosterRes, attRes]) => {
          const registeredStudents = rosterRes.roster || [];
          const existingAtt = attRes.attendance || [];
          
          setRoster(registeredStudents);
          setHasExistingRecords(existingAtt.length > 0);

          const recordMap = {};
          // Pre-populate with existing attendance
          existingAtt.forEach(rec => {
            const sId = typeof rec.studentId === 'object' ? rec.studentId._id : rec.studentId;
            recordMap[String(sId)] = {
              attendanceStatus: rec.attendanceStatus || 'PRESENT',
              remarks: rec.remarks || ''
            };
          });

          // Default missing students to PRESENT for easy batch marking
          registeredStudents.forEach(reg => {
            const sId = typeof reg.studentId === 'object' ? reg.studentId._id : reg.studentId;
            if (!recordMap[String(sId)]) {
              recordMap[String(sId)] = {
                attendanceStatus: 'PRESENT',
                remarks: ''
              };
            }
          });

          setRecords(recordMap);
        })
        .catch(err => {
          setErrorMessage(err.message || 'Failed to load session attendance records.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, workshop, session]);

  const handleStatusChange = (studentId, status) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        attendanceStatus: status
      }
    }));
  };

  const handleRemarksChange = (studentId, remarks) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        remarks
      }
    }));
  };

  const handleMarkAll = (status) => {
    setRecords(prev => {
      const updated = { ...prev };
      roster.forEach(reg => {
        const sId = typeof reg.studentId === 'object' ? reg.studentId._id : reg.studentId;
        updated[String(sId)] = {
          ...(updated[String(sId)] || {}),
          attendanceStatus: status
        };
      });
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (hasExistingRecords && (!correctionReason.trim() || correctionReason.trim().length < 5)) {
      setErrorMessage('A mandatory correction reason of at least 5 characters is required to update existing attendance records.');
      return;
    }

    const attendees = [];
    roster.forEach(reg => {
      const sId = typeof reg.studentId === 'object' ? reg.studentId._id : reg.studentId;
      const rec = records[String(sId)];
      if (rec) {
        attendees.push({
          registrationId: reg._id,
          studentId: sId,
          attendanceStatus: rec.attendanceStatus,
          remarks: rec.remarks?.trim() || undefined
        });
      }
    });

    if (attendees.length === 0) {
      setErrorMessage('No student attendance records to submit.');
      return;
    }

    setSaving(true);
    try {
      await workshopService.submitSessionAttendance(workshop._id, session.sessionId, {
        attendees,
        correctionReason: hasExistingRecords ? correctionReason.trim() : undefined
      });
      toast?.('Session attendance recorded successfully.');
      onSaved?.();
      onClose();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit session attendance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Mark Attendance — ${session?.title || session?.sessionId || 'Session'}`}
      maxWidth="840px"
    >
      <div style={{ marginTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Workshop: <strong>{workshop?.title}</strong> ({workshop?.workshopId})
            </span>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
              Session: <strong>{session?.sessionId}</strong> | Attendance Requirement: {session?.isAttendanceRequired !== false ? 'Mandatory (75%)' : 'Optional'}
            </div>
          </div>
          
          <div className="button-group">
            <button className="secondary" type="button" onClick={() => handleMarkAll('PRESENT')} style={{ padding: '5px 10px', fontSize: '0.78rem' }}>
              Mark All Present
            </button>
            <button className="ghost" type="button" onClick={() => handleMarkAll('ABSENT')} style={{ padding: '5px 10px', fontSize: '0.78rem' }}>
              Mark All Absent
            </button>
          </div>
        </div>

        {hasExistingRecords && (
          <div className="notice warn" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
            <strong>Notice:</strong> Attendance for this session has already been recorded. Any modifications constitute an auditable correction and require a detailed reason.
          </div>
        )}

        {errorMessage && (
          <div className="notice error" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="loading" style={{ padding: '40px' }}>Loading session roster…</div>
        ) : roster.length === 0 ? (
          <div className="empty" style={{ padding: '30px', textAlign: 'center' }}>
            No registered students found for this workshop.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="table-wrap" style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Student Info</th>
                    <th>Roll / University ID</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map(reg => {
                    const student = reg.studentId || {};
                    const sId = String(student._id || reg.studentId);
                    const currentRec = records[sId] || { attendanceStatus: 'PRESENT', remarks: '' };

                    return (
                      <tr key={reg._id}>
                        <td>
                          <strong>{student.firstName} {student.lastName}</strong>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>
                            {student.department} {student.semester ? `(Sem ${student.semester})` : ''}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-info">{student.universityId || 'N/A'}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {[
                              { val: 'PRESENT', label: 'P', color: 'var(--green)', bg: '#dcfce7' },
                              { val: 'ABSENT', label: 'A', color: 'var(--red)', bg: '#fee2e2' },
                              { val: 'EXCUSED', label: 'E', color: 'var(--amber)', bg: '#fef3c7' }
                            ].map(btn => (
                              <button
                                key={btn.val}
                                type="button"
                                onClick={() => handleStatusChange(sId, btn.val)}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  padding: 0,
                                  borderRadius: '6px',
                                  border: currentRec.attendanceStatus === btn.val ? `2px solid ${btn.color}` : '1px solid var(--line)',
                                  background: currentRec.attendanceStatus === btn.val ? btn.bg : '#ffffff',
                                  color: currentRec.attendanceStatus === btn.val ? btn.color : 'var(--muted)',
                                  fontWeight: 800,
                                  fontSize: '0.8rem',
                                  cursor: 'pointer'
                                }}
                                title={btn.val}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="Optional remark"
                            value={currentRec.remarks || ''}
                            onChange={(e) => handleRemarksChange(sId, e.target.value)}
                            style={{ height: '32px', fontSize: '0.82rem', padding: '4px 8px' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasExistingRecords && (
              <div className="field" style={{ marginTop: '16px' }}>
                <label htmlFor="corr-reason">
                  Correction Reason <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  id="corr-reason"
                  type="text"
                  placeholder="Explain why existing records were corrected (min 5 characters)..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                />
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="ghost" type="button" onClick={onClose} disabled={saving}>
                Close
              </button>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? 'Saving Attendance…' : 'Save Session Attendance'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
