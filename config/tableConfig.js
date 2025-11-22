module.exports = {
  departments: {
    tableName: 'Department',
    primaryKey: 'departmentID',
    fields: [
      { name: 'departmentID', label: 'Department ID', type: 'number', required: true },
      { name: 'deptName', label: 'Department Name', type: 'text', required: true },
      { name: 'officeLocation', label: 'Office Location', type: 'text' },
      { name: 'phoneNumber', label: 'Phone Number', type: 'text' }
    ]
  },
  professors: {
    tableName: 'Professor',
    primaryKey: 'professorID',
    fields: [
      { name: 'professorID', label: 'Professor ID', type: 'number', required: true },
      { name: 'firstName', label: 'First Name', type: 'text', required: true },
      { name: 'lastName', label: 'Last Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'officeNumber', label: 'Office Number', type: 'text' },
      { name: 'title', label: 'Title', type: 'text' },
      { name: 'departmentID', label: 'Department ID', type: 'number' }
    ]
  },
  courses: {
    tableName: 'Course',
    primaryKey: 'courseID',
    fields: [
      { name: 'courseID', label: 'Course ID', type: 'number', required: true },
      { name: 'courseName', label: 'Course Name', type: 'text', required: true },
      { name: 'credits', label: 'Credits', type: 'number', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'departmentID', label: 'Department ID', type: 'number' }
    ]
  },
  courseOfferings: {
    tableName: 'CourseOffering',
    primaryKey: 'offeringID',
    fields: [
      { name: 'offeringID', label: 'Offering ID', type: 'number', required: true },
      { name: 'semester', label: 'Semester', type: 'text', required: true },
      { name: 'year', label: 'Year', type: 'number', required: true },
      { name: 'capacity', label: 'Capacity', type: 'number' },
      { name: 'scheduleTime', label: 'Schedule Time', type: 'text' },
      { name: 'roomNumber', label: 'Room Number', type: 'text' },
      { name: 'courseID', label: 'Course ID', type: 'number' },
      { name: 'professorID', label: 'Professor ID', type: 'number' }
    ]
  },
  students: {
    tableName: 'Student',
    primaryKey: 'studentID',
    fields: [
      { name: 'studentID', label: 'Student ID', type: 'number', required: true },
      { name: 'firstName', label: 'First Name', type: 'text', required: true },
      { name: 'lastName', label: 'Last Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'major', label: 'Major (Dept ID)', type: 'number' },
      { name: 'classification', label: 'Classification', type: 'text' },
      { name: 'address', label: 'Address', type: 'text' }
    ]
  },
  enrollments: {
    tableName: 'Enrollment',
    primaryKey: 'enrollmentID',
    fields: [
      { name: 'enrollmentID', label: 'Enrollment ID', type: 'number', required: true },
      { name: 'enrollmentDate', label: 'Enrollment Date', type: 'date', required: true },
      { name: 'grade', label: 'Grade', type: 'text' },
      { name: 'status', label: 'Status', type: 'text' },
      { name: 'studentID', label: 'Student ID', type: 'number' },
      { name: 'offeringID', label: 'Offering ID', type: 'number' }
    ]
  }
};

