const WorkspaceMember = require('../models/WorkspaceMember');

/**
 * Middleware to check if user has required role in workspace
 * @param {Array<String>} allowedRoles - Array of allowed roles: ['OWNER', 'ADMIN', 'REGULAR_USER']
 * @returns {Function} Express middleware function
 */
const requireRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            const { id: workspaceId } = req.params;
            const userId = req.userId; // Fixed: accessing req.userId directly (set by auth middleware)

            // Start Debug
            console.log(`[Auth] Middleware invoked. Params:`, req.params);
            console.log(`[Auth] User ID from token:`, userId);
            console.log(`[Auth] Target Workspace ID:`, workspaceId);

            // Validate IDs
            if (!workspaceId || !userId) {
                console.error('[Auth] ❌ Missing workspaceId or userId');
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Missing workspace ID or user ID'
                });
            }

            // Find user's membership in workspace
            const member = await WorkspaceMember.findOne({
                workspaceId,
                userId
            });

            if (!member) {
                console.error(`[Auth] ❌ Membership not found for User: ${userId} in Workspace: ${workspaceId}`);
                // Debug: Check if any member exists for this workspace?
                const anyMember = await WorkspaceMember.findOne({ workspaceId });
                console.log(`[Auth] Debug validation: Any member in workspace? ${anyMember ? 'Yes' : 'No'}`);

                return res.status(403).json({
                    success: false,
                    error: 'Akses ditolak',
                    message: 'Anda bukan anggota workspace ini. (Membership not found)'
                });
            }

            // Start Debug Log
            console.log(`[Auth] Checking role for user ${userId} in workspace ${workspaceId}. Required: ${allowedRoles}, Actual: ${member.role}`);

            // Check if user's role is in allowed roles (case-insensitive)
            const memberRole = member.role ? member.role.toUpperCase() : '';
            const allowedRolesUpper = allowedRoles.map(r => r.toUpperCase());

            if (!allowedRolesUpper.includes(memberRole)) {
                console.log(`[Auth] ❌ Role mismatch. Denied.`);
                return res.status(403).json({
                    success: false,
                    error: 'Akses ditolak',
                    message: `Anda tidak memiliki izin untuk melakukan aksi ini. Role anda: ${member.role}`
                });
            }

            console.log(`[Auth] ✅ Role authorized.`);

            // Attach member info to request for use in controllers
            req.member = member;
            next();
        } catch (error) {
            console.error('[Authorization] Error checking role:', error);
            res.status(500).json({
                success: false,
                error: 'Server error',
                message: 'Terjadi kesalahan saat memeriksa izin.'
            });
        }
    };
};

/**
 * Middleware to check if user has specific permission
 * OWNER always has all permissions
 * ADMIN must have the specific permission in their permissions array
 * REGULAR_USER is denied by default
 * 
 * @param {String} permission - Required permission e.g., 'ADD_DEVICE', 'INVITE_MEMBERS'
 * @returns {Function} Express middleware function
 */
const requirePermission = (permission) => {
    return async (req, res, next) => {
        try {
            // Support both :id and :workspaceId parameter names
            const workspaceId = req.params.id || req.params.workspaceId;
            const userId = req.userId; // Fixed: accessing req.userId directly

            if (!workspaceId) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Missing workspace ID'
                });
            }

            // Find user's membership
            const member = await WorkspaceMember.findOne({
                workspaceId,
                userId
            });

            if (!member) {
                return res.status(403).json({
                    success: false,
                    error: 'Akses ditolak',
                    message: 'Anda bukan anggota workspace ini.'
                });
            }

            // OWNER has all permissions
            if (member.role === 'OWNER') {
                req.member = member;
                return next();
            }

            // ADMIN must have the specific permission
            if (member.role === 'ADMIN' && member.permissions.includes(permission)) {
                req.member = member;
                return next();
            }

            // REGULAR_USER or ADMIN without permission - denied
            return res.status(403).json({
                success: false,
                error: 'Akses ditolak',
                message: `Anda tidak memiliki izin ${permission} untuk melakukan aksi ini.`
            });
        } catch (error) {
            console.error('[Authorization] Error checking permission:', error);
            res.status(500).json({
                success: false,
                error: 'Server error',
                message: 'Terjadi kesalahan saat memeriksa izin.'
            });
        }
    };
};

/**
 * Middleware to ensure only workspace owner can perform action
 * Used for critical actions like deleting workspace
 */
const requireOwner = () => {
    return requireRole(['OWNER']);
};

module.exports = {
    requireRole,
    requirePermission,
    requireOwner
};
