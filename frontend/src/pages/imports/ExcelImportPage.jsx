import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { importService } from '../../services/import.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import {
  CheckIcon,
  GraduationCapIcon,
  BuildingIcon,
  UsersIcon,
  DownloadIcon,
  ChartIcon,
  SearchIcon,
  ArrowRightIcon,
  SlidersIcon,
  AlertTriangleIcon,
  KeyIcon,
  FolderIcon,
  InfoIcon,
  ClockIcon
} from '../../components/common/Icons.jsx';

export function ExcelImportPage({ type: initialType = 'student' }) {
  const { has } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [currentType, setCurrentType] = useState(initialType);
  const [selectedFile, setSelectedFile] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Import Mode Configuration
  const [createNew, setCreateNew] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);

  useEffect(() => {
    if (currentType === 'placement' && !has('PLACEMENT_USER_IMPORT')) {
      setCurrentType('student');
    }
  }, [currentType, has]);

  const type = currentType;

  const titles = {
    student: 'Import Students',
    company: 'Import Companies',
    placement: 'Import Placement Cell'
  };

  const defaultPwd =
    type === 'student'
      ? 'Student@123456'
      : type === 'company'
        ? 'Company@123456'
        : 'Placement@123456';

  const resetState = () => {
    setSelectedFile(null);
    setValidationData(null);
    setImportResult(null);
    setErrorNotice('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTypeChange = (newType) => {
    setCurrentType(newType);
    resetState();
  };

  const handleFile = async (file, overrideCreateNew = createNew, overrideUpdateExisting = updateExisting) => {
    if (!file) return;
    setSelectedFile(file);
    setValidationData(null);
    setImportResult(null);
    setErrorNotice('');
    setValidating(true);

    try {
      const data = await importService.validateImportFile(type, file, {
        createNew: overrideCreateNew,
        updateExisting: overrideUpdateExisting
      });
      setValidationData(data);
    } catch (err) {
      setErrorNotice(err.message || 'Validation failed.');
    } finally {
      setValidating(false);
    }
  };

  const revalidateWithModes = (newCreateNew, newUpdateExisting) => {
    setCreateNew(newCreateNew);
    setUpdateExisting(newUpdateExisting);
    if (selectedFile) {
      handleFile(selectedFile, newCreateNew, newUpdateExisting);
    }
  };

  const executeImport = async () => {
    setConfirmModalOpen(false);
    setImporting(true);
    try {
      const result = await importService.confirmImportFile(type, selectedFile, {
        createNew,
        updateExisting
      });
      setImportResult(result);
      toast('Excel import executed successfully.');
    } catch (err) {
      toast(err.message || 'Import failed.');
      setErrorNotice(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const [exporting, setExporting] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      await importService.downloadTemplate(type);
      toast(`Downloaded ${type} Excel template.`);
    } catch (err) {
      toast(err.message || 'Failed to download template.');
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      await importService.exportData(type, { filtered: false });
      toast(`Exported all ${type} records to Excel.`);
    } catch (err) {
      toast(err.message || 'Failed to export records.');
    } finally {
      setExporting(false);
    }
  };

  const filteredListPath = {
    student: '#/students/filtered',
    company: '#/companies/filtered',
    placement: '#/placement-officers/filtered'
  };

  const listPath = {
    student: '#/users?tab=students',
    company: '#/users?tab=company',
    placement: '#/users?tab=placement'
  }[type] || '#/users?tab=students';

  const sectionLabels = {
    student: 'Students',
    company: 'Companies',
    placement: 'Placement Cell'
  };

  const moduleSingular = {
    student: 'Student',
    company: 'Company',
    placement: 'Placement Officer'
  };

  const modulePlural = {
    student: 'Students',
    company: 'Companies',
    placement: 'Placement Officers'
  };

  return (
    <PortalLayout
      title={titles[type] || 'Import Data'}
      currentPath={`/import/${type}`}
      section={sectionLabels[type]}
      hideEyebrow={true}
    >
      <div id="import-step-container" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Module Selector (Top 3 Cards Grid) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            marginBottom: '20px'
          }}
        >
          {/* Students Module */}
          <div
            onClick={() => !validating && !importing && handleTypeChange('student')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px 20px',
              borderRadius: '12px',
              cursor: validating || importing ? 'not-allowed' : 'pointer',
              border: type === 'student' ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: type === 'student' ? '#eff6ff' : '#ffffff',
              boxShadow: type === 'student' ? '0 2px 8px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: type === 'student' ? '#dbeafe' : '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                flexShrink: 0
              }}
            >
              <GraduationCapIcon size={24} color={type === 'student' ? '#1e3a8a' : '#64748b'} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: type === 'student' ? '#1e3a8a' : '#0f172a' }}>
                Students Module
              </h4>
            </div>
          </div>

          {/* Companies Module */}
          <div
            onClick={() => !validating && !importing && handleTypeChange('company')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px 20px',
              borderRadius: '12px',
              cursor: validating || importing ? 'not-allowed' : 'pointer',
              border: type === 'company' ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: type === 'company' ? '#eff6ff' : '#ffffff',
              boxShadow: type === 'company' ? '0 2px 8px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: type === 'company' ? '#dbeafe' : '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                flexShrink: 0
              }}
            >
              <BuildingIcon size={24} color={type === 'company' ? '#1e3a8a' : '#64748b'} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: type === 'company' ? '#1e3a8a' : '#0f172a' }}>
                Companies Module
              </h4>
            </div>
          </div>

          {/* Placement Cell Module */}
          {has('PLACEMENT_USER_IMPORT') && (
            <div
              onClick={() => !validating && !importing && handleTypeChange('placement')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 20px',
                borderRadius: '12px',
                cursor: validating || importing ? 'not-allowed' : 'pointer',
                border: type === 'placement' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                background: type === 'placement' ? '#eff6ff' : '#ffffff',
                boxShadow: type === 'placement' ? '0 2px 8px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease'
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: type === 'placement' ? '#dbeafe' : '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0
                }}
              >
                <UsersIcon size={24} color={type === 'placement' ? '#1e3a8a' : '#64748b'} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: type === 'placement' ? '#1e3a8a' : '#0f172a' }}>
                  Placement Cell Module
                </h4>
              </div>
            </div>
          )}
        </div>

        {/* Step 1 & Step 2 Cards (Two Columns Grid) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '16px',
            marginBottom: '16px'
          }}
        >
          {/* Card 1: 1. Download Template (Recommended) */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '16px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  flexShrink: 0
                }}
              >
                📄
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                1. Download Template <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.88rem' }}>(Recommended)</span>
              </h3>
            </div>
            <button
              type="button"
              id="btn-download-template"
              onClick={handleDownloadTemplate}
              style={{
                width: '100%',
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1.5px solid #86efac',
                background: '#f0fdf4',
                color: '#15803d',
                fontWeight: 600,
                fontSize: '0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <DownloadIcon size={16} /> Download {moduleSingular[type]} Template (.xlsx)
            </button>
          </div>

          {/* Card 2: 2. Export Existing Data (Optional) */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '16px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#f3e8ff',
                  color: '#9333ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  flexShrink: 0
                }}
              >
                <ChartIcon size={22} color="#9333ea" />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                2. Export Existing Data <span style={{ color: '#64748b', fontWeight: 500, fontSize: '0.88rem' }}>(Optional)</span>
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                id="btn-export-all"
                disabled={exporting}
                onClick={handleExportAll}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #d8b4fe',
                  background: '#faf5ff',
                  color: '#7e22ce',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {exporting ? (
                  <>
                    <ClockIcon size={14} /> Exporting...
                  </>
                ) : (
                  <>
                    <DownloadIcon size={14} /> Export All {modulePlural[type]} (.xlsx)
                  </>
                )}
              </button>
              <a
                href={filteredListPath[type] || '#/students/filtered'}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #bfdbfe',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <SearchIcon size={14} /> Filtered Export in List <ArrowRightIcon size={14} />
              </a>
            </div>
          </div>
        </div>

        {/* Middle Two-Column Grid: Modes & Setup */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '16px',
            marginBottom: '20px'
          }}
        >
          {/* Import Modes & Behavior */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '14px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  flexShrink: 0
                }}
              >
                <SlidersIcon size={20} color="#d97706" />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a' }}>
                Import Modes & Behavior
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '2px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="chk-create-new"
                  checked={createNew}
                  disabled={validating || importing}
                  onChange={(e) => revalidateWithModes(e.target.checked, updateExisting)}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>Create New Records</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="chk-update-existing"
                  checked={updateExisting}
                  disabled={validating || importing}
                  onChange={(e) => revalidateWithModes(createNew, e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>Update Existing Records</span>
              </label>
            </div>
            {!createNew && !updateExisting && (
              <p style={{ color: '#dc2626', margin: '10px 0 0', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangleIcon size={14} /> Warning: Both creation and update modes are disabled. All rows will be skipped.
              </p>
            )}
          </div>

          {/* Initial Account Setup */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '14px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  flexShrink: 0
                }}
              >
                <KeyIcon size={20} color="#0284c7" />
              </div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0284c7' }}>
                Initial Account Setup
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>
              Default password: <strong style={{ color: '#0f172a', fontFamily: 'monospace', fontSize: '0.95rem' }}>{defaultPwd}</strong>
            </p>
          </div>
        </div>

        {/* Step 3: Upload Excel or CSV File */}
        {!validationData && !importResult && (
          <>
            <div
              id="dropzone"
              style={{
                border: isDragging ? '2px dashed #2563eb' : '2px dashed #93c5fd',
                borderRadius: '14px',
                background: isDragging ? '#eff6ff' : '#f8fbff',
                padding: '38px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginBottom: '20px'
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files.length) {
                  handleFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#dbeafe',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '14px'
                }}
              >
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  <polyline points="12 11 12 17" />
                  <polyline points="9 14 12 11 15 14" />
                </svg>
              </div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                3. Upload Excel or CSV File
              </h3>
              <input
                ref={fileInputRef}
                type="file"
                id="file-input"
                accept=".xlsx, .xls, .csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files.length) handleFile(e.target.files[0]);
                }}
              />
              <button
                className="primary"
                id="btn-browse"
                type="button"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <FolderIcon size={16} /> Select File
              </button>
              <div style={{ marginTop: '14px', fontSize: '0.82rem', color: '#64748b' }}>
                Supported file formats: .xlsx, .xls, .csv
              </div>
            </div>

            {validating && (
              <p className="notice warn" style={{ marginTop: '14px' }}>
                Validating {selectedFile?.name} against live database rules (Zero Writes)… Please wait.
              </p>
            )}

            {errorNotice && (
              <p className="notice error" style={{ marginTop: '14px' }}>
                {errorNotice}
              </p>
            )}
          </>
        )}

          {/* Validation Preview */}
          {validationData && !importResult && (
            <div id="import-preview-area" style={{ marginTop: '16px' }}>
              <div className="stat-pill-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div className="stat-pill">
                  <span>Total Rows</span>
                  <strong>{validationData.totalRows}</strong>
                </div>
                <div className="stat-pill valid" style={{ borderColor: '#10b981' }}>
                  <span style={{ color: '#059669' }}>Will Create</span>
                  <strong style={{ color: '#059669' }}>{validationData.createCount}</strong>
                </div>
                <div className="stat-pill" style={{ borderColor: '#3b82f6' }}>
                  <span style={{ color: '#2563eb' }}>Will Update</span>
                  <strong style={{ color: '#2563eb' }}>{validationData.updateCount}</strong>
                </div>
                <div className="stat-pill duplicate">
                  <span>Duplicates in File</span>
                  <strong>{validationData.duplicateCount}</strong>
                </div>
                <div className="stat-pill invalid">
                  <span>Invalid / Rejected</span>
                  <strong>{validationData.invalidCount}</strong>
                </div>
                <div className="stat-pill">
                  <span>Skipped</span>
                  <strong>{validationData.skipCount}</strong>
                </div>
              </div>

              {/* Ignored Columns Information */}
              {validationData.ignoredColumns?.length > 0 && (
                <div className="notice" style={{ marginBottom: '16px', background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <InfoIcon size={16} color="#d97706" /> <span><strong>Extra Columns Ignored:</strong> The following unsupported extra columns were found and will safely be ignored: <code>{validationData.ignoredColumns.join(', ')}</code>.</span>
                </div>
              )}

              {errorNotice && (
                <div className="notice error" style={{ marginBottom: '16px' }}>
                  {errorNotice}
                </div>
              )}

              <article className="card table-card" style={{ marginBottom: '20px' }}>
                <div className="table-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '70px' }}>Row #</th>
                        <th>Identifier / Matching Key</th>
                        <th>Action</th>
                        <th>Status</th>
                        <th>Validation Notes / Diagnostics</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationData.preview.map((row) => (
                        <tr key={row.rowNumber}>
                          <td>
                            <b>{row.rowNumber}</b>
                          </td>
                          <td>
                            <strong>{row.identifier || '—'}</strong>
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                fontWeight: '600',
                                backgroundColor:
                                  row.action === 'CREATE' ? '#d1fae5' : row.action === 'UPDATE' ? '#dbeafe' : '#f1f5f9',
                                color:
                                  row.action === 'CREATE' ? '#065f46' : row.action === 'UPDATE' ? '#1e40af' : '#475569'
                              }}
                            >
                              {row.action}
                            </span>
                          </td>
                          <td>
                            <Badge status={row.status} />
                          </td>
                          <td>
                            {row.errors?.length > 0 ? (
                              <ul className="error-list" style={{ margin: 0, paddingLeft: '16px', color: 'var(--red, #e53e3e)' }}>
                                {row.errors.map((e, idx) => (
                                  <li key={idx}>{e}</li>
                                ))}
                              </ul>
                            ) : row.notes?.length > 0 ? (
                              <span style={{ color: '#059669', fontSize: '0.85rem' }}>
                                {row.notes.join('; ')}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--green, #10b981)', fontSize: '0.85rem' }}>
                                ✓ Ready to process
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <div
                className="form-actions"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>
                  <strong>{validationData.validCount}</strong> eligible record(s) ready to import ({validationData.createCount} to create, {validationData.updateCount} to update).
                </span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="ghost"
                    type="button"
                    onClick={resetState}
                    disabled={importing}
                  >
                    Cancel / Choose Another File
                  </button>
                  <button
                    className="primary"
                    id="btn-confirm-import"
                    type="button"
                    disabled={validationData.validCount === 0 || importing}
                    onClick={() => setConfirmModalOpen(true)}
                  >
                    {importing ? 'Processing Database Writes…' : `Confirm Import (${validationData.validCount} Records)`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Final Import Summary Report */}
          {importResult && (
            <div className="center" style={{ padding: '24px 0', textAlign: 'center' }}>
              <div className="success-icon" style={{ marginBottom: '8px' }}>
                <CheckIcon size={34} strokeWidth={2.5} color="#10b981" />
              </div>
              <h2 style={{ margin: '0 0 8px 0' }}>Import Completed Successfully</h2>
              <p className="subcopy" style={{ color: 'var(--muted, #64748b)', margin: '0 auto 20px', maxWidth: '540px' }}>
                All approved database records have been securely written to MongoDB. User accounts and domain relationships remain consistent.
              </p>

              <div className="stat-pill-row" style={{ maxWidth: '640px', margin: '0 auto 24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <div className="stat-pill valid">
                  <span>Created</span>
                  <strong>{importResult.createdCount}</strong>
                </div>
                <div className="stat-pill" style={{ borderColor: '#3b82f6' }}>
                  <span style={{ color: '#2563eb' }}>Updated</span>
                  <strong style={{ color: '#2563eb' }}>{importResult.updatedCount}</strong>
                </div>
                <div className="stat-pill">
                  <span>Skipped</span>
                  <strong>{importResult.skippedCount}</strong>
                </div>
                {importResult.failedCount > 0 && (
                  <div className="stat-pill invalid">
                    <span>Failed</span>
                    <strong>{importResult.failedCount}</strong>
                  </div>
                )}
              </div>

              {importResult.ignoredColumns?.length > 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--muted, #64748b)', marginBottom: '16px' }}>
                  Harmless extra columns ignored: <code>{importResult.ignoredColumns.join(', ')}</code>
                </p>
              )}

              <div className="form-actions" style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button className="primary" type="button" onClick={resetState}>
                  Import Another File
                </button>
                <a className="secondary" href={listPath}>
                  Go to {titles[type]?.replace('Import ', '') || 'Management'} List
                </a>
              </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Confirm Safe Database Import"
        message={`Are you sure you want to proceed with database writes? This will create ${validationData?.createCount || 0} record(s) and update ${validationData?.updateCount || 0} record(s).`}
        confirmLabel="Proceed with Safe Import"
        onConfirm={executeImport}
        loading={importing}
      />
    </PortalLayout>
  );
}
