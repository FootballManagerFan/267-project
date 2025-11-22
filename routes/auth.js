const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ensureAuthenticated } = require('../middleware/auth');
const { pickValue } = require('../utils/request');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.render('login', { title: 'Sign In' });
});

router.post('/login', async (req, res) => {
  const username = pickValue(req, 'username');
  const password = pickValue(req, 'password');

  if (!username || !password) {
    req.flash('error', 'Username and password are required.');
    return res.redirect('/login');
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password_hash, role FROM Users WHERE username = ?',
      [username]
    );

    if (!rows.length) {
      req.flash('error', 'Invalid credentials.');
      return res.redirect('/login');
    }

    const user = rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      req.flash('error', 'Invalid credentials.');
      return res.redirect('/login');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };
    req.flash('success', `Welcome back, ${user.username}!`);
    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    req.flash('error', 'Unable to login right now.');
    return res.redirect('/login');
  }
});

const destroySession = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
};

router.post('/logout', ensureAuthenticated, destroySession);
router.get('/logout', ensureAuthenticated, destroySession);

module.exports = router;

