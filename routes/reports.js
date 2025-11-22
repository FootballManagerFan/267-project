const express = require('express');
const pool = require('../config/db');
const { ensureAuthenticated, ensureRoles } = require('../middleware/auth');
const { pickValue } = require('../utils/request');

const router = express.Router();

const aggregateQueries = {
  availableCourses: `
    SELECT co.offeringID,
           c.courseName,
           co.semester,
           co.year,
           co.capacity,
           COALESCE(co.capacity - COUNT(e.enrollmentID), co.capacity) AS seats_available
    FROM CourseOffering co
    INNER JOIN Course c ON c.courseID = co.courseID
    LEFT JOIN Enrollment e ON e.offeringID = co.offeringID
    GROUP BY co.offeringID
    HAVING seats_available > 0
    ORDER BY seats_available DESC
  `,
  studentsPerCourse: `
    SELECT c.courseName,
           COUNT(e.enrollmentID) AS total_students,
           COUNT(DISTINCT e.studentID) AS unique_students
    FROM Course c
    LEFT JOIN CourseOffering co ON co.courseID = c.courseID
    LEFT JOIN Enrollment e ON e.offeringID = co.offeringID
    GROUP BY c.courseID
    ORDER BY total_students DESC, c.courseName ASC
  `,
  enrollmentPatterns: `
    SELECT s.studentID,
           CONCAT(s.firstName, ' ', s.lastName) AS student_name,
           COUNT(e.enrollmentID) AS total_enrollments,
           GROUP_CONCAT(DISTINCT CONCAT(co.semester, ' ', co.year) ORDER BY co.year DESC SEPARATOR ', ') AS terms
    FROM Student s
    LEFT JOIN Enrollment e ON e.studentID = s.studentID
    LEFT JOIN CourseOffering co ON co.offeringID = e.offeringID
    GROUP BY s.studentID
    ORDER BY total_enrollments DESC
    LIMIT 25
  `,
  departmentStats: `
    SELECT d.departmentID,
           d.deptName,
           COALESCE(course_counts.total_courses, 0) AS total_courses,
           COALESCE(prof_counts.total_professors, 0) AS total_professors,
           COALESCE(student_counts.total_students, 0) AS total_students
    FROM Department d
    LEFT JOIN (
      SELECT departmentID, COUNT(*) AS total_courses
      FROM Course
      GROUP BY departmentID
    ) AS course_counts ON course_counts.departmentID = d.departmentID
    LEFT JOIN (
      SELECT departmentID, COUNT(*) AS total_professors
      FROM Professor
      GROUP BY departmentID
    ) AS prof_counts ON prof_counts.departmentID = d.departmentID
    LEFT JOIN (
      SELECT major, COUNT(*) AS total_students
      FROM Student
      GROUP BY major
    ) AS student_counts ON student_counts.major = d.departmentID
    ORDER BY d.deptName ASC
  `
};

router.use(ensureAuthenticated);
router.use(ensureRoles(['manager', 'admin']));

router.get('/', async (req, res) => {
  try {
    const [
      [availableCourses],
      [studentsPerCourse],
      [enrollmentPatterns],
      [departmentStats],
      [views],
      [snapshots]
    ] = await Promise.all([
      pool.query(aggregateQueries.availableCourses),
      pool.query(aggregateQueries.studentsPerCourse),
      pool.query(aggregateQueries.enrollmentPatterns),
      pool.query(aggregateQueries.departmentStats),
      pool.query(
        `
        SELECT table_name AS name,
               view_definition
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE table_schema = DATABASE()
        ORDER BY table_name
      `
      ),
      pool.query('SELECT * FROM ReportSnapshots ORDER BY created_at DESC LIMIT 25')
    ]);

    const parsedSnapshots = snapshots.map((snapshot) => ({
      ...snapshot,
      payload:
        typeof snapshot.payload === 'string'
          ? JSON.parse(snapshot.payload)
          : snapshot.payload
    }));

    const customResults = req.session.customResults || null;
    delete req.session.customResults;

    res.render('reports', {
      title: 'Reports & Insights',
      availableCourses,
      studentsPerCourse,
      enrollmentPatterns,
      departmentStats,
      dbViews: views,
      snapshots: parsedSnapshots,
      customResults
    });
  } catch (error) {
    console.error('Reports page error:', error);
    req.flash('error', 'Unable to load reports right now.');
    res.redirect('/dashboard');
  }
});

router.post('/query', async (req, res) => {
  const sql = pickValue(req, 'sql');
  if (!sql) {
    req.flash('error', 'Provide a SQL statement to run.');
    return res.redirect('/reports');
  }

  const trimmed = sql.trim();
  if (!/^select|^with/i.test(trimmed)) {
    req.flash('error', 'Only SELECT statements are allowed.');
    return res.redirect('/reports');
  }

  try {
    const [rows] = await pool.query(trimmed);
    const columns = rows.length ? Object.keys(rows[0]) : [];
    req.session.customResults = { columns, rows };
    req.flash('success', 'Query executed successfully.');
  } catch (error) {
    console.error('Custom query error:', error);
    req.flash('error', 'Unable to execute query. Please verify syntax.');
  }
  return res.redirect('/reports');
});

router.post('/views/create', async (req, res) => {
  const name = pickValue(req, 'view_name');
  const definition = pickValue(req, 'view_definition');

  if (!name || !definition) {
    req.flash('error', 'View name and definition are required.');
    return res.redirect('/reports');
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    req.flash('error', 'View name must be alphanumeric (underscores allowed).');
    return res.redirect('/reports');
  }

  if (!/^select|^with/i.test(definition.trim())) {
    req.flash('error', 'View definition must be a SELECT statement.');
    return res.redirect('/reports');
  }

  try {
    await pool.query(`CREATE OR REPLACE VIEW \`${name}\` AS ${definition}`);
    req.flash('success', `View ${name} created successfully.`);
  } catch (error) {
    console.error('Create view error:', error);
    req.flash('error', 'Unable to create view.');
  }
  return res.redirect('/reports');
});

router.post('/views/delete/:name', async (req, res) => {
  const viewName = req.params.name;
  try {
    await pool.query(`DROP VIEW IF EXISTS \`${viewName}\``);
    req.flash('success', `View ${viewName} removed.`);
  } catch (error) {
    console.error('Delete view error:', error);
    req.flash('error', 'Unable to delete view.');
  }
  return res.redirect('/reports');
});

router.post('/snapshots/create', async (req, res) => {
  const snapshotName =
    pickValue(req, 'snapshot_name') || `Snapshot ${new Date().toLocaleString()}`;

  try {
    const [[departmentStats], [studentsPerCourse], [availableCourses]] = await Promise.all([
      pool.query(aggregateQueries.departmentStats),
      pool.query(aggregateQueries.studentsPerCourse),
      pool.query(aggregateQueries.availableCourses)
    ]);

    const payload = {
      createdBy: req.session.user.username,
      generatedAt: new Date().toISOString(),
      departmentStats,
      studentsPerCourse,
      availableCourses
    };

    await pool.query('INSERT INTO ReportSnapshots (snapshot_name, payload) VALUES (?, ?)', [
      snapshotName,
      JSON.stringify(payload)
    ]);
    req.flash('success', 'Snapshot saved successfully.');
  } catch (error) {
    console.error('Snapshot error:', error);
    req.flash('error', 'Unable to create snapshot.');
  }
  return res.redirect('/reports');
});

module.exports = router;

