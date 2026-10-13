import React from 'react';

export function Loading({ message = 'Loading…' }) {
  return <div className="loading">{message}</div>;
}
