const ensureAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Please sign in to continue.');
    return res.redirect('/login');
  }
  return next();
};

const ensureRoles = (allowedRoles = []) => (req, res, next) => {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Please sign in to continue.');
    return res.redirect('/login');
  }

  const { role } = req.session.user;
  if (!allowedRoles.length || allowedRoles.includes(role)) {
    return next();
  }

  req.flash('error', 'You do not have permission to perform this action.');
  return res.redirect(req.headers.referer || '/dashboard');
};

module.exports = {
  ensureAuthenticated,
  ensureRoles
};

