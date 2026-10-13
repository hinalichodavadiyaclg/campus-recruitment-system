import React from 'react';

export function Badge({ status, className = '' }) {
  if (!status) return null;
  const statusLower = String(status).toLowerCase();
  return (
    <span className={`badge ${statusLower} ${className}`}>
      {status}
    </span>
  );
}
