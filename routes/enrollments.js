const express = require('express');
const pool = require('../config/db');
const tableConfig = require('../config/tableConfig');
const { ensureAuthenticated, ensureRoles } = require('../middleware/auth');
const { buildPayload, pickValue } = require('../utils/request');

const router = express.Router();
const config = tableConfig.enrollments;
const offeringConfig = tableConfig.courseOfferings;
const enrollmentOfferingField =
  config.fields.find((field) => field.name.toLowerCase().includes('offering'))?.name || 'offeringID';
const enrollmentStudentField =
  config.fields.find((field) => field.name.toLowerCase().includes('student'))?.name || 'studentID';

router.use(ensureAuthenticated);

const fetchEnrollmentData = () =>
  Promise.all([
    pool.query(`
      SELECT e.*,
             s.firstName,
             s.lastName,
             co.semester,
             co.year,
             c.courseName,
             COALESCE(co.capacity - seat_counts.total_enrolled, co.capacity) AS seats_available
      FROM ${config.tableName} e
      INNER JOIN Student s ON s.${tableConfig.students.primaryKey} = e.${enrollmentStudentField}
      INNER JOIN ${offeringConfig.tableName} co ON co.${offeringConfig.primaryKey} = e.${enrollmentOfferingField}
      INNER JOIN Course c ON c.${tableConfig.courses.primaryKey} = co.courseID
      LEFT JOIN (
        SELECT ${enrollmentOfferingField} AS offeringRef, COUNT(${config.primaryKey}) AS total_enrolled
        FROM ${config.tableName}
        GROUP BY ${enrollmentOfferingField}
      ) AS seat_counts ON seat_counts.offeringRef = co.${offeringConfig.primaryKey}
      ORDER BY e.${config.primaryKey} DESC
    `),
    pool.query('SELECT studentID, firstName, lastName FROM Student ORDER BY lastName ASC'),
    pool.query(`
      SELECT co.${offeringConfig.primaryKey} AS offeringID,
             c.courseName,
             co.semester,
             co.year,
             co.capacity,
             COALESCE(co.capacity - COUNT(e.${config.primaryKey}), co.capacity) AS seats_available
      FROM ${offeringConfig.tableName} co
      INNER JOIN Course c ON c.${tableConfig.courses.primaryKey} = co.courseID
      LEFT JOIN ${config.tableName} e ON e.${enrollmentOfferingField} = co.${offeringConfig.primaryKey}
      GROUP BY co.${offeringConfig.primaryKey}
      ORDER BY seats_available DESC
    `)
  ]);

router.get('/', async (req, res) => {
  try {
    const [[enrollments], [students], [offerings]] = await fetchEnrollmentData();
    res.render('enrollments', {
      title: 'Enrollments',
      fields: config.fields,
      enrollments,
      students,
      offerings
    });
  } catch (error) {
    console.error('Enrollments list error:', error);
    req.flash('error', 'Unable to load enrollments.');
    res.redirect('/dashboard');
  }
});

const checkCapacity = async (offeringId) => {
  const [rows] = await pool.query(
    `
      SELECT
        co.capacity,
        COALESCE(COUNT(e.${config.primaryKey}), 0) AS total_enrolled
      FROM ${offeringConfig.tableName} co
      LEFT JOIN ${config.tableName} e ON e.${enrollmentOfferingField} = co.${offeringConfig.primaryKey}
      WHERE co.${offeringConfig.primaryKey} = ?
      GROUP BY co.${offeringConfig.primaryKey}
    `,
    [offeringId]
  );

  if (!rows.length) {
    return { error: 'Offering not found.' };
  }

  const { capacity, total_enrolled: totalEnrolled } = rows[0];
  if (Number(totalEnrolled) >= Number(capacity)) {
    return { error: 'Course offering is full. Please pick another section.' };
  }

  return { success: true };
};

router.post('/create', ensureRoles(['manager', 'admin']), async (req, res) => {
  const insertFields = config.fields.filter((field) => !field.auto);
  const payload = buildPayload(
    req,
    insertFields.map((field) => field.name)
  );

  const missing = insertFields.filter((field) => field.required && !payload[field.name]);
  if (missing.length) {
    req.flash('error', `Missing required fields: ${missing.map((f) => f.label).join(', ')}`);
    return res.redirect('/enrollments');
  }

  try {
    const capacityCheck = await checkCapacity(payload[enrollmentOfferingField]);
    if (capacityCheck.error) {
      req.flash('error', capacityCheck.error);
      return res.redirect('/enrollments');
    }

    const columns = insertFields.map((field) => field.name).join(', ');
    const placeholders = insertFields.map(() => '?').join(', ');
    const values = insertFields.map((field) => payload[field.name] ?? null);

    await pool.query(`INSERT INTO ${config.tableName} (${columns}) VALUES (${placeholders})`, values);
    req.flash('success', 'Student enrolled successfully.');
  } catch (error) {
    console.error('Create enrollment error:', error);
    req.flash('error', 'Unable to create enrollment.');
  }
  return res.redirect('/enrollments');
});

router.post('/update', ensureRoles(['manager', 'admin']), async (req, res) => {
  const recordId = pickValue(req, config.primaryKey);
  if (!recordId) {
    req.flash('error', 'Missing enrollment identifier.');
    return res.redirect('/enrollments');
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
    return res.redirect('/enrollments');
  }

  const fieldsToUpdate = updatableFields.filter((field) => payload[field.name] !== undefined);
  const assignments = fieldsToUpdate.map((field) => `${field.name} = ?`).join(', ');
  const values = fieldsToUpdate.map((field) => payload[field.name]);

  try {
    await pool.query(
      `UPDATE ${config.tableName} SET ${assignments} WHERE ${config.primaryKey} = ?`,
      [...values, recordId]
    );
    req.flash('success', 'Enrollment updated successfully.');
  } catch (error) {
    console.error('Update enrollment error:', error);
    req.flash('error', 'Unable to update enrollment.');
  }
  return res.redirect('/enrollments');
});

router.post('/delete/:id', ensureRoles(['admin']), async (req, res) => {
  try {
    await pool.query(`DELETE FROM ${config.tableName} WHERE ${config.primaryKey} = ?`, [
      req.params.id
    ]);
    req.flash('success', 'Enrollment deleted.');
  } catch (error) {
    console.error('Delete enrollment error:', error);
    req.flash('error', 'Unable to delete enrollment.');
  }
  return res.redirect('/enrollments');
});

module.exports = router;

