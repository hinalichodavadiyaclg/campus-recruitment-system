import React from 'react';

export function AuthLayout({ children }) {
  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <a className="brand" href="#/login">
          <span className="brand-mark">CR</span>
          <span>Campus Recruit</span>
        </a>
        <h1>Career opportunities, securely connected.</h1>
        <p>
          University Campus Recruitment Portal provides role-based access for students,
          recruiters, and placement professionals.
        </p>
        <ul className="hero-list">
          <li>Students</li>
          <li>Recruiters</li>
          <li>Placement Cell</li>
          <li>Super Admin</li>
        </ul>
      </section>
      <section className="auth-content">
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}
