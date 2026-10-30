import React, { useState, useRef } from 'react';
import { Modal } from '../common/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { workshopService } from '../../services/workshop.service.js';
import { UploadIcon } from '../common/Icons.jsx';

export function CompanyCertificateTemplateModal({ isOpen, onClose, onSaved }) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryTitle, setSignatoryTitle] = useState('');
  const [orientation, setOrientation] = useState('LANDSCAPE');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(selected.type)) {
      setError('Please upload a valid PNG or JPEG image file.');
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError('File size must not exceed 5MB.');
      return;
    }

    setError('');
    setFile(selected);
    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!file) {
      setError('Please select a certificate background image.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('background', file);
      formData.append('orientation', orientation);
      if (signatoryName.trim()) formData.append('signatoryName', signatoryName.trim());
      if (signatoryTitle.trim()) formData.append('signatoryTitle', signatoryTitle.trim());

      await workshopService.createTemplate(formData);
      toast('Certificate template uploaded successfully.');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to upload certificate template.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Certificate Template" maxWidth="580px">
      <form onSubmit={handleSubmit} style={{ marginTop: '12px' }}>
        {error && (
          <div className="notice error" style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="tpl-name">
              Template Name <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              id="tpl-name"
              type="text"
              placeholder="e.g. Global Tech Certification Design"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div className="field">
              <label htmlFor="tpl-signatory-name">Signatory Name</label>
              <input
                id="tpl-signatory-name"
                type="text"
                placeholder="e.g. Dr. Rajesh Mehta"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="field">
              <label htmlFor="tpl-signatory-title">Signatory Title</label>
              <input
                id="tpl-signatory-title"
                type="text"
                placeholder="e.g. VP & Head of Engineering"
                value={signatoryTitle}
                onChange={(e) => setSignatoryTitle(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="tpl-orientation">Orientation</label>
            <select
              id="tpl-orientation"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
            >
              <option value="LANDSCAPE">Landscape (A4 297 × 210 mm)</option>
              <option value="PORTRAIT">Portrait (A4 210 × 297 mm)</option>
            </select>
          </div>

          <div className="field">
            <label>
              Certificate Background Image <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #cbd7e3',
                borderRadius: '8px',
                padding: '22px 16px',
                textAlign: 'center',
                background: file ? '#f0fdf4' : '#f8fafc',
                borderColor: file ? 'var(--teal)' : '#cbd7e3',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease, background 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--teal)';
                e.currentTarget.style.background = '#f0fdfa';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = file ? 'var(--teal)' : '#cbd7e3';
                e.currentTarget.style.background = file ? '#f0fdf4' : '#f8fafc';
              }}
            >
              <UploadIcon size={24} style={{ color: 'var(--teal)', margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink)' }}>
                {file ? file.name : 'Click to select certificate image'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px' }}>
                {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB • Click to replace` : 'PNG or JPEG up to 5MB'}
              </div>
            </div>
          </div>

          {previewUrl && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '8px', fontWeight: 600 }}>
                Design Preview
              </div>
              <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', display: 'inline-block', maxWidth: '100%' }}>
                <img
                  src={previewUrl}
                  alt="Template Preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '180px',
                    borderRadius: '4px',
                    objectFit: 'contain',
                    display: 'block',
                    margin: '0 auto'
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={loading || !name.trim() || !file}>
            {loading ? 'Uploading…' : 'Save Template'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
