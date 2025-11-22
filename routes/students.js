const express = require('express');
const pool = require('../config/db');
const tableConfig = require('../config/tableConfig');
const { ensureAuthenticated, ensureRoles } = require('../middleware/auth');
const { buildPayload, pickValue } = require('../utils/request');

const router = express.Router();
const config = tableConfig.students;

router.use(ensureAuthenticated);

router.get('/', async (req, res) => {
  try {
    const [[studentRows], [enrollmentStats]] = await Promise.all([
      pool.query(`SELECT * FROM ${config.tableName} ORDER BY ${config.primaryKey} DESC`),
      pool.query(`
        SELECT s.studentID,
               s.firstName,
               s.lastName,
               COUNT(e.enrollmentID) AS total_enrollments
        FROM Student s
        LEFT JOIN Enrollment e ON e.studentID = s.studentID
        GROUP BY s.studentID
      `)
    ]);

    const enrollmentMap = new Map(
      enrollmentStats.map((row) => [row.studentID, row.total_enrollments])
    );

    const students = studentRows.map((student) => ({
      ...student,
      total_enrollments: enrollmentMap.get(student.studentID) || 0
    }));

    res.render('students', {
      title: 'Students',
      fields: config.fields,
      items: students
    });
  } catch (error) {
    console.error('Students list error:', error);
    req.flash('error', 'Unable to load students.');
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
    return res.redirect('/students');
  }

  const columns = insertFields.map((field) => field.name).join(', ');
  const placeholders = insertFields.map(() => '?').join(', ');
  const values = insertFields.map((field) => payload[field.name] ?? null);

  try {
    await pool.query(`INSERT INTO ${config.tableName} (${columns}) VALUES (${placeholders})`, values);
    req.flash('success', 'Student added successfully.');
  } catch (error) {
    console.error('Create student error:', error);
    req.flash('error', 'Unable to add student.');
  }
  return res.redirect('/students');
});

router.post('/update', ensureRoles(['manager', 'admin']), async (req, res) => {
  const recordId = pickValue(req, config.primaryKey);
  if (!recordId) {
    req.flash('error', 'Missing student identifier.');
    return res.redirect('/students');
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
    return res.redirect('/students');
  }

  const fieldsToUpdate = updatableFields.filter((field) => payload[field.name] !== undefined);
  const assignments = fieldsToUpdate.map((field) => `${field.name} = ?`).join(', ');
  const values = fieldsToUpdate.map((field) => payload[field.name]);

  try {
    await pool.query(
      `UPDATE ${config.tableName} SET ${assignments} WHERE ${config.primaryKey} = ?`,
      [...values, recordId]
    );
    req.flash('success', 'Student updated successfully.');
  } catch (error) {
    console.error('Update student error:', error);
    req.flash('error', 'Unable to update student.');
  }
  return res.redirect('/students');
});

router.post('/delete/:id', ensureRoles(['admin']), async (req, res) => {
  try {
    await pool.query(`DELETE FROM ${config.tableName} WHERE ${config.primaryKey} = ?`, [
      req.params.id
    ]);
    req.flash('success', 'Student removed.');
  } catch (error) {
    console.error('Delete student error:', error);
    req.flash('error', 'Unable to delete student. Remove related enrollments first.');
  }
  return res.redirect('/students');
});

module.exports = router;

