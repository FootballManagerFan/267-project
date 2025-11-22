const express = require('express');
const pool = require('../config/db');
const tableConfig = require('../config/tableConfig');
const { ensureAuthenticated, ensureRoles } = require('../middleware/auth');
const { buildPayload, pickValue } = require('../utils/request');

const router = express.Router();
const courseConfig = tableConfig.courses;
const offeringConfig = tableConfig.courseOfferings;

router.use(ensureAuthenticated);

const fetchReferenceData = () =>
  Promise.all([
    pool.query('SELECT departmentID, deptName FROM Department ORDER BY deptName ASC'),
    pool.query('SELECT professorID, firstName, lastName FROM Professor ORDER BY lastName ASC'),
    pool.query('SELECT courseID, courseName FROM Course ORDER BY courseName ASC')
  ]);

router.get('/', async (req, res) => {
  try {
    const [[courseRows], [offeringRows], referenceData] = await Promise.all([
      pool.query(`
        SELECT c.*, d.deptName AS department_name
        FROM ${courseConfig.tableName} c
        LEFT JOIN Department d ON d.departmentID = c.departmentID
        ORDER BY c.${courseConfig.primaryKey} DESC
      `),
      pool.query(`
        SELECT co.*,
               c.courseName,
               c.credits,
               p.firstName,
               p.lastName,
               COALESCE(co.capacity - COUNT(e.enrollmentID), co.capacity) AS seats_available
        FROM ${offeringConfig.tableName} co
        INNER JOIN Course c ON c.courseID = co.courseID
        LEFT JOIN Professor p ON p.professorID = co.professorID
        LEFT JOIN Enrollment e ON e.offeringID = co.offeringID
        GROUP BY co.offeringID
        ORDER BY seats_available DESC, co.offeringID DESC
      `),
      fetchReferenceData()
    ]);

    const [[departmentRows], [professorRows], [courseRefs]] = referenceData;

    res.render('courses', {
      title: 'Courses & Offerings',
      courseFields: courseConfig.fields,
      offeringFields: offeringConfig.fields,
      courses: courseRows,
      offerings: offeringRows,
      departments: departmentRows,
      professors: professorRows,
      courseOptions: courseRefs
    });
  } catch (error) {
    console.error('Courses page error:', error);
    req.flash('error', 'Unable to load course data.');
    res.redirect('/dashboard');
  }
});

const createRecord = async (config, payload) => {
  const fields = config.fields.filter((field) => !field.auto);
  const missing = fields.filter((field) => field.required && !payload[field.name]);
  if (missing.length) {
    return { error: `Missing required fields: ${missing.map((f) => f.label).join(', ')}` };
  }

  const columns = fields.map((field) => field.name).join(', ');
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((field) => payload[field.name] ?? null);
  await pool.query(`INSERT INTO ${config.tableName} (${columns}) VALUES (${placeholders})`, values);
  return { success: true };
};

const updateRecord = async (config, recordId, payload) => {
  const updatableFields = config.fields.filter(
    (field) => !field.auto && field.name !== config.primaryKey
  );

  const fieldsToUpdate = updatableFields.filter((field) => payload[field.name] !== undefined);
  if (!fieldsToUpdate.length) {
    return { error: 'No fields provided for update.' };
  }

  const assignments = fieldsToUpdate.map((field) => `${field.name} = ?`).join(', ');
  const values = fieldsToUpdate.map((field) => payload[field.name]);

  await pool.query(
    `UPDATE ${config.tableName} SET ${assignments} WHERE ${config.primaryKey} = ?`,
    [...values, recordId]
  );
  return { success: true };
};

router.post('/create', ensureRoles(['manager', 'admin']), async (req, res) => {
  const payload = buildPayload(
    req,
    courseConfig.fields.filter((field) => !field.auto).map((field) => field.name)
  );

  try {
    const result = await createRecord(courseConfig, payload);
    if (result.error) {
      req.flash('error', result.error);
    } else {
      req.flash('success', 'Course created successfully.');
    }
  } catch (error) {
    console.error('Create course error:', error);
    req.flash('error', 'Unable to create course.');
  }
  return res.redirect('/courses');
});

router.post('/update', ensureRoles(['manager', 'admin']), async (req, res) => {
  const recordId = pickValue(req, courseConfig.primaryKey);
  if (!recordId) {
    req.flash('error', 'Missing course identifier.');
    return res.redirect('/courses');
  }

  const payload = buildPayload(
    req,
    courseConfig.fields
      .filter((field) => !field.auto && field.name !== courseConfig.primaryKey)
      .map((field) => field.name)
  );

  try {
    const result = await updateRecord(courseConfig, recordId, payload);
    if (result.error) {
      req.flash('error', result.error);
    } else {
      req.flash('success', 'Course updated successfully.');
    }
  } catch (error) {
    console.error('Update course error:', error);
    req.flash('error', 'Unable to update course.');
  }
  return res.redirect('/courses');
});

router.post('/delete/:id', ensureRoles(['admin']), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM ${courseConfig.tableName} WHERE ${courseConfig.primaryKey} = ?`,
      [req.params.id]
    );
    req.flash('success', 'Course removed.');
  } catch (error) {
    console.error('Delete course error:', error);
    req.flash('error', 'Unable to delete course. Remove related offerings first.');
  }
  return res.redirect('/courses');
});

router.post('/offerings/create', ensureRoles(['manager', 'admin']), async (req, res) => {
  const payload = buildPayload(
    req,
    offeringConfig.fields.filter((field) => !field.auto).map((field) => field.name)
  );

  try {
    const result = await createRecord(offeringConfig, payload);
    if (result.error) {
      req.flash('error', result.error);
    } else {
      req.flash('success', 'Course offering created successfully.');
    }
  } catch (error) {
    console.error('Create offering error:', error);
    req.flash('error', 'Unable to create course offering.');
  }
  return res.redirect('/courses');
});

router.post('/offerings/update', ensureRoles(['manager', 'admin']), async (req, res) => {
  const recordId = pickValue(req, offeringConfig.primaryKey);
  if (!recordId) {
    req.flash('error', 'Missing offering identifier.');
    return res.redirect('/courses');
  }

  const payload = buildPayload(
    req,
    offeringConfig.fields
      .filter((field) => !field.auto && field.name !== offeringConfig.primaryKey)
      .map((field) => field.name)
  );

  try {
    const result = await updateRecord(offeringConfig, recordId, payload);
    if (result.error) {
      req.flash('error', result.error);
    } else {
      req.flash('success', 'Offering updated successfully.');
    }
  } catch (error) {
    console.error('Update offering error:', error);
    req.flash('error', 'Unable to update offering.');
  }
  return res.redirect('/courses');
});

router.post('/offerings/delete/:id', ensureRoles(['admin']), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM ${offeringConfig.tableName} WHERE ${offeringConfig.primaryKey} = ?`,
      [req.params.id]
    );
    req.flash('success', 'Offering removed.');
  } catch (error) {
    console.error('Delete offering error:', error);
    req.flash('error', 'Unable to delete offering.');
  }
  return res.redirect('/courses');
});

module.exports = router;

