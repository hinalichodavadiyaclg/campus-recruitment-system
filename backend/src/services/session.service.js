import { User } from '../models/user.model.js';
import { UserSession } from '../models/user-session.model.js';

function serialiseSession(session) {
  const user = session.userId && typeof session.userId === 'object' ? session.userId : null;
  const now = new Date();
  let status = 'LOGGED_OUT';
  if (session.isActive && session.expiresAt > now) status = 'ACTIVE';
  if (session.expiresAt <= now) status = 'EXPIRED';
  return {
    _id: String(session._id),
    user: user
      ? {
          _id: String(user._id),
          email: user.email,
          userType: user.userType,
          roleId: user.roleId,
          accountStatus: user.accountStatus,
          universityId: user.universityId,
          employeeId: user.employeeId
        }
      : null,
    loginAt: session.loginAt,
    lastActivityAt: session.lastActivityAt,
    expiresAt: session.expiresAt,
    logoutAt: session.logoutAt,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    isActive: session.isActive,
    status
  };
}

export async function listSessions({ page, limit, userId, userType, status, dateFrom, dateTo }) {
  const query = {};
  if (userId) query.userId = userId;
  if (userType) {
    const users = await User.find({ userType }).select('_id').lean();
    query.userId = userId ? userId : { $in: users.map((user) => user._id) };
  }
  if (dateFrom || dateTo) {
    query.loginAt = {};
    if (dateFrom) query.loginAt.$gte = new Date(dateFrom);
    if (dateTo) query.loginAt.$lte = new Date(dateTo);
  }
  const now = new Date();
  if (status === 'ACTIVE') Object.assign(query, { isActive: true, expiresAt: { $gt: now } });
  if (status === 'EXPIRED') query.expiresAt = { $lte: now };
  if (status === 'LOGGED_OUT') Object.assign(query, { isActive: false, logoutAt: { $exists: true } });

  const [sessions, total] = await Promise.all([
    UserSession.find(query)
      .sort({ loginAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: 'userId', select: 'email userType roleId accountStatus universityId employeeId' })
      .lean(),
    UserSession.countDocuments(query)
  ]);
  return { items: sessions.map(serialiseSession), page, limit, total };
}
