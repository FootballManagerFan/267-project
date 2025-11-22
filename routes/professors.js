const express = require('express');
const pool = require('../config/db');
const tableConfig = require('../config/tableConfig');
const { ensureAuthenticated, ensureRoles } = require('../middleware/auth');
const { buildPayload, pickValue } = require('../utils/request');

const router = express.Router();
const config = tableConfig.professors;
const departmentConfig = tableConfig.departments;
const professorDepartmentField =
  config.fields.find((field) => field.name.toLowerCase().includes('department'))?.name ||
  'departmentID';

router.use(ensureAuthenticated);

const fetchDepartments = () =>
  pool.query(
    `SELECT ${departmentConfig.primaryKey} AS departmentID, deptName FROM ${departmentConfig.tableName} ORDER BY deptName ASC`
  );

router.get('/', async (req, res) => {
  try {
    const [[professorRows], [departmentRows]] = await Promise.all([
      pool.query(`
        SELECT p.*, d.deptName AS department_name
        FROM ${config.tableName} p
        LEFT JOIN ${departmentConfig.tableName} d ON d.${departmentConfig.primaryKey} = p.${professorDepartmentField}
        ORDER BY p.${config.primaryKey} DESC
      `),
      fetchDepartments()
    ]);

    res.render('professors', {
      title: 'Professors',
      fields: config.fields,
      items: professorRows,
      departments: departmentRows
    });
  } catch (error) {
    console.error('Professors list error:', error);
    req.flash('error', 'Unable to load professors.');
    res.redirect('/dashboard');
  }
});

router.post('/create', ensureRoles(['manager', 'admin']), async (req, res) => {
  const insertFields = config.fields.filter((field) => !field.auto);
  const payload = buildPayload(
    req,
    insertFields.map((field) => field.name)
  );

  const missing = insertFields.filter((field) => field.required && !payload[field.name]);
  if (missing.length) {
    req.flash('error', `Missing required fields: ${missing.map((f) => f.label).join(', ')}`);
    return res.redirect('/professors');
  }

  const columns = insertFields.map((field) => field.name).join(', ');
  const placeholders = insertFields.map(() => '?').join(', ');
  const values = insertFields.map((field) => payload[field.name] ?? null);

  try {
    await pool.query(`INSERT INTO ${config.tableName} (${columns}) VALUES (${placeholders})`, values);
    req.flash('success', 'Professor added successfully.');
  } catch (error) {
    console.error('Create professor error:', error);
    req.flash('error', 'Unable to add professor.');
  }
  return res.redirect('/professors');
});

router.post('/update', ensureRoles(['manager', 'admin']), async (req, res) => {
  const recordId = pickValue(req, config.primaryKey);
  if (!recordId) {
    req.flash('error', 'Missing professor identifier.');
    return res.redirect('/professors');
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
    return res.redirect('/professors');
  }

  const fieldsToUpdate = updatableFields.filter((field) => payload[field.name] !== undefined);
  const assignments = fieldsToUpdate.map((field) => `${field.name} = ?`).join(', ');
  const values = fieldsToUpdate.map((field) => payload[field.name]);

  try {
    await pool.query(
      `UPDATE ${config.tableName} SET ${assignments} WHERE ${config.primaryKey} = ?`,
      [...values, recordId]
    );
    req.flash('success', 'Professor updated successfully.');
  } catch (error) {
    console.error('Update professor error:', error);
    req.flash('error', 'Unable to update professor.');
  }
  return res.redirect('/professors');
});

router.post('/delete/:id', ensureRoles(['admin']), async (req, res) => {
  try {
    await pool.query(`DELETE FROM ${config.tableName} WHERE ${config.primaryKey} = ?`, [
      req.params.id
    ]);
    req.flash('success', 'Professor removed.');
  } catch (error) {
    console.error('Delete professor error:', error);
    req.flash('error', 'Unable to delete professor. Remove related offerings first.');
  }
  return res.redirect('/professors');
});

module.exports = router;

