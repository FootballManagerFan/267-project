# Registration System Web App

Full-stack Node.js + MySQL application for managing a university registration system. It covers authentication, dashboards, CRUD for six academic tables, reporting, and advanced database tooling (views, custom queries, snapshots, and capacity-aware enrollments).

## Features

- **Secure Auth**: Session-based login with three roles (`basic`, `manager`, `admin`), powered by `express-session` and bcrypt password hashing.
- **Dashboard**: Quick metrics plus seat-availability highlights.
- **CRUD UI**: Departments, Professors, Courses, Course Offerings, Students, and Enrollments all have create/read/update/delete workflows with validation and flash feedback.
- **Enrollment Guardrails**: Real-time capacity checks prevent students from enrolling in full sections and display remaining seats.
- **Reports Suite**: Aggregated insights, custom SELECT runner, database view management, and historical snapshots stored in MySQL.
- **Responsive Front-End**: EJS templates with vanilla JS and modern CSS for consistent navigation and user experience.

## Project Structure

```
registration-system/
├── server.js
├── package.json
├── README.md
├── config/
│   ├── db.js
│   └── tableConfig.js
├── middleware/
│   └── auth.js
├── routes/
│   ├── auth.js
│   ├── courses.js
│   ├── departments.js
│   ├── enrollments.js
│   ├── professors.js
│   ├── reports.js
│   └── students.js
├── utils/
│   └── request.js
├── public/
│   ├── css/style.css
│   └── js/main.js
└── views/
    ├── dashboard.ejs
    ├── departments.ejs
    ├── enrollments.ejs
    ├── login.ejs
    ├── professors.ejs
    ├── reports.ejs
    ├── students.ejs
    ├── courses.ejs
    └── partials/…
```

## Prerequisites

- Node.js 18+
- MySQL 8+ with a database named `registration_db`
- Existing tables: `Department`, `Professor`, `Course`, `CourseOffering`, `Student`, `Enrollment`

> **Tip:** Adjust column names in `config/tableConfig.js` if your schema differs. The UI pulls labels, field types, and validation rules from that config file.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional: create a `.env` file (values default to the spec credentials):
   ```env
   PORT=3000
   SESSION_SECRET=change-me
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=yourpassword!
   DB_NAME=registration_db
   DEFAULT_ADMIN_PASSWORD=Admin@123
   ```
3. Ensure the six base tables exist. Below is a schema that matches the column names used in this project:

   ```sql
   CREATE TABLE Department (
     departmentID INT AUTO_INCREMENT PRIMARY KEY,
     deptName VARCHAR(120) NOT NULL,
     officeLocation VARCHAR(80),
     phoneNumber VARCHAR(40)
   );

   CREATE TABLE Professor (
     professorID INT AUTO_INCREMENT PRIMARY KEY,
     firstName VARCHAR(60) NOT NULL,
     lastName VARCHAR(60) NOT NULL,
     email VARCHAR(120) NOT NULL UNIQUE,
     officeNumber VARCHAR(40),
     title VARCHAR(80),
     departmentID INT
   );

   CREATE TABLE Course (
     courseID INT AUTO_INCREMENT PRIMARY KEY,
     courseName VARCHAR(120) NOT NULL,
     credits INT NOT NULL,
     description TEXT,
     departmentID INT
   );

   CREATE TABLE CourseOffering (
     offeringID INT AUTO_INCREMENT PRIMARY KEY,
     courseID INT NOT NULL,
     professorID INT NOT NULL,
     semester VARCHAR(20) NOT NULL,
     year INT NOT NULL,
     capacity INT NOT NULL,
     roomNumber VARCHAR(40),
     scheduleTime VARCHAR(80)
   );

   CREATE TABLE Student (
     studentID INT AUTO_INCREMENT PRIMARY KEY,
     firstName VARCHAR(60) NOT NULL,
     lastName VARCHAR(60) NOT NULL,
     email VARCHAR(120) NOT NULL UNIQUE,
     major INT,
     classification VARCHAR(30),
     address VARCHAR(200)
   );

   CREATE TABLE Enrollment (
     enrollmentID INT AUTO_INCREMENT PRIMARY KEY,
     studentID INT NOT NULL,
     offeringID INT NOT NULL,
     enrollmentDate DATE NOT NULL,
     grade VARCHAR(10),
     status VARCHAR(40)
   );
   ```

4. Start the app:
   ```bash
   npm run dev
   # or
   npm start
   ```

The server seeds a default admin (`admin / Admin@123`). Log in and create additional users (insert into `Users` table with hashed passwords). Use `bcryptjs` or the `/routes/auth.js` logic as reference.

## Usage Notes

- **Manual testing:** Every POST route also reads query parameters, so you can hit URLs like `/students/create?firstName=Alex&lastName=Kim...` for quick checks.
- **Roles:** Basic users are read-only. Managers can create/update. Admins can delete and run elevated features (reports already require manager/admin).
- **Snapshots & Views:** Stored in MySQL (`ReportSnapshots` & native views). Snapshots capture JSON blobs summarizing current aggregates.
- **Security:** All SQL uses prepared statements. Only SELECT/CTE statements are allowed in the custom query runner. Views and snapshots validate inputs before execution.

## Scripts

- `npm start` – run the production server.
- `npm run dev` – start the server with nodemon for auto-reload during development.

## Troubleshooting

- Update `config/tableConfig.js` if your column names differ (e.g., `DepartmentID` vs `department_id`).
- If MySQL rejects JSON payloads (older versions), change the `payload` column in `ReportSnapshots` to `LONGTEXT` and adjust inserts accordingly.
- Capacity errors when enrolling mean the related offering is full; adjust `CourseOffering.capacity` or drop existing enrollments.

Happy building! Let me know if you need seed scripts or schema tweaks.

