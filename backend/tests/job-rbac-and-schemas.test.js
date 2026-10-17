import assert from 'node:assert/strict';
import test, { after, before, describe, it } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ALL_PERMISSION_IDS, PERMISSION_IDS, ROLE_IDS } from '../src/utils/access-constants.js';
import { Permission } from '../src/models/permission.model.js';
import { Role } from '../src/models/role.model.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { seedInitialData } from '../src/seeders/seed.js';
import {
  jobCreateSchema,
  jobUpdateSchema,
  jobStatusUpdateSchema,
  jobReopenSchema,
  jobSuspendSchema,
  applicationCreateSchema,
  applicationStatusUpdateSchema,
  compensationSchema,
  eligibilityCriteriaSchema
} from '../src/validators/schemas.js';

describe('Phase 1 Verification: Job & Application Foundations and Dynamic RBAC', () => {
  let mongo;

  before(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    await connectDatabase(mongo.getUri());
  });

  after(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  describe('1. Canonical Permission Constants', () => {
    it('defines all 9 required Job and Application permission identifiers', () => {
      const requiredJobPerms = [
        'JOB_CREATE',
        'JOB_READ',
        'JOB_UPDATE',
        'JOB_DELETE',
        'JOB_MANAGE'
      ];
      const requiredAppPerms = [
        'APPLICATION_CREATE',
        'APPLICATION_READ',
        'APPLICATION_UPDATE',
        'APPLICATION_MANAGE'
      ];

      for (const perm of [...requiredJobPerms, ...requiredAppPerms]) {
        assert.ok(PERMISSION_IDS[perm], `PERMISSION_IDS.${perm} must be defined`);
        assert.equal(PERMISSION_IDS[perm], perm);
        assert.ok(ALL_PERMISSION_IDS.includes(perm), `ALL_PERMISSION_IDS must include ${perm}`);
      }
    });
  });

  describe('2. Idempotent Database Seeding & Role Assignments', () => {
    it('seeds all permissions and assigns them correctly to roles in MongoDB', async () => {
      await seedInitialData();

      // Check all 9 permissions exist in database
      const dbJobPerms = await Permission.find({
        module: { $in: ['Job Management', 'Application Management'] }
      }).lean();

      assert.equal(dbJobPerms.length, 9, 'All 9 Job and Application permissions must exist in database');

      // Check module categorization and actions
      const jobManagePerm = dbJobPerms.find((p) => p._id === 'JOB_MANAGE');
      assert.ok(jobManagePerm);
      assert.equal(jobManagePerm.module, 'Job Management');
      assert.equal(jobManagePerm.action, 'MANAGE');

      const appCreatePerm = dbJobPerms.find((p) => p._id === 'APPLICATION_CREATE');
      assert.ok(appCreatePerm);
      assert.equal(appCreatePerm.module, 'Application Management');
      assert.equal(appCreatePerm.action, 'CREATE');

      // Verify Role Assignments
      const [companyRole, studentRole, coordinatorRole, headRole, superAdminRole] = await Promise.all([
        Role.findById(ROLE_IDS.COMPANY).lean(),
        Role.findById(ROLE_IDS.STUDENT).lean(),
        Role.findById(ROLE_IDS.PLACEMENT_COORDINATOR).lean(),
        Role.findById(ROLE_IDS.PLACEMENT_HEAD).lean(),
        Role.findById(ROLE_IDS.SUPER_ADMIN).lean()
      ]);

      // Company: JOB_CREATE, JOB_READ, JOB_UPDATE, APPLICATION_READ, APPLICATION_UPDATE
      assert.ok(companyRole.permissionIds.includes(PERMISSION_IDS.JOB_CREATE));
      assert.ok(companyRole.permissionIds.includes(PERMISSION_IDS.JOB_READ));
      assert.ok(companyRole.permissionIds.includes(PERMISSION_IDS.JOB_UPDATE));
      assert.ok(companyRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_READ));
      assert.ok(companyRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE));
      assert.ok(!companyRole.permissionIds.includes(PERMISSION_IDS.JOB_DELETE), 'Company should not have JOB_DELETE by default');
      assert.ok(!companyRole.permissionIds.includes(PERMISSION_IDS.JOB_MANAGE), 'Company must not have JOB_MANAGE');
      assert.ok(!companyRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_MANAGE), 'Company must not have APPLICATION_MANAGE');

      // Student: JOB_READ, APPLICATION_CREATE, APPLICATION_READ
      assert.ok(studentRole.permissionIds.includes(PERMISSION_IDS.JOB_READ));
      assert.ok(studentRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_CREATE));
      assert.ok(studentRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_READ));
      assert.ok(!studentRole.permissionIds.includes(PERMISSION_IDS.JOB_CREATE), 'Student must not have JOB_CREATE');
      assert.ok(!studentRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE), 'Student must not have APPLICATION_UPDATE');

      // Placement Coordinator: JOB_READ, APPLICATION_READ
      assert.ok(coordinatorRole.permissionIds.includes(PERMISSION_IDS.JOB_READ));
      assert.ok(coordinatorRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_READ));
      assert.ok(!coordinatorRole.permissionIds.includes(PERMISSION_IDS.JOB_MANAGE), 'Coordinator must not have JOB_MANAGE');
      assert.ok(!coordinatorRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_MANAGE), 'Coordinator must not have APPLICATION_MANAGE');

      // Placement Head: full oversight
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.JOB_CREATE));
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.JOB_READ));
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.JOB_UPDATE));
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.JOB_DELETE));
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.JOB_MANAGE));
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_READ));
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_UPDATE));
      assert.ok(headRole.permissionIds.includes(PERMISSION_IDS.APPLICATION_MANAGE));

      // Super Admin: ALL_PERMISSION_IDS
      for (const perm of ALL_PERMISSION_IDS) {
        assert.ok(superAdminRole.permissionIds.includes(perm), `Super Admin must have ${perm}`);
      }
    });

    it('preserves existing custom role permissions when seeder is re-executed (idempotence)', async () => {
      // Manually add a custom permission to company role to test preservation
      await Role.updateOne(
        { _id: ROLE_IDS.COMPANY },
        { $addToSet: { permissionIds: 'CUSTOM_TEST_PERM' } }
      );

      // Re-run seeder
      await seedInitialData();

      const updatedCompany = await Role.findById(ROLE_IDS.COMPANY).lean();
      assert.ok(
        updatedCompany.permissionIds.includes('CUSTOM_TEST_PERM'),
        'Custom permissions on existing roles must be preserved during re-seeding'
      );
      assert.ok(updatedCompany.permissionIds.includes(PERMISSION_IDS.JOB_CREATE));
    });
  });

  describe('3. Job & Application Zod Validation Schemas', () => {
    const validObjectId = '507f1f77bcf86cd799439011';

    describe('compensationSchema', () => {
      it('validates correct salary bounds and currency', () => {
        const result = compensationSchema.safeParse({
          salaryMin: 500000,
          salaryMax: 800000,
          currency: 'INR',
          salaryFormat: 'PER_ANNUM'
        });
        assert.ok(result.success);
      });

      it('rejects salaryMax less than salaryMin', () => {
        const result = compensationSchema.safeParse({
          salaryMin: 900000,
          salaryMax: 600000
        });
        assert.ok(!result.success);
        assert.ok(result.error.errors.some((e) => e.message.includes('Maximum salary cannot be less than minimum salary')));
      });

      it('rejects negative salary numbers', () => {
        const result = compensationSchema.safeParse({
          salaryMin: -500
        });
        assert.ok(!result.success);
      });
    });

    describe('eligibilityCriteriaSchema', () => {
      it('validates default eligibility criteria', () => {
        const parsed = eligibilityCriteriaSchema.parse({});
        assert.equal(parsed.minCgpa, 0);
        assert.equal(parsed.requiresNaandiTraining, true);
        assert.deepEqual(parsed.allowedDepartmentIds, []);
      });

      it('rejects invalid CGPA out of 0-10 bounds', () => {
        const result = eligibilityCriteriaSchema.safeParse({ minCgpa: 11 });
        assert.ok(!result.success);
      });
    });

    describe('jobCreateSchema', () => {
      it('accepts valid job creation request', () => {
        const result = jobCreateSchema.safeParse({
          body: {
            title: 'Associate Software Engineer',
            description: 'Full stack development role working on core cloud services.',
            jobType: 'FULL_TIME',
            workMode: 'HYBRID',
            location: 'Surat, Gujarat',
            vacancies: 5,
            deadline: new Date(Date.now() + 86400000 * 30).toISOString(),
            status: 'OPEN'
          },
          params: {},
          query: {}
        });
        assert.ok(result.success, JSON.stringify(result.error));
      });

      it('rejects missing location when workMode is ON_SITE or HYBRID', () => {
        const result = jobCreateSchema.safeParse({
          body: {
            title: 'Associate Software Engineer',
            description: 'Full stack development role working on core cloud services.',
            jobType: 'FULL_TIME',
            workMode: 'ON_SITE',
            vacancies: 5,
            deadline: new Date().toISOString()
          },
          params: {},
          query: {}
        });
        assert.ok(!result.success);
        assert.ok(result.error.errors.some((e) => e.message.includes('Location is required')));
      });

      it('allows omitting location when workMode is REMOTE', () => {
        const result = jobCreateSchema.safeParse({
          body: {
            title: 'Remote Frontend Engineer',
            description: 'Remote frontend engineering position with flexible hours.',
            jobType: 'FULL_TIME',
            workMode: 'REMOTE',
            vacancies: 2,
            deadline: new Date().toISOString()
          },
          params: {},
          query: {}
        });
        assert.ok(result.success);
      });

      it('rejects vacancy count less than 1', () => {
        const result = jobCreateSchema.safeParse({
          body: {
            title: 'Backend Engineer',
            description: 'Standard role with zero vacancies.',
            jobType: 'FULL_TIME',
            workMode: 'REMOTE',
            vacancies: 0,
            deadline: new Date().toISOString()
          },
          params: {},
          query: {}
        });
        assert.ok(!result.success);
      });
    });

    describe('applicationCreateSchema', () => {
      it('accepts valid application payload with jobId', () => {
        const result = applicationCreateSchema.safeParse({
          body: { jobId: validObjectId },
          params: {},
          query: {}
        });
        assert.ok(result.success);
      });

      it('strictly rejects client injection of status or server-controlled fields', () => {
        const result = applicationCreateSchema.safeParse({
          body: {
            jobId: validObjectId,
            status: 'SELECTED', // Malicious attempt to self-select
            recruitmentRound: 5
          },
          params: {},
          query: {}
        });
        assert.ok(!result.success, 'Extra injected fields must cause validation failure');
      });
    });

    describe('applicationStatusUpdateSchema', () => {
      it('validates ATS status transitions', () => {
        const result = applicationStatusUpdateSchema.safeParse({
          body: {
            status: 'SHORTLISTED',
            note: 'High academic score and relevant projects.'
          },
          params: { id: validObjectId },
          query: {}
        });
        assert.ok(result.success);
      });

      it('rejects invalid status', () => {
        const result = applicationStatusUpdateSchema.safeParse({
          body: { status: 'INVALID_STATUS' },
          params: { id: validObjectId },
          query: {}
        });
        assert.ok(!result.success);
      });
    });

    describe('jobSuspendSchema', () => {
      it('requires suspension reason of at least 3 characters', () => {
        const result = jobSuspendSchema.safeParse({
          body: {
            isSuspended: true,
            suspensionReason: 'Under administrative review by Placement Cell'
          },
          params: { id: validObjectId },
          query: {}
        });
        assert.ok(result.success);

        const shortReason = jobSuspendSchema.safeParse({
          body: {
            isSuspended: true,
            suspensionReason: 'no'
          },
          params: { id: validObjectId },
          query: {}
        });
        assert.ok(!shortReason.success);
      });
    });
  });
});
