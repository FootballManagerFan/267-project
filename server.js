require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');

const pool = require('./config/db');
const tableConfig = require('./config/tableConfig');
const { ensureAuthenticated } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const departmentRoutes = require('./routes/departments');
const professorRoutes = require('./routes/professors');
const studentRoutes = require('./routes/students');
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

const navLinks = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/students', label: 'Students' },
  { href: '/courses', label: 'Courses' },
  { href: '/professors', label: 'Professors' },
  { href: '/departments', label: 'Departments' },
  { href: '/enrollments', label: 'Enrollments' },
  { href: '/reports', label: 'Reports', roles: ['manager', 'admin'] }
];

const normalize = (value = '') => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const getFieldName = (fields = [], preferredName, fallback) => {
  const target = normalize(preferredName);
  const exact = fields.find((field) => normalize(field.name) === target);
  if (exact) {
    return exact.name;
  }
  const fuzzy = fields.find((field) => {
    const normalizedField = normalize(field.name);
    return normalizedField.includes(target) || target.includes(normalizedField);
  });
  return fuzzy ? fuzzy.name : fallback;
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'registration-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } // 1 hour
  })
);
app.use(flash());

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.navLinks = navLinks;
  res.locals.messages = {
    success: req.flash('success'),
    error: req.flash('error'),
    info: req.flash('info')
  };
  res.locals.currentPath = req.path;
  next();
});

app.use('/', authRoutes);
app.use('/departments', departmentRoutes);
app.use('/professors', professorRoutes);
app.use('/students', studentRoutes);
app.use('/courses', courseRoutes);
app.use('/enrollments', enrollmentRoutes);
app.use('/reports', reportRoutes);

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

app.get('/dashboard', ensureAuthenticated, async (req, res) => {
  const departmentTable = tableConfig.departments.tableName || 'Department';
  const professorTable = tableConfig.professors.tableName || 'Professor';
  const courseTable = tableConfig.courses.tableName || 'Course';
  const studentTable = tableConfig.students.tableName || 'Student';
  const enrollmentTable = tableConfig.enrollments.tableName || 'Enrollment';
  const courseOfferingTable = tableConfig.courseOfferings.tableName || 'CourseOffering';

  const coursePrimaryKey = tableConfig.courses.primaryKey || 'course_id';
  const offeringPrimaryKey = tableConfig.courseOfferings.primaryKey || 'offering_id';
  const enrollmentPrimaryKey = tableConfig.enrollments.primaryKey || 'enrollment_id';

  const courseForeignKeyOnOffering = getFieldName(
    tableConfig.courseOfferings.fields,
    'course_id',
    'course_id'
  );
  const courseNameField = getFieldName(tableConfig.courses.fields, 'course_name', 'courseName');
  const capacityField = getFieldName(
    tableConfig.courseOfferings.fields,
    'capacity',
    'capacity'
  );
  const enrollmentOfferingField = getFieldName(
    tableConfig.enrollments.fields,
    'offering_id',
    'offering_id'
  );
  const semesterField = getFieldName(tableConfig.courseOfferings.fields, 'semester', 'semester');
  const yearField = getFieldName(tableConfig.courseOfferings.fields, 'year', 'year');

  try {
    const [
      [departmentsCount],
      [professorsCount],
      [coursesCount],
      [studentsCount],
      [activeEnrollments],
      [courseAvailability]
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM ${departmentTable}`),
      pool.query(`SELECT COUNT(*) AS total FROM ${professorTable}`),
      pool.query(`SELECT COUNT(*) AS total FROM ${courseTable}`),
      pool.query(`SELECT COUNT(*) AS total FROM ${studentTable}`),
      pool.query(
        `SELECT COUNT(*) AS total FROM ${enrollmentTable} WHERE status <> 'dropped' OR status IS NULL`
      ),
      pool.query(`
        SELECT co.${offeringPrimaryKey} AS offering_id,
               c.${courseNameField} AS course_name,
               co.${semesterField} AS semester,
               co.${yearField} AS year,
               co.${capacityField} AS capacity,
               COALESCE(
                 co.${capacityField} - COUNT(e.${enrollmentPrimaryKey}),
                 co.${capacityField}
               ) AS seats_available
        FROM ${courseOfferingTable} co
        INNER JOIN ${courseTable} c ON c.${coursePrimaryKey} = co.${courseForeignKeyOnOffering}
        LEFT JOIN ${enrollmentTable} e ON e.${enrollmentOfferingField} = co.${offeringPrimaryKey}
        GROUP BY co.${offeringPrimaryKey}
        ORDER BY seats_available DESC
        LIMIT 5
      `)
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      stats: {
        departments: departmentsCount[0]?.total || 0,
        professors: professorsCount[0]?.total || 0,
        courses: coursesCount[0]?.total || 0,
        students: studentsCount[0]?.total || 0,
        activeEnrollments: activeEnrollments[0]?.total || 0
      },
      topAvailability: courseAvailability || []
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error', 'Unable to load dashboard at this time.');
    res.redirect('/login');
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(500).json({ error: 'Something went wrong.' });
  }
  req.flash('error', 'Something went wrong. Please try again.');
  return res.redirect(req.headers.referer || '/dashboard');
});

const bootstrap = async () => {
  const usersTable = `
    CREATE TABLE IF NOT EXISTS Users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('basic', 'manager', 'admin') DEFAULT 'basic',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  const snapshotsTable = `
    CREATE TABLE IF NOT EXISTS ReportSnapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      snapshot_name VARCHAR(255) NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await pool.query(usersTable);
  await pool.query(snapshotsTable);

  const [existingAdmin] = await pool.query('SELECT id FROM Users WHERE username = ?', ['admin']);
  if (!existingAdmin.length) {
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
    const hash = await bcrypt.hash(defaultPassword, 10);
    await pool.query(
      'INSERT INTO Users (username, password_hash, role) VALUES (?, ?, ?)',
      ['admin', hash, 'admin']
    );
    console.info('Default admin user created -> username: admin, password:', defaultPassword);
  }
};

const startServer = async () => {
  try {
    await bootstrap();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

startServer();

