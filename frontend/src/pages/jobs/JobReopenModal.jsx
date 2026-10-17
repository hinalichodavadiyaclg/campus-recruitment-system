import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { RefreshCwIcon } from '../../components/common/Icons.jsx';

export function JobReopenModal({
  isOpen,
  onClose,
  job,
  onConfirm
}) {
  const [newDeadline, setNewDeadline] = useState('');
  const [vacancies, setVacancies] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && job) {
      // Default future deadline (14 days from now)
      const future = new Date();
      future.setDate(future.getDate() + 14);
      future.setHours(23, 59, 0, 0);

      setNewDeadline(future.toISOString().slice(0, 16));
      setVacancies(job.vacancies || 1);
      setNote(`Reopened for Recruitment Round ${(job.recruitmentRound || 1) + 1}`);
      setError('');
    }
  }, [isOpen, job]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newDeadline) {
      setError('A valid future deadline date is required.');
      return;
    }
    const d = new Date(newDeadline);
    if (isNaN(d.getTime()) || d <= new Date()) {
      setError('Deadline must be a future date and time.');
      return;
    }

    try {
      setSaving(true);
      await onConfirm({
        newDeadline: d.toISOString(),
        vacancies: vacancies ? Number(vacancies) : undefined,
        note: note.trim() || undefined
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to reopen job.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !job) return null;

  const nextRound = (job.recruitmentRound || 1) + 1;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="480px">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--teal-pale)',
          color: 'var(--teal)'
        }}>
          <RefreshCwIcon size={20} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
            Reopen Job Posting
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            {job.jobId} &bull; Starting <b>Round {nextRound}</b>
          </span>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
        Reopening this closed job posting will create a new recruitment cycle (Round {nextRound}) and make it accessible to eligible students.
      </p>

      {error && <div className="notice error" style={{ marginBottom: '12px' }}>{error}</div>}

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="field">
          <label>
            New Application Deadline <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <input
            type="datetime-local"
            value={newDeadline}
            onChange={(e) => {
              setNewDeadline(e.target.value);
              setError('');
            }}
          />
        </div>

        <div className="field">
          <label>Vacancies for Round {nextRound}</label>
          <input
            type="number"
            min="1"
            value={vacancies}
            onChange={(e) => setVacancies(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Note / Reason for Reopening</label>
          <input
            type="text"
            placeholder="e.g. Additional vacancies opened or second drive round"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="modal-actions" style={{ marginTop: '16px' }}>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Reopening Job…' : `Reopen for Round ${nextRound}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
