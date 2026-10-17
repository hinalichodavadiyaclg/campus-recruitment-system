/**
 * Helper utilities for formatting and displaying Job and Application data
 * across the VVWU Campus Recruitment Portal.
 */

export function formatSalary(compensation) {
  if (!compensation) return 'Not Disclosed';
  const { salaryMin, salaryMax, currency = 'INR', salaryFormat = 'PER_ANNUM' } = compensation;

  const symbol = currency === 'INR' ? '₹' : currency + ' ';

  const formatNum = (num) => {
    if (num === undefined || num === null) return '';
    return Number(num).toLocaleString('en-IN');
  };

  const periodMap = {
    PER_ANNUM: '/ yr',
    PER_MONTH: '/ mo',
    STIPEND: 'Stipend'
  };
  const period = periodMap[salaryFormat] || '';

  if (salaryMin !== undefined && salaryMin !== null && salaryMax !== undefined && salaryMax !== null) {
    if (salaryMin === salaryMax) {
      return `${symbol}${formatNum(salaryMin)} ${period}`.trim();
    }
    return `${symbol}${formatNum(salaryMin)} – ${symbol}${formatNum(salaryMax)} ${period}`.trim();
  }
  if (salaryMin !== undefined && salaryMin !== null) {
    return `From ${symbol}${formatNum(salaryMin)} ${period}`.trim();
  }
  if (salaryMax !== undefined && salaryMax !== null) {
    return `Up to ${symbol}${formatNum(salaryMax)} ${period}`.trim();
  }
  return 'Not Disclosed';
}

export function formatRelativeTime(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMin <= 1) return 'Just now';
      return `${diffMin}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  }
  return formatDate(dateInput);
}

export function formatDate(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatDateTime(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getJobTypeLabel(type) {
  const map = {
    FULL_TIME: 'Full-Time',
    PART_TIME: 'Part-Time',
    INTERNSHIP: 'Internship',
    CONTRACT: 'Contract'
  };
  return map[type] || type || 'Full-Time';
}

export function getWorkModeLabel(mode) {
  const map = {
    ON_SITE: 'On-Site',
    REMOTE: 'Remote',
    HYBRID: 'Hybrid'
  };
  return map[mode] || mode || 'On-Site';
}

export const APPLICATION_STATUS_INFO = {
  APPLIED: {
    label: 'Applied',
    badgeClass: 'neutral',
    bg: '#f1f5f9',
    color: '#475569',
    description: 'Application successfully submitted.'
  },
  UNDER_REVIEW: {
    label: 'Under Review',
    badgeClass: 'warn',
    bg: '#eff6ff',
    color: '#1d4ed8',
    description: 'Application is being evaluated by the hiring team.'
  },
  SHORTLISTED: {
    label: 'Shortlisted',
    badgeClass: 'valid',
    bg: '#f0fdf4',
    color: '#15803d',
    description: 'Candidate shortlisted for assessments or interviews.'
  },
  ASSESSMENT: {
    label: 'Assessment',
    badgeClass: 'warn',
    bg: '#fefce8',
    color: '#a16207',
    description: 'Candidate scheduled for technical test or assignment.'
  },
  INTERVIEW: {
    label: 'Interview',
    badgeClass: 'warn',
    bg: '#faf5ff',
    color: '#7e22ce',
    description: 'Candidate scheduled for interview round.'
  },
  SELECTED: {
    label: 'Selected',
    badgeClass: 'valid',
    bg: '#ecfdf5',
    color: '#047857',
    description: 'Job offer extended to candidate.'
  },
  REJECTED: {
    label: 'Not Selected',
    badgeClass: 'invalid',
    bg: '#fef2f2',
    color: '#b91c1c',
    description: 'Application not moving forward.'
  },
  WITHDRAWN: {
    label: 'Withdrawn',
    badgeClass: 'inactive',
    bg: '#f8fafc',
    color: '#64748b',
    description: 'Application withdrawn by candidate.'
  }
};

export const ALLOWED_STATUS_TRANSITIONS = {
  APPLIED: ['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED'],
  UNDER_REVIEW: ['SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'REJECTED'],
  SHORTLISTED: ['ASSESSMENT', 'INTERVIEW', 'SELECTED', 'REJECTED'],
  ASSESSMENT: ['INTERVIEW', 'SELECTED', 'REJECTED'],
  INTERVIEW: ['SELECTED', 'REJECTED']
};
