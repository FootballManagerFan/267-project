const express = require('express');
const pool = require('../config/db');
const tableConfig = require('../config/tableConfig');
const { ensureAuthenticated, ensureRoles } = require('../middleware/auth');
const { buildPayload, pickValue } = require('../utils/request');

const router = express.Router();
const config = tableConfig.departments;

router.use(ensureAuthenticated);

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM ${config.tableName} ORDER BY ${config.primaryKey} DESC`);
    res.render('departments', {
      title: 'Departments',
      fields: config.fields,
      items: rows
    });
  } catch (error) {
    console.error('Departments list error:', error);
    req.flash('error', 'Unable to load departments.');
    res.redirect('/dashboard');
  }
});

router.post('/create', ensureRoles(['manager', 'admin']), async (req, res) => {
  const insertFields = config.fields.filter((field) => !field.auto);
  const payload = buildPayload(
    req,
    insertFields.map((field) => field.name)
  );

  const missingFields = insertFields.filter((field) => field.required && !payload[field.name]);
  if (missingFields.length) {
    req.flash('error', `Missing required fields: ${missingFields.map((f) => f.label).join(', ')}`);
    return res.redirect('/departments');
  }

  const columns = insertFields.map((field) => field.name).join(', ');
  const placeholders = insertFields.map(() => '?').join(', ');
  const values = insertFields.map((field) => payload[field.name] ?? null);

  try {
    await pool.query(`INSERT INTO ${config.tableName} (${columns}) VALUES (${placeholders})`, values);
    req.flash('success', 'Department created successfully.');
  } catch (error) {
    console.error('Create department error:', error);
    req.flash('error', 'Unable to create department.');
  }
  return res.redirect('/departments');
});

router.post('/update', ensureRoles(['manager', 'admin']), async (req, res) => {
  const recordId = pickValue(req, config.primaryKey);
  if (!recordId) {
    req.flash('error', 'Missing department identifier.');
    return res.redirect('/departments');
  }

  const updatableFields = config.fields.filter(
    (field) => !field.auto && field.name !== config.primaryKey
  );
  const payload = buildPayload(
    req,
    updatableFields.map((field) => field.name)
  );

  if (!Object.keys(payload).length) {
    req.flash('error', 'No fields provided for update.');
    return res.redirect('/departments');
  }

  const fieldsToUpdate = updatableFields.filter((field) => payload[field.name] !== undefined);
  const assignments = fieldsToUpdate.map((field) => `${field.name} = ?`).join(', ');
  const values = fieldsToUpdate.map((field) => payload[field.name]);

  try {
    await pool.query(
      `UPDATE ${config.tableName} SET ${assignments} WHERE ${config.primaryKey} = ?`,
      [...values, recordId]
    );
    req.flash('success', 'Department updated successfully.');
  } catch (error) {
    console.error('Update department error:', error);
    req.flash('error', 'Unable to update department.');
  }
  return res.redirect('/departments');
});

router.post('/delete/:id', ensureRoles(['admin']), async (req, res) => {
  const recordId = req.params.id;

  try {
    await pool.query(`DELETE FROM ${config.tableName} WHERE ${config.primaryKey} = ?`, [recordId]);
    req.flash('success', 'Department removed.');
  } catch (error) {
    console.error('Delete department error:', error);
    req.flash('error', 'Unable to delete department. Ensure it is not referenced elsewhere.');
  }
  return res.redirect('/departments');
});

module.exports = router;

