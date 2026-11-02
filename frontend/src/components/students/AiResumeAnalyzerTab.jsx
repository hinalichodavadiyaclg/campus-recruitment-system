import React, { useState, useEffect, useCallback, useRef } from 'react';
import { resumeAnalysisService } from '../../services/resumeAnalysis.service.js';
import { getAssetUrl } from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ConfirmModal } from '../common/ConfirmModal.jsx';
import { Modal } from '../common/Modal.jsx';
import {
  FileTextIcon,
  UploadIcon,
  DownloadIcon,
  TrashIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  ShieldIcon,
  BriefcaseIcon,
  ChartIcon,
  ExternalLinkIcon,
  EyeIcon,
  EditIcon,
  CheckIcon
} from '../common/Icons.jsx';
import './AiResumeAnalyzer.css';

export function AiResumeAnalyzerTab({ onResumeChange }) {
  const { toast } = useToast();

  const [activeResume, setActiveResume] = useState(null);
  const [resumeList, setResumeList] = useState([]);
  const [latestAnalysis, setLatestAnalysis] = useState(null);
  const [historyAnalyses, setHistoryAnalyses] = useState([]);
  const [availableJobs, setAvailableJobs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [selectedJobId, setSelectedJobId] = useState('');
  const [viewFullReport, setViewFullReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const [showHistoryAccordion, setShowHistoryAccordion] = useState(false);
  const [compareSelection, setCompareSelection] = useState([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  const [deleteModalState, setDeleteModalState] = useState({
    isOpen: false,
    resumeId: null,
    fileName: '',
    loading: false
  });

  const fileInputRef = useRef(null);

  // Resume Improvement State
  const [currentImprovement, setCurrentImprovement] = useState(null);
  const [improving, setImproving] = useState(false);
  const [showImprovementEditor, setShowImprovementEditor] = useState(false);
  const [editingSectionKey, setEditingSectionKey] = useState(null);
  const [manualDrafts, setManualDrafts] = useState({});
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [generatingResume, setGeneratingResume] = useState(false);
  const [generatedDownload, setGeneratedDownload] = useState(null);

  // Load all initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, allRes, latestAna, allAna, jobsRes] = await Promise.all([
        resumeAnalysisService.getActiveResume().catch(() => null),
        resumeAnalysisService.getStudentResumes().catch(() => []),
        resumeAnalysisService.getLatestAnalysis().catch(() => null),
        resumeAnalysisService.getAllStudentAnalyses().catch(() => []),
        resumeAnalysisService.getEligibleJobs().catch(() => [])
      ]);

      setActiveResume(activeRes);
      setResumeList(Array.isArray(allRes) ? allRes : []);

      if (activeRes && activeRes._id) {
        resumeAnalysisService.getLatestImprovementForResume(activeRes._id)
          .then((imp) => {
            setCurrentImprovement(imp);
            if (imp?.generatedVersion?.pdfUrl) {
              setGeneratedDownload(imp.generatedVersion);
            }
          })
          .catch(() => {});
      }
      setLatestAnalysis(latestAna);
      setSelectedReport(latestAna);
      setHistoryAnalyses(Array.isArray(allAna) ? allAna : []);
      setAvailableJobs(Array.isArray(jobsRes) ? jobsRes : []);
    } catch (err) {
      toast(err.message || 'Failed to load resume analysis data.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // File Upload Handlers
  const handleFileUpload = async (file) => {
    if (!file) return;

    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.pdf') && !ext.endsWith('.docx')) {
      toast('Invalid file format. Please upload a PDF (.pdf) or Word document (.docx).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast('File is too large. Maximum permitted size is 5 MB.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      const uploaded = await resumeAnalysisService.uploadResume(formData);
      toast(`Resume "${uploaded.fileName}" uploaded successfully (v${uploaded.versionNumber}).`);
      setActiveResume(uploaded);

      // Refresh list and notify parent if callback provided
      const allRes = await resumeAnalysisService.getStudentResumes().catch(() => []);
      setResumeList(allRes);
      if (onResumeChange) onResumeChange(uploaded);
    } catch (err) {
      toast(err.message || 'Failed to upload resume document.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Run AI Analysis
  const handleRunAnalysis = async () => {
    if (!activeResume) {
      toast('Please upload a resume first before running AI analysis.');
      return;
    }

    setAnalyzing(true);
    try {
      const result = await resumeAnalysisService.analyzeResume(
        activeResume._id,
        selectedJobId || null
      );

      toast('Resume analysis completed successfully!');
      setLatestAnalysis(result);
      setSelectedReport(result);
      setViewFullReport(true);

      // Refresh historical analyses
      const allAna = await resumeAnalysisService.getAllStudentAnalyses().catch(() => []);
      setHistoryAnalyses(allAna);
    } catch (err) {
      toast(err.message || 'AI resume analysis encountered an error. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Delete Resume
  const confirmDeleteResume = async () => {
    if (!deleteModalState.resumeId) return;
    setDeleteModalState((prev) => ({ ...prev, loading: true }));
    try {
      await resumeAnalysisService.deleteResume(deleteModalState.resumeId);
      toast('Resume deleted.');
      setDeleteModalState({ isOpen: false, resumeId: null, fileName: '', loading: false });
      await loadData();
      if (onResumeChange) onResumeChange(null);
    } catch (err) {
      toast(err.message || 'Failed to delete resume.');
      setDeleteModalState((prev) => ({ ...prev, loading: false }));
    }
  };

  // Compare Analyses
  const handleToggleCompareSelection = (id) => {
    setCompareSelection((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const handleRunComparison = async () => {
    if (compareSelection.length !== 2) {
      toast('Please select exactly two analyses from the history list to compare.');
      return;
    }
    setComparing(true);
    try {
      const comp = await resumeAnalysisService.compareAnalyses(
        compareSelection[0],
        compareSelection[1]
      );
      setComparisonResult(comp);
      setCompareModalOpen(true);
    } catch (err) {
      toast(err.message || 'Failed to compare selected analyses.');
    } finally {
      setComparing(false);
    }
  };

  // Improvement Handlers
  const handleStartImprovement = async () => {
    if (!activeResume) {
      toast('Please upload a resume first.');
      return;
    }
    setImproving(true);
    try {
      const imp = await resumeAnalysisService.createImprovement(activeResume._id);
      setCurrentImprovement(imp);
      setShowImprovementEditor(true);
      toast('AI resume improvement suggestions ready for your review.');
    } catch (err) {
      toast(err.message || 'Failed to generate resume improvements.');
    } finally {
      setImproving(false);
    }
  };

  const handleUpdateSectionDecision = async (sectionKey, decision, editedContent = null) => {
    if (!currentImprovement) return;
    try {
      const updated = await resumeAnalysisService.updateSectionDecision(
        currentImprovement._id,
        sectionKey,
        { decision, editedContent }
      );
      setCurrentImprovement(updated);
      setEditingSectionKey(null);
      toast(`Section updated (${decision.toLowerCase()}).`);
    } catch (err) {
      toast(err.message || 'Failed to update section decision.');
    }
  };

  const handleSaveQuestionAnswer = async (questionId) => {
    if (!currentImprovement) return;
    const answer = questionAnswers[questionId];
    if (!answer || !answer.trim()) {
      toast('Please enter your answer before saving.');
      return;
    }
    try {
      const updated = await resumeAnalysisService.answerQuestion(
        currentImprovement._id,
        questionId,
        answer.trim()
      );
      setCurrentImprovement(updated);
      toast('Answer saved successfully.');
    } catch (err) {
      toast(err.message || 'Failed to save answer.');
    }
  };

  const handleGenerateApprovedResume = async () => {
    if (!currentImprovement) return;
    setGeneratingResume(true);
    try {
      const result = await resumeAnalysisService.generateApprovedResume(currentImprovement._id);
      setGeneratedDownload(result.generatedVersion);
      toast(`Improved resume generated successfully as Version v${result.generatedVersion.versionNumber}!`);
      await loadData();
      if (onResumeChange) onResumeChange(result.newResume);
    } catch (err) {
      toast(err.message || 'Failed to generate approved resume.');
    } finally {
      setGeneratingResume(false);
    }
  };

  const currentReport = selectedReport || latestAnalysis;

  if (loading) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading Resume Analyzer…</p>
      </div>
    );
  }

  return (
    <div className="ai-resume-container">
      {/* SECTION A: RESUME MANAGEMENT */}
      <article className="card resume-mgmt-card">
        <h3 style={{ margin: '0 0 16px', color: '#102e5f' }}>Resume Management</h3>

        {activeResume ? (
          <div>
            <div className="resume-file-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '8px',
                    background: '#e7f5f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#087c91'
                  }}
                >
                  <FileTextIcon size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.98rem', color: '#102e5f' }}>
                      {activeResume.fileName}
                    </strong>
                    <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                      {activeResume.fileType}
                    </span>
                    <span className="badge published" style={{ fontSize: '0.72rem' }}>
                      v{activeResume.versionNumber} (Active)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px' }}>
                    Uploaded:{' '}
                    {activeResume.createdAt
                      ? new Date(activeResume.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })
                      : 'N/A'}{' '}
                    • {Math.round(activeResume.fileSize / 1024)} KB
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={getAssetUrl(activeResume.fileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="secondary"
                  style={{ textDecoration: 'none', padding: '6px 12px', fontSize: '0.82rem' }}
                >
                  View / Download ↗
                </a>

                <button
                  type="button"
                  className="secondary"
                  style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : 'Replace Resume'}
                </button>

                <button
                  type="button"
                  className="ghost"
                  style={{ color: '#dc2626', padding: '6px 10px', fontSize: '0.82rem' }}
                  onClick={() =>
                    setDeleteModalState({
                      isOpen: true,
                      resumeId: activeResume._id,
                      fileName: activeResume.fileName,
                      loading: false
                    })
                  }
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Hidden file input for Replace */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.docx"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
          </div>
        ) : (
          <div
            className={`resume-dropzone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon size={36} style={{ color: '#087c91', margin: '0 auto 10px' }} />
            <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#102e5f', marginBottom: '4px' }}>
              Drag & Drop your resume here, or browse files
            </div>
            <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '0.82rem' }}>
              Supported formats: <strong>PDF (.pdf)</strong> and <strong>Word (.docx)</strong> • Maximum file size: 5 MB
            </p>
            <button
              type="button"
              className="primary"
              style={{ padding: '8px 18px', fontSize: '0.84rem' }}
              disabled={uploading}
            >
              {uploading ? 'Uploading & Parsing…' : 'Browse Files'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.docx"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
          </div>
        )}
      </article>

      {/* SECTION B: AI RESUME ANALYSIS */}
      <article className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ margin: 0, color: '#102e5f' }}>AI Resume Analysis</h3>

          {latestAnalysis && (
            <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Last analyzed:{' '}
              {new Date(latestAnalysis.createdAt).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Optional Job Match Selector */}
          <div style={{ flex: '1', minWidth: '240px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>
              Analysis Scope:
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              disabled={!activeResume || analyzing}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                fontSize: '0.85rem'
              }}
            >
              <option value="">General Resume & ATS Analysis (Default)</option>
              {availableJobs.map((job) => (
                <option key={job._id} value={job._id}>
                  Match for: {job.title} ({job.companyName || 'Hiring Co.'})
                </option>
              ))}
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="primary"
              style={{ padding: '10px 22px', fontSize: '0.88rem', minWidth: '170px' }}
              disabled={!activeResume || analyzing}
              onClick={handleRunAnalysis}
            >
              {analyzing ? (
                <span>Analyzing Resume…</span>
              ) : selectedJobId ? (
                'Run Job Match'
              ) : (
                'Analyze My Resume'
              )}
            </button>
          </div>
        </div>

        {!activeResume && (
          <div style={{ marginTop: '12px', fontSize: '0.82rem', color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <InfoIcon size={16} /> Upload a resume above to enable analysis.
          </div>
        )}

        {analyzing && (
          <div style={{ marginTop: '16px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontWeight: 600, color: '#102e5f', fontSize: '0.88rem' }}>
              Evaluating resume…
            </div>
          </div>
        )}
      </article>

      {/* SECTION C: AI RESUME IMPROVEMENT */}
      <article className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ margin: 0, color: '#102e5f' }}>AI Resume Improvement</h3>

          <div style={{ display: 'flex', gap: '8px' }}>
            {currentImprovement && (
              <button
                type="button"
                className="secondary"
                style={{ padding: '9px 18px', fontSize: '0.86rem' }}
                onClick={() => setShowImprovementEditor(!showImprovementEditor)}
              >
                {showImprovementEditor ? 'Hide Editor ▲' : 'Review Suggestions ▼'}
              </button>
            )}
            <button
              type="button"
              className="primary"
              style={{ padding: '9px 20px', fontSize: '0.86rem' }}
              disabled={!activeResume || improving}
              onClick={handleStartImprovement}
            >
              {improving ? 'Generating Suggestions…' : currentImprovement ? 'Regenerate Suggestions' : 'Improve My Resume'}
            </button>
          </div>
        </div>

        {/* Generated downloads banner if available */}
        {generatedDownload && generatedDownload.pdfUrl && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 18px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircleIcon size={20} style={{ color: '#16a34a' }} />
              <div>
                <strong style={{ fontSize: '0.9rem', color: '#166534' }}>
                  Improved Resume (v{generatedDownload.versionNumber}) Ready & Active
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <a
                href={getAssetUrl(generatedDownload.pdfUrl)}
                target="_blank"
                rel="noreferrer"
                download
                className="primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  fontSize: '0.82rem',
                  textDecoration: 'none'
                }}
              >
                <DownloadIcon size={14} /> Download PDF
              </a>
              {generatedDownload.docxUrl && (
                <a
                  href={getAssetUrl(generatedDownload.docxUrl)}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    fontSize: '0.82rem',
                    textDecoration: 'none'
                  }}
                >
                  <DownloadIcon size={14} /> Download DOCX
                </a>
              )}
            </div>
          </div>
        )}

        {/* Side-by-Side Editor */}
        {showImprovementEditor && currentImprovement && (
          <div style={{ marginTop: '20px' }}>
            {/* Optional Questions to strengthen resume */}
            {currentImprovement.missingInformationQuestions?.length > 0 && (
              <div
                style={{
                  padding: '14px 16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '18px'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#102e5f', marginBottom: '6px' }}>
                  Strengthen Your Resume (Optional Clarifications)
                </div>
                {currentImprovement.missingInformationQuestions.map((q) => (
                  <div key={q.id} style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      {q.question}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="e.g. Implemented frontend components and REST API integration"
                        value={questionAnswers[q.id] !== undefined ? questionAnswers[q.id] : (q.studentAnswer || '')}
                        onChange={(e) =>
                          setQuestionAnswers({ ...questionAnswers, [q.id]: e.target.value })
                        }
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--line)',
                          fontSize: '0.82rem'
                        }}
                      />
                      <button
                        type="button"
                        className="secondary"
                        style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                        onClick={() => handleSaveQuestionAnswer(q.id)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sections List */}
            {currentImprovement.sections?.map((sec) => {
              const origStr = typeof sec.originalContent === 'string'
                ? sec.originalContent
                : JSON.stringify(sec.originalContent, null, 2);
              const impStr = typeof sec.improvedContent === 'string'
                ? sec.improvedContent
                : JSON.stringify(sec.improvedContent, null, 2);
              const isEditing = editingSectionKey === sec.sectionKey;

              return (
                <div key={sec.sectionKey} className="improvement-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '0.94rem', color: '#102e5f' }}>
                        {sec.sectionTitle}
                      </strong>
                      <span className={`decision-badge ${sec.studentDecision.toLowerCase()}`}>
                        {sec.studentDecision === 'ACCEPTED'
                          ? 'Accepted'
                          : sec.studentDecision === 'REJECTED'
                          ? 'Kept Original'
                          : sec.studentDecision === 'EDITED'
                          ? 'Custom Edited'
                          : 'Pending Review'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className={sec.studentDecision === 'ACCEPTED' ? 'primary' : 'secondary'}
                        style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        onClick={() => handleUpdateSectionDecision(sec.sectionKey, 'ACCEPTED')}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className={sec.studentDecision === 'EDITED' ? 'primary' : 'secondary'}
                        style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        onClick={() => {
                          if (isEditing) {
                            handleUpdateSectionDecision(sec.sectionKey, 'EDITED', manualDrafts[sec.sectionKey] || impStr);
                          } else {
                            setManualDrafts({ ...manualDrafts, [sec.sectionKey]: sec.studentEditedContent || impStr });
                            setEditingSectionKey(sec.sectionKey);
                          }
                        }}
                      >
                        {isEditing ? 'Save Edit' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className={sec.studentDecision === 'REJECTED' ? 'primary' : 'secondary'}
                        style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        onClick={() => handleUpdateSectionDecision(sec.sectionKey, 'REJECTED')}
                      >
                        Keep Original
                      </button>
                    </div>
                  </div>

                  <div className="improvement-side-by-side">
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Original Content
                      </div>
                      <div className="diff-box original">
                        {origStr}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', marginBottom: '4px' }}>
                        AI Improved Content
                      </div>
                      {isEditing ? (
                        <textarea
                          rows={4}
                          value={manualDrafts[sec.sectionKey] !== undefined ? manualDrafts[sec.sectionKey] : impStr}
                          onChange={(e) =>
                            setManualDrafts({ ...manualDrafts, [sec.sectionKey]: e.target.value })
                          }
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: '1px solid #0d9488',
                            fontSize: '0.85rem',
                            fontFamily: 'inherit',
                            lineHeight: 1.45
                          }}
                        />
                      ) : (
                        <div className="diff-box improved">
                          {sec.studentDecision === 'EDITED' && sec.studentEditedContent ? sec.studentEditedContent : impStr}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '8px' }}>
                    <strong>Why this is better:</strong> {sec.explanation}
                  </div>
                </div>
              );
            })}

            {/* Bottom Generate Action */}
            <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <strong style={{ fontSize: '0.92rem', color: '#102e5f' }}>
                  Apply Accepted Improvements
                </strong>
              </div>

              <button
                type="button"
                className="primary"
                style={{ padding: '10px 24px', fontSize: '0.88rem' }}
                disabled={generatingResume}
                onClick={handleGenerateApprovedResume}
              >
                {generatingResume ? 'Generating Documents…' : 'Generate Improved Resume'}
              </button>
            </div>
          </div>
        )}
      </article>

      {/* SECTION D: LATEST ANALYSIS SUMMARY */}
      {currentReport && (
        <article className="card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#102e5f' }}>
                {currentReport._id === latestAnalysis?._id ? 'Latest Analysis Summary' : 'Historical Analysis Report'}
              </h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '2px' }}>
                Resume Version: v{currentReport.resumeVersion || 1} • {currentReport.analysisType === 'JOB_MATCH' ? 'Job Match Evaluation' : 'General ATS Evaluation'}
              </div>
            </div>

            <button
              type="button"
              className={viewFullReport ? 'secondary' : 'primary'}
              style={{ padding: '7px 16px', fontSize: '0.82rem' }}
              onClick={() => setViewFullReport(!viewFullReport)}
            >
              {viewFullReport ? 'Hide Full Report ▲' : 'View Full Analysis ▼'}
            </button>
          </div>

          {/* Non-Resume Alert Banner */}
          {currentReport.isResume === false && (
            <div
              style={{
                padding: '14px 18px',
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '8px',
                color: '#9f1239',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <AlertTriangleIcon size={22} style={{ color: '#e11d48', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.94rem', marginBottom: '4px' }}>
                  Non-Resume Document Detected ({currentReport.documentType || 'Certificate'})
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#4c0519' }}>
                  The uploaded file appears to be a <strong>{currentReport.documentType === 'CERTIFICATE' ? 'Certificate' : currentReport.documentType}</strong>. Please upload a standard resume.
                </p>
              </div>
            </div>
          )}

          {/* Score Header Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '18px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              flexWrap: 'wrap'
            }}
          >
            <div
              className={`score-badge-circle ${
                currentReport.isResume === false
                  ? 'score-invalid'
                  : currentReport.overallScore >= 80
                  ? 'score-high'
                  : currentReport.overallScore >= 65
                  ? 'score-medium'
                  : 'score-low'
              }`}
            >
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{currentReport.overallScore}</span>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', opacity: 0.9 }}>out of 100</span>
            </div>

            <div style={{ flex: 1, minWidth: '220px' }}>
              <strong style={{ fontSize: '1rem', color: currentReport.isResume === false ? '#be123c' : '#102e5f', display: 'block', marginBottom: '4px' }}>
                {currentReport.isResume === false
                  ? `Non-Resume Document: ${currentReport.documentType === 'CERTIFICATE' ? 'Certificate Detected' : currentReport.documentType}`
                  : currentReport.overallScore >= 80
                  ? 'Excellent Resume Alignment'
                  : currentReport.overallScore >= 65
                  ? 'Good Candidate Foundation'
                  : 'Actionable Improvements Needed'}
              </strong>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>
                {currentReport.summary}
              </p>
            </div>

            {currentReport.analysisType === 'JOB_MATCH' && currentReport.jobMatchResult && (
              <div
                style={{
                  borderLeft: '2px solid #cbd5e1',
                  paddingLeft: '16px',
                  minWidth: '180px'
                }}
              >
                <div style={{ fontSize: '0.74rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Job Match Score
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#087c91', margin: '2px 0' }}>
                  {currentReport.jobMatchResult.jobMatchScore}%
                </div>
                <div style={{ fontSize: '0.75rem', color: '#334155' }}>
                  Target: {currentReport.jobMatchResult.jobSnapshot?.title || 'Selected Job'}
                </div>
              </div>
            )}
          </div>

          {/* Category Progress Grid */}
          <div className="category-score-grid">
            <div className="category-score-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                <span style={{ color: '#102e5f' }}>ATS Compatibility</span>
                <span style={{ color: '#087c91' }}>{currentReport.categoryScores?.atsCompatibility || 0}%</span>
              </div>
              <div className="category-progress-track">
                <div
                  className="category-progress-bar"
                  style={{ width: `${currentReport.categoryScores?.atsCompatibility || 0}%` }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>Weight: 20%</div>
            </div>

            <div className="category-score-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                <span style={{ color: '#102e5f' }}>Skills & Competencies</span>
                <span style={{ color: '#087c91' }}>{currentReport.categoryScores?.skills || 0}%</span>
              </div>
              <div className="category-progress-track">
                <div
                  className="category-progress-bar"
                  style={{ width: `${currentReport.categoryScores?.skills || 0}%` }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>Weight: 20%</div>
            </div>

            <div className="category-score-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                <span style={{ color: '#102e5f' }}>Project Portfolio</span>
                <span style={{ color: '#087c91' }}>{currentReport.categoryScores?.projects || 0}%</span>
              </div>
              <div className="category-progress-track">
                <div
                  className="category-progress-bar"
                  style={{ width: `${currentReport.categoryScores?.projects || 0}%` }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>Weight: 20%</div>
            </div>

            <div className="category-score-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                <span style={{ color: '#102e5f' }}>Structure & Clarity</span>
                <span style={{ color: '#087c91' }}>{currentReport.categoryScores?.resumeStructure || 0}%</span>
              </div>
              <div className="category-progress-track">
                <div
                  className="category-progress-bar"
                  style={{ width: `${currentReport.categoryScores?.resumeStructure || 0}%` }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>Weight: 20%</div>
            </div>

            <div className="category-score-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                <span style={{ color: '#102e5f' }}>Education</span>
                <span style={{ color: '#087c91' }}>{currentReport.categoryScores?.education || 0}%</span>
              </div>
              <div className="category-progress-track">
                <div
                  className="category-progress-bar"
                  style={{ width: `${currentReport.categoryScores?.education || 0}%` }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>Weight: 10%</div>
            </div>

            <div className="category-score-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600 }}>
                <span style={{ color: '#102e5f' }}>Experience / Exposure</span>
                <span style={{ color: '#087c91' }}>{currentReport.categoryScores?.experience || 0}%</span>
              </div>
              <div className="category-progress-track">
                <div
                  className="category-progress-bar"
                  style={{ width: `${currentReport.categoryScores?.experience || 0}%` }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>Weight: 10% (Fresher Adapted)</div>
            </div>
          </div>
        </article>
      )}

      {/* SECTION D: FULL ANALYSIS DETAILS */}
      {viewFullReport && currentReport && (
        <article className="card" style={{ padding: '24px', border: '2px solid #087c91' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#102e5f' }}>Detailed Resume Diagnostic</h3>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: '0.82rem' }}
              onClick={() => setViewFullReport(false)}
            >
              ✕ Collapse Report
            </button>
          </div>

          {/* D.1 Strengths & Areas for Improvement */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: '0.92rem' }}>
                Key Resume Strengths ({currentReport.strengths?.length || 0})
              </h4>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.84rem', color: '#14532d', lineHeight: 1.6 }}>
                {(currentReport.strengths || []).map((s, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>{s}</li>
                ))}
              </ul>
            </div>

            <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '8px', border: '1px solid #fef3c7' }}>
              <h4 style={{ margin: '0 0 10px', color: '#92400e', fontSize: '0.92rem' }}>
                Areas for Improvement ({currentReport.areasForImprovement?.length || 0})
              </h4>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.84rem', color: '#78350f', lineHeight: 1.6 }}>
                {(currentReport.areasForImprovement || []).map((w, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>{w}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* D.2 Skills Identified */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ margin: '0 0 8px', color: '#102e5f', fontSize: '0.92rem' }}>
              Extracted Skills & Competencies
            </h4>
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Technical Skills:
              </span>
              {(currentReport.extractedSkills?.technical || []).length > 0 ? (
                (currentReport.extractedSkills.technical || []).map((sk, idx) => (
                  <span key={idx} className="skill-pill">{sk}</span>
                ))
              ) : (
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No technical skills parsed.</span>
              )}
            </div>

            {currentReport.extractedSkills?.soft?.length > 0 && (
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Soft / Professional Competencies:
                </span>
                {currentReport.extractedSkills.soft.map((sk, idx) => (
                  <span key={idx} className="skill-pill" style={{ background: '#fdf4ff', color: '#86198f' }}>{sk}</span>
                ))}
              </div>
            )}
          </div>

          {/* D.3 Job Match Specific Details (if present) */}
          {currentReport.analysisType === 'JOB_MATCH' && currentReport.jobMatchResult && (
            <div style={{ marginBottom: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 10px', color: '#087c91', fontSize: '0.95rem' }}>
                Role Alignment: {currentReport.jobMatchResult.jobSnapshot?.title}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                    Matched Skills ({currentReport.jobMatchResult.matchedSkills?.length || 0}):
                  </span>
                  {(currentReport.jobMatchResult.matchedSkills || []).map((sk, i) => (
                    <span key={i} className="skill-pill matched">✓ {sk}</span>
                  ))}
                </div>

                <div>
                  <span style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                    Missing Required/Preferred Skills ({currentReport.jobMatchResult.missingSkills?.length || 0}):
                  </span>
                  {(currentReport.jobMatchResult.missingSkills || []).map((sk, i) => (
                    <span key={i} className="skill-pill missing">✕ {sk}</span>
                  ))}
                </div>
              </div>

              {currentReport.jobMatchResult.jobRecommendations?.length > 0 && (
                <div style={{ marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#102e5f', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Role Tailoring Recommendations:
                  </span>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#334155' }}>
                    {currentReport.jobMatchResult.jobRecommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* D.4 AI Improvement Recommendations */}
          <div>
            <h4 style={{ margin: '0 0 12px', color: '#102e5f', fontSize: '0.95rem' }}>
              Actionable AI Recommendations ({currentReport.recommendations?.length || 0})
            </h4>

            {(currentReport.recommendations || []).map((rec, i) => (
              <div
                key={i}
                className={`recommendation-card priority-${(rec.priority || 'medium').toLowerCase()}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '0.9rem', color: '#102e5f' }}>
                    {rec.problem}
                  </strong>
                  <span
                    className={`badge ${
                      rec.priority === 'HIGH' ? 'closed' : rec.priority === 'MEDIUM' ? 'badge-info' : 'published'
                    }`}
                    style={{ fontSize: '0.7rem' }}
                  >
                    {rec.priority} PRIORITY
                  </span>
                </div>

                <p style={{ margin: '0 0 6px', fontSize: '0.84rem', color: '#475569' }}>
                  <strong>Why it matters:</strong> {rec.whyItMatters}
                </p>

                <p style={{ margin: '0 0 6px', fontSize: '0.84rem', color: '#0f172a' }}>
                  <strong>How to improve:</strong> {rec.howToImprove}
                </p>

                {rec.example && (
                  <div style={{ background: '#f8fafc', padding: '6px 12px', borderRadius: '4px', fontSize: '0.78rem', color: '#087c91', borderLeft: '2px solid #087c91', marginTop: '6px' }}>
                    {rec.example}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              type="button"
              className="secondary"
              style={{ fontSize: '0.82rem', padding: '6px 16px' }}
              onClick={() => setViewFullReport(false)}
            >
              Close Detailed Diagnostic
            </button>
          </div>
        </article>
      )}

      {/* SECTION E: RESUME HISTORY AND VERSION COMPARISON */}
      <article className="card" style={{ padding: '18px' }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setShowHistoryAccordion(!showHistoryAccordion)}
        >
          <div>
            <h4 style={{ margin: 0, color: '#102e5f', fontSize: '0.95rem' }}>
              Previous Analyses & Version History ({historyAnalyses.length})
            </h4>
          </div>
          <button type="button" className="ghost" style={{ fontSize: '0.82rem' }}>
            {showHistoryAccordion ? 'Collapse ▲' : 'Expand ▼'}
          </button>
        </div>

        {showHistoryAccordion && (
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '14px' }}>
            {historyAnalyses.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '8px 0' }}>
                No previous analysis records found.
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Select 2 analyses to compare
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={compareSelection.length !== 2 || comparing}
                    onClick={handleRunComparison}
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                  >
                    {comparing ? 'Comparing…' : `Compare Selected (${compareSelection.length}/2)`}
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left', color: '#64748b' }}>
                        <th style={{ padding: '8px 6px', width: '36px' }}>Select</th>
                        <th style={{ padding: '8px 10px' }}>Date</th>
                        <th style={{ padding: '8px 10px' }}>Version</th>
                        <th style={{ padding: '8px 10px' }}>Type</th>
                        <th style={{ padding: '8px 10px' }}>Score</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyAnalyses.map((item) => {
                        const isSelected = compareSelection.includes(item._id);
                        return (
                          <tr key={item._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 6px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleCompareSelection(item._id)}
                              />
                            </td>
                            <td style={{ padding: '10px' }}>
                              {new Date(item.createdAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                                v{item.resumeVersion || item.resumeId?.versionNumber || 1}
                              </span>
                            </td>
                            <td style={{ padding: '10px' }}>
                              {item.analysisType === 'JOB_MATCH' ? (
                                <span>🎯 Job Match ({item.jobId?.title || 'Job'})</span>
                              ) : (
                                <span>📄 General ATS</span>
                              )}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <strong
                                style={{
                                  color: item.overallScore >= 80 ? '#16734b' : item.overallScore >= 65 ? '#087c91' : '#d97706'
                                }}
                              >
                                {item.overallScore} / 100
                              </strong>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <button
                                type="button"
                                className="ghost"
                                style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                                onClick={() => {
                                  setSelectedReport(item);
                                  setViewFullReport(true);
                                  window.scrollTo({ top: 400, behavior: 'smooth' });
                                }}
                              >
                                View Report →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </article>

      {/* COMPARISON MODAL */}
      <Modal
        isOpen={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        title="Resume Version Progression Comparison"
        maxWidth="760px"
      >
        {comparisonResult && (
          <div style={{ padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <strong style={{ fontSize: '1rem', color: '#102e5f' }}>
                  Version {comparisonResult.baseAnalysis.version} vs Version {comparisonResult.targetAnalysis.version}
                </strong>
              </div>

              <div
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: comparisonResult.scoreDiff >= 0 ? '#dcfce7' : '#fee2e2',
                  color: comparisonResult.scoreDiff >= 0 ? '#166534' : '#991b1b',
                  fontWeight: 700,
                  fontSize: '0.92rem'
                }}
              >
                {comparisonResult.scoreDiff >= 0 ? `+${comparisonResult.scoreDiff}` : comparisonResult.scoreDiff} points
              </div>
            </div>

            <div className="comparison-box">
              <div>
                <h5 style={{ margin: '0 0 6px', color: '#64748b' }}>
                  Base: v{comparisonResult.baseAnalysis.version} (Earlier)
                </h5>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#102e5f' }}>
                  {comparisonResult.baseAnalysis.overallScore} / 100
                </div>
              </div>

              <div>
                <h5 style={{ margin: '0 0 6px', color: '#087c91' }}>
                  Comparison: v{comparisonResult.targetAnalysis.version} (Later)
                </h5>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#087c91' }}>
                  {comparisonResult.targetAnalysis.overallScore} / 100
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <h5 style={{ margin: '0 0 10px', color: '#102e5f' }}>Category Score Deltas</h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {Object.entries(comparisonResult.categoryDeltas || {}).map(([cat, delta]) => (
                  <div
                    key={cat}
                    style={{
                      padding: '10px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.82rem'
                    }}
                  >
                    <span style={{ textTransform: 'capitalize', color: '#475569' }}>
                      {cat.replace(/([A-Z])/g, ' $1')}
                    </span>
                    <strong style={{ color: delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#64748b' }}>
                      {delta > 0 ? `+${delta}` : delta}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {comparisonResult.newSkillsAdded?.length > 0 && (
              <div style={{ marginTop: '18px' }}>
                <h5 style={{ margin: '0 0 8px', color: '#166534' }}>New Skills Added in Later Version</h5>
                <div>
                  {comparisonResult.newSkillsAdded.map((s, i) => (
                    <span key={i} className="skill-pill matched">+ {s}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setCompareModalOpen(false)}
              >
                Close Comparison
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState({ isOpen: false, resumeId: null, fileName: '', loading: false })}
        title="Delete Resume"
        message={`Are you sure you want to delete "${deleteModalState.fileName}"? If a previous resume version exists, it will become active.`}
        confirmLabel="Delete Resume"
        danger={true}
        onConfirm={confirmDeleteResume}
        loading={deleteModalState.loading}
      />
    </div>
  );
}

