// Usage: router.get('/', protect, allowRoles('super_admin', 'admin'), controllerFn)
const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error("Not authorized");
    }
    // super_admin always has full access
    if (req.user.role === "super_admin" || roles.includes(req.user.role)) {
      return next();
    }
    res.status(403);
    throw new Error(`Role '${req.user.role}' is not permitted to access this resource`);
  };
};

// Fine-grained: checks the per-module permission map set by Super Admin
// Usage: checkPermission('ledger', 'edit')
const checkPermission = (moduleName, action) => {
  return (req, res, next) => {
    if (req.user.role === "super_admin") return next();

    const modulePerms = req.user.permissions?.get?.(moduleName);
    if (modulePerms && modulePerms[action]) return next();

    res.status(403);
    throw new Error(`You do not have '${action}' permission on '${moduleName}'`);
  };
};

module.exports = { allowRoles, checkPermission };
