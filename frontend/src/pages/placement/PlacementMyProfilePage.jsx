import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import {
  UserIcon,
  MailIcon,
  PhoneIcon,
  BuildingIcon,
  MapPinIcon,
  CalendarIcon,
  ShieldIcon,
  EditIcon,
  CheckIcon,
  CloseIcon
} from '../../components/common/Icons.jsx';
import './PlacementProfile.css';

export function PlacementMyProfilePage() {
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [officer, setOfficer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    mobileNumber: '',
    designation: '',
    department: '',
    officeLocation: 'Surat, Gujarat',
    reportingTo: 'TPO Head'
  });

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await placementOfficerService.getMyProfile();
      setOfficer(data);
      setFormData({
        firstName: data?.firstName || '',
        lastName: data?.lastName || '',
        mobileNumber: data?.mobileNumber || '',
        designation: data?.designation || 'Placement Coordinator',
        department: data?.department || 'Training & Placement Cell',
        officeLocation: 'Surat, Gujarat',
        reportingTo: data?.role === 'ROLE_PLACEMENT_HEAD' ? 'Director / Principal' : 'TPO Head'
      });
    } catch (_err) {
      // Fallback gracefully from current user context
      const nameParts = (user?.name || user?.email?.split('@')[0] || '').split(' ');
      setFormData({
        firstName: nameParts[0] || 'Placement',
        lastName: nameParts.slice(1).join(' ') || 'Coordinator',
        mobileNumber: '',
        designation: role?.name || 'Placement Coordinator',
        department: 'Training & Placement Cell',
        officeLocation: 'Surat, Gujarat',
        reportingTo: 'TPO Head'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await placementOfficerService.updateMyProfile({
        firstName: formData.firstName,
        lastName: formData.lastName,
        mobileNumber: formData.mobileNumber,
        designation: formData.designation,
        department: formData.department
      });
      toast('Profile updated successfully!');
      setIsEditing(false);
      await loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (officer) {
      setFormData({
        firstName: officer?.firstName || '',
        lastName: officer?.lastName || '',
        mobileNumber: officer?.mobileNumber || '',
        designation: officer?.designation || 'Placement Coordinator',
        department: officer?.department || 'Training & Placement Cell',
        officeLocation: 'Surat, Gujarat',
        reportingTo: officer?.role === 'ROLE_PLACEMENT_HEAD' ? 'Director / Principal' : 'TPO Head'
      });
    }
  };

  // Profile data derivations
  const firstName = officer?.firstName || formData.firstName || user?.name?.split(' ')[0] || 'Priya';
  const lastName = officer?.lastName || formData.lastName || user?.name?.split(' ').slice(1).join(' ') || 'Shah';
  const fullName = `${firstName} ${lastName}`.trim() || 'Placement Coordinator';
  const initials = `${firstName[0] || 'P'}${lastName[0] || 'S'}`.toUpperCase();

  const employeeId = officer?.employeeId || user?.employeeId || 'TPC-001';
  const email = officer?.email || user?.email || 'priya.shah@vvwu.ac.in';
  const phone = officer?.mobileNumber || formData.mobileNumber || '+91 98765 43210';
  const designation = officer?.designation || formData.designation || role?.name || 'Placement Coordinator';
  const department = officer?.department || formData.department || 'Training & Placement Cell';
  const officeLocation = formData.officeLocation || 'Surat, Gujarat';
  const reportingTo = formData.reportingTo || 'TPO Head';
  const username = email.split('@')[0] || 'priya.shah';
  const roleName = role?.name || officer?.designation || 'Placement Coordinator';

  // Format joined date
  const joinedDate = officer?.createdAt
    ? new Date(officer.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '15 Jul 2024';

  // Format last login
  const lastLogin = user?.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : '14 Oct 2026, 10:30 AM';

  const isActive = (officer?.accountStatus || user?.accountStatus || 'ACTIVE').toUpperCase() === 'ACTIVE';

  return (
    <PortalLayout
      currentPath={
        window.location.hash.includes('/placement-profile')
          ? '/placement-profile'
          : window.location.hash.includes('/my-profile')
          ? '/my-profile'
          : '/profile'
      }
      hideEyebrow={true}
    >
      <div className="placement-profile-container">
        {/* Breadcrumb Navigation */}
        <div className="placement-profile-breadcrumb">
          <span>Placement Coordinator</span>
          <span>/</span>
          <span className="current">My Profile</span>
        </div>

        {/* Top Header Actions */}
        <div className="placement-profile-top-header">
          <h1 className="placement-profile-title">My Profile</h1>
          <div className="placement-profile-actions">
            {!isEditing ? (
              <button
                type="button"
                className="placement-profile-btn-primary"
                onClick={() => setIsEditing(true)}
              >
                <EditIcon size={16} />
                <span>Edit Profile</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="placement-profile-btn-outline"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  <CloseIcon size={16} />
                  <span>Cancel</span>
                </button>
                <button
                  type="button"
                  className="placement-profile-btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <CheckIcon size={16} />
                  <span>{saving ? 'Saving…' : 'Save Changes'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 2-Column Main Layout Grid */}
        <div className="placement-profile-grid">
          {/* Left Column: Identity Profile Summary Card */}
          <aside className="placement-profile-identity-card">
            <div className="placement-identity-top">
              <div className="placement-avatar-circle">
                {initials}
              </div>
              <h2 className="placement-identity-name">{fullName}</h2>
              <p className="placement-identity-role">{designation}</p>
              <div className="placement-status-badge">
                <span className="placement-status-dot" />
                <span>{isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>

            <div className="placement-identity-details">
              <div className="placement-detail-item">
                <div className="placement-detail-icon">
                  <MailIcon size={18} />
                </div>
                <span className="placement-detail-text" title={email}>{email}</span>
              </div>

              <div className="placement-detail-item">
                <div className="placement-detail-icon">
                  <PhoneIcon size={18} />
                </div>
                <span className="placement-detail-text">{phone}</span>
              </div>

              <div className="placement-detail-item">
                <div className="placement-detail-icon">
                  <BuildingIcon size={18} />
                </div>
                <span className="placement-detail-text">{department}</span>
              </div>

              <div className="placement-detail-item">
                <div className="placement-detail-icon">
                  <MapPinIcon size={18} />
                </div>
                <span className="placement-detail-text">{officeLocation}</span>
              </div>

              <div className="placement-detail-item">
                <div className="placement-detail-icon">
                  <CalendarIcon size={18} />
                </div>
                <span className="placement-detail-text">Joined {joinedDate}</span>
              </div>
            </div>
          </aside>

          {/* Right Column: 3 Structured Information Sections */}
          <main className="placement-sections-stack">
            {/* 1. Personal Information Section */}
            <section className="placement-section-card">
              <div className="placement-section-header">
                <div className="placement-section-icon">
                  <UserIcon size={20} />
                </div>
                <h2 className="placement-section-title">Personal Information</h2>
              </div>

              <div className="placement-fields-grid">
                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-fullname">
                    Full Name
                  </label>
                  {isEditing ? (
                    <input
                      id="field-fullname"
                      type="text"
                      className="placement-field-input"
                      value={fullName}
                      onChange={(e) => {
                        const parts = e.target.value.split(' ');
                        setFormData((prev) => ({
                          ...prev,
                          firstName: parts[0] || '',
                          lastName: parts.slice(1).join(' ') || ''
                        }));
                      }}
                    />
                  ) : (
                    <input
                      id="field-fullname"
                      type="text"
                      className="placement-field-input"
                      value={fullName}
                      readOnly
                      disabled
                    />
                  )}
                </div>

                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-employee-id">
                    Employee ID
                  </label>
                  <input
                    id="field-employee-id"
                    type="text"
                    className="placement-field-input"
                    value={employeeId}
                    readOnly
                    disabled
                  />
                </div>

                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-email">
                    Email Address
                  </label>
                  <input
                    id="field-email"
                    type="email"
                    className="placement-field-input"
                    value={email}
                    readOnly
                    disabled
                  />
                </div>

                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-phone">
                    Phone Number
                  </label>
                  {isEditing ? (
                    <input
                      id="field-phone"
                      type="text"
                      className="placement-field-input"
                      value={formData.mobileNumber}
                      placeholder="+91 98765 43210"
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, mobileNumber: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      id="field-phone"
                      type="text"
                      className="placement-field-input"
                      value={phone}
                      readOnly
                      disabled
                    />
                  )}
                </div>
              </div>
            </section>

            {/* 2. Department Information Section */}
            <section className="placement-section-card">
              <div className="placement-section-header">
                <div className="placement-section-icon">
                  <BuildingIcon size={20} />
                </div>
                <h2 className="placement-section-title">Department Information</h2>
              </div>

              <div className="placement-fields-grid">
                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-department">
                    Department
                  </label>
                  {isEditing ? (
                    <input
                      id="field-department"
                      type="text"
                      className="placement-field-input"
                      value={formData.department}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, department: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      id="field-department"
                      type="text"
                      className="placement-field-input"
                      value={department}
                      readOnly
                      disabled
                    />
                  )}
                </div>

                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-designation">
                    Designation
                  </label>
                  {isEditing ? (
                    <input
                      id="field-designation"
                      type="text"
                      className="placement-field-input"
                      value={formData.designation}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, designation: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      id="field-designation"
                      type="text"
                      className="placement-field-input"
                      value={designation}
                      readOnly
                      disabled
                    />
                  )}
                </div>

                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-office-location">
                    Office Location
                  </label>
                  {isEditing ? (
                    <input
                      id="field-office-location"
                      type="text"
                      className="placement-field-input"
                      value={formData.officeLocation}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, officeLocation: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      id="field-office-location"
                      type="text"
                      className="placement-field-input"
                      value={officeLocation}
                      readOnly
                      disabled
                    />
                  )}
                </div>

                <div className="placement-form-field">
                  <label className="placement-field-label" htmlFor="field-reporting-to">
                    Reporting To
                  </label>
                  {isEditing ? (
                    <input
                      id="field-reporting-to"
                      type="text"
                      className="placement-field-input"
                      value={formData.reportingTo}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, reportingTo: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      id="field-reporting-to"
                      type="text"
                      className="placement-field-input"
                      value={reportingTo}
                      readOnly
                      disabled
                    />
                  )}
                </div>
              </div>
            </section>

            {/* 3. Account Information Section */}
            <section className="placement-section-card">
              <div className="placement-section-header">
                <div className="placement-section-icon">
                  <ShieldIcon size={20} />
                </div>
                <h2 className="placement-section-title">Account Information</h2>
              </div>

              <div className="placement-fields-grid">
                <div className="placement-form-field">
                  <span className="placement-field-label">Username</span>
                  <div className="placement-readonly-box">{username}</div>
                </div>

                <div className="placement-form-field">
                  <span className="placement-field-label">Account Role</span>
                  <div className="placement-readonly-box">{roleName}</div>
                </div>

                <div className="placement-form-field">
                  <span className="placement-field-label">Account Status</span>
                  <div className="placement-readonly-box">
                    <span className="placement-readonly-status">
                      <span className="placement-status-dot" />
                      <span>{isActive ? 'Active' : 'Inactive'}</span>
                    </span>
                  </div>
                </div>

                <div className="placement-form-field">
                  <span className="placement-field-label">Last Login</span>
                  <div className="placement-readonly-box">{lastLogin}</div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </PortalLayout>
  );
}
