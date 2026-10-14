import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { departmentService } from '../../services/department.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { DepartmentModal } from '../../components/departments/DepartmentModal.jsx';
import { PlusIcon } from '../../components/common/Icons.jsx';

export function DepartmentsListPage() {
  const { has } = useAuth();
  const { toast } = useToast();

  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await departmentService.listDepartments({ limit: 100 });
      setDepartments(data.items || []);
    } catch (err) {
      toast(err.message || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredDepartments = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return departments;
    return departments.filter(
      (d) =>
        d.name?.toLowerCase().includes(q) ||
        d.code?.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
    );
  }, [departments, search]);

  const handleCreateOrUpdate = async (formData) => {
    setIsProcessing(true);
    try {
      if (editingDepartment) {
        await departmentService.updateDepartment(editingDepartment._id, formData);
        toast('Department updated successfully.');
      } else {
        await departmentService.createDepartment(formData);
        toast('Department created successfully.');
      }
      setModalOpen(false);
      setEditingDepartment(null);
      await loadData();
    } catch (err) {
      toast(err.message || 'Failed to save department.');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleStatus = async (dept) => {
    setIsProcessing(true);
    try {
      const updated = await departmentService.setDepartmentStatus(dept._id, !dept.isActive);
      toast(`Department "${dept.name}" ${updated.isActive ? 'activated' : 'deactivated'}.`);
      await loadData();
    } catch (err) {
      toast(err.message || 'Failed to update department status.');
    } finally {
      setIsProcessing(false);
    }
  };

  const headerActions = (
    <div className="button-group">
      {has('DEPARTMENT_CREATE') && (
        <button
          className="primary"
          id="btn-create-department"
          type="button"
          onClick={() => {
            setEditingDepartment(null);
            setModalOpen(true);
          }}
        >
          <PlusIcon size={16} /> Add Department
        </button>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="Department Management"
      subtitle="Manage academic departments, department codes, and active statuses."
      actions={headerActions}
      currentPath="/departments"
    >
      <section>
        <div className="filters">
          <input
            id="department-search"
            placeholder="Search by Department Name, Code, or Description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <article className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department Code</th>
                  <th>Department Name</th>
                  <th style={{ textAlign: 'center' }}>Total Students</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="empty">
                      Loading departments…
                    </td>
                  </tr>
                ) : filteredDepartments.length > 0 ? (
                  filteredDepartments.map((dept) => (
                    <tr key={dept._id}>
                      <td>
                        <span className="badge badge-info">{dept.code}</span>
                      </td>
                      <td>
                        <strong>{dept.name}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className="badge neutral"
                          style={{
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            padding: '3px 10px',
                            minWidth: '28px',
                            textAlign: 'center',
                            display: 'inline-block'
                          }}
                        >
                          {dept.studentCount ?? 0}
                        </span>
                      </td>
                      <td>{dept.description || '—'}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            dept.isActive ? 'status-active' : 'status-inactive'
                          }`}
                        >
                          {dept.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions">
                        {has('DEPARTMENT_UPDATE') && (
                          <>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => {
                                setEditingDepartment(dept);
                                setModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="link-button"
                              style={{ color: dept.isActive ? 'var(--red, #e53e3e)' : 'var(--green, #38a169)' }}
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleToggleStatus(dept)}
                            >
                              {dept.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty">
                      No departments found matching your query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <DepartmentModal
        isOpen={modalOpen}
        department={editingDepartment}
        isProcessing={isProcessing}
        onClose={() => {
          setModalOpen(false);
          setEditingDepartment(null);
        }}
        onSubmit={handleCreateOrUpdate}
      />
    </PortalLayout>
  );
}
