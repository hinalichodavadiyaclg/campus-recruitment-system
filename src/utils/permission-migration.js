import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { PERMISSION_LEGACY_ALIAS_MAP } from './access-constants.js';
import { logActivity } from './logger.js';

/**
 * Scans MongoDB for any non-canonical permission names (e.g. CREATE_USER),
 * migrates them to the canonical name (e.g. USER_CREATE), updates all roles
 * referencing the old permission IDs, and cleans up the legacy permission docs.
 */
export async function migrateLegacyPermissions() {
  try {
    for (const [legacyId, canonicalId] of Object.entries(PERMISSION_LEGACY_ALIAS_MAP)) {
      const legacyPerm = await Permission.findById(legacyId).lean();
      if (legacyPerm) {
        // Ensure the canonical permission exists
        const canonicalExists = await Permission.exists({ _id: canonicalId });
        if (!canonicalExists) {
          await Permission.create({
            _id: canonicalId,
            name: legacyPerm.name || canonicalId,
            module: legacyPerm.module || 'System',
            action: legacyPerm.action || 'MANAGE',
            description: legacyPerm.description || `Migrated canonical permission for ${canonicalId}`,
            isActive: legacyPerm.isActive !== undefined ? legacyPerm.isActive : true
          });
        }

        // Update all roles that currently reference legacyId
        const rolesWithLegacy = await Role.find({ permissionIds: legacyId });
        for (const role of rolesWithLegacy) {
          const updatedIds = role.permissionIds.map((id) => (id === legacyId ? canonicalId : id));
          const uniqueIds = [...new Set(updatedIds)];
          await Role.updateOne({ _id: role._id }, { permissionIds: uniqueIds });
        }

        // Remove the legacy duplicate permission doc
        await Permission.deleteOne({ _id: legacyId });
        logActivity('rbac.permission.migrated', { from: legacyId, to: canonicalId });
      }
    }
  } catch (error) {
    console.error('Error migrating legacy permissions:', error);
  }
}
