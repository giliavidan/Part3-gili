const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// --- חיבור למסד הנתונים ---
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'gnGroup3',
  database: 'michal_pilates',
  dateStrings: true
});

// ===== לוגיקת יצירת שיעורים מטבלת התבניות =====
const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

/**
 * יוצרת שיעורים לפי classes_templates לשבוע אחד בלבד
 * (7 ימים החל מ‑startDate).
 */
function generateClassesForWeek(startDate, callback) {
  const sqlTemplates = 'SELECT * FROM classes_templates';

  db.query(sqlTemplates, (err, templates) => {
    if (err) return callback(err);

    const inserts = [];
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // 7 ימים
    end.setHours(23, 59, 59, 999);

    const current = new Date(start);

    while (current <= end) {
      const jsDay = current.getDay(); // 0 = ראשון
      const hebDay = dayNames[jsDay]; // שבת לא קיימת במערך
      const dateStr = current.toISOString().split('T')[0]; // YYYY-MM-DD

      if (hebDay) {
        templates
          .filter(t => t.day_of_week === hebDay)
          .forEach(t => {
            inserts.push([
              t.default_name,             // class_name
              dateStr,                    // class_date
              hebDay,                     // day_of_week
              t.start_time,               // start_time
              t.end_time,                 // end_time
              'מיכל',                     // instructor
              t.default_zoom,             // zoom
              t.default_max_participants  // max_participants
            ]);
          });
      }

      current.setDate(current.getDate() + 1);
    }

    if (!inserts.length) return callback(null);

    const insertSql = `
      INSERT INTO classes
      (class_name, class_date, day_of_week, start_time, end_time,
       instructor, zoom, max_participants)
      VALUES ?
      ON DUPLICATE KEY UPDATE id = id
    `;

    db.query(insertSql, [inserts], (err2) => {
      if (err2) return callback(err2);
      callback(null);
    });
  });
}

/**
 * פונקציה ישנה – לא חובה להשתמש בה (שבוע הבא קלאסי)
 * נשארת למקרה שתרצי בעתיד, אבל לא קוראים לה כרגע.
 */
function generateNextWeekClasses(callback) {
  const today = new Date();
  const day = today.getDay(); // 0=ראשון, 1=שני...

  const diffToNextSunday = (7 - day) % 7 || 7;
  const start = new Date(today);
  start.setDate(today.getDate() + diffToNextSunday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6); // עד שבת

  generateClassesForWeek(start.toISOString().split('T')[0], callback);
}

// --- התחברות ל‑DB (ללא יצירת שיעורים אוטומטית) ---
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
  } else {
    console.log('Connected to MySQL Database!');
    // יצירת השיעורים תהיה רק לפי כפתור אדמין
  }
});

// ==========================================
//           ניהול משתמשים (Auth)
// ==========================================

app.post('/registration', (req, res) => {
  const { email, password, firstName, lastName, phone, birthdate, city, trainingHabits, membershipType, comments } = req.body;
  const query = `INSERT INTO users (email, password, first_name, last_name, phone, birthdate, city, training_habit, membership_type, comments, role) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'client')`;

  db.query(
    query,
    [email, password, firstName, lastName, phone, birthdate, city, trainingHabits, membershipType, comments],
    (err) => {
      if (err) {
        console.error(err);
        res.status(500).send('אירעה שגיאה במהלך ההרשמה');
      } else {
        res.status(200).send('ההרשמה בוצעה בהצלחה');
      }
    }
  );
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const query = 'SELECT * FROM users WHERE email = ? AND password = ?';

  db.query(query, [email, password], (err, results) => {
    if (err) {
      res.status(500).json({ success: false, message: 'אירעה שגיאה בעת ההתחברות' });
    } else if (results.length > 0) {
      const user = results[0];
      res.cookie('userSession', user.email, { maxAge: 3600000, httpOnly: true });
      res.json({
        success: true,
        message: 'התחברת בהצלחה',
        user: {
          id: user.email,
          firstName: user.first_name,
          role: user.role,
          membershipType: user.membership_type
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'שם משתמש או סיסמה שגויים'
      });
    }
  });
});

app.get('/logout', (req, res) => {
  res.clearCookie('userSession');
  res.json({ success: true, message: 'התנתקת מהמערכת' });
});

// --- בדיקת חיבור לפי העוגייה ---
app.get('/api/check-session', (req, res) => {
  const email = req.cookies.userSession;
  if (!email) {
    return res.json({ isLoggedIn: false });
  }
  const query = 'SELECT first_name, email, role, membership_type FROM users WHERE email = ?';
  db.query(query, [email], (err, results) => {
    if (results && results.length > 0) {
      const user = results[0];
      res.json({
        isLoggedIn: true,
        user: {
          id: user.email,
          firstName: user.first_name,
          role: user.role,
          membershipType: user.membership_type
        }
      });
    } else {
      res.json({ isLoggedIn: false });
    }
  });
});

app.get('/api/user-info', (req, res) => {
  const userId = req.query.userId;
  const query = 'SELECT first_name, last_name, email, phone, city, birthdate, membership_type FROM users WHERE email = ?';
  db.query(query, [userId], (err, results) => {
    if (err || results.length === 0) {
      res.status(500).json({ error: 'המשתמש לא נמצא' });
    } else {
      res.json(results[0]);
    }
  });
});

// עדכון פרטים
app.put('/api/update-user', (req, res) => {
  const { email, firstName, lastName, phone, city, birthdate } = req.body;
  const query = `UPDATE users SET first_name=?, last_name=?, phone=?, city=?, birthdate=? WHERE email=?`;
  db.query(query, [firstName, lastName, phone, city, birthdate, email], (err) => {
    if (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'אירעה שגיאה בעדכון הפרטים' });
    } else {
      res.json({ success: true, message: 'הפרטים עודכנו בהצלחה' });
    }
  });
});

app.get('/all-users', (req, res) => {
  const query = 'SELECT first_name, last_name, email FROM users ORDER BY first_name ASC';
  db.query(query, (err, results) => {
    if (err) res.status(500).send('אירעה שגיאה בטעינת המשתמשים');
    else res.json(results);
  });
});

// ==========================================
//           ניהול שיעורים
// ==========================================

app.get('/api/my-classes', (req, res) => {
  const userId = req.query.userId;
  const query = `
    SELECT c.id, c.class_name, c.class_date, c.start_time, c.end_time, c.zoom, r.status
    FROM classes c
    JOIN registrations r ON c.id = r.class_id
    WHERE r.user_id = ?
      AND TIMESTAMP(c.class_date, c.end_time) >= NOW()
    ORDER BY c.class_date ASC, c.start_time ASC
    LIMIT 3
  `;
  db.query(query, [userId], (err, results) => {
    if (err) res.status(500).send('אירעה שגיאה בטעינת השיעורים');
    else res.json(results);
  });
});

app.post('/add-class', (req, res) => {
  const { className, classDate, dayOfWeek, startTime, endTime, instructor, zoom, maxParticipants } = req.body;
  const query = `
    INSERT INTO classes
      (class_name, class_date, day_of_week, start_time, end_time, instructor, zoom, max_participants)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(
    query,
    [className, classDate, dayOfWeek, startTime, endTime, instructor, zoom, maxParticipants],
    (err) => {
      if (err) res.status(500).json({ success: false, message: 'אירעה שגיאה בהוספת השיעור' });
      else res.json({ success: true, message: 'השיעור נוסף בהצלחה' });
    }
  );
});

app.put('/update-class', (req, res) => {
  const { id, className, classDate, dayOfWeek, startTime, endTime, instructor, zoom, maxParticipants } = req.body;
  const query = `
    UPDATE classes
    SET class_name=?, class_date=?, day_of_week=?, start_time=?, end_time=?, instructor=?, zoom=?, max_participants=?
    WHERE id=?
  `;
  db.query(
    query,
    [className, classDate, dayOfWeek, startTime, endTime, instructor, zoom, maxParticipants, id],
    (err) => {
      if (err) res.status(500).json({ success: false, message: 'אירעה שגיאה בעדכון השיעור' });
      else res.json({ success: true, message: 'השיעור עודכן בהצלחה' });
    }
  );
});

app.get('/classes', (req, res) => {
  const userId = req.query.userId || 0;
  const query = `
    SELECT c.*, r.status AS user_status,
           (SELECT COUNT(*) + 1
              FROM registrations r2
             WHERE r2.class_id = c.id
               AND r2.status = 'waitlist'
               AND r2.id < r.id) AS waitlist_position,
           (SELECT COUNT(*)
              FROM registrations r3
             WHERE r3.class_id = c.id
               AND r3.status = 'waitlist') AS total_waitlist
    FROM classes c
    LEFT JOIN registrations r
           ON c.id = r.class_id AND r.user_id = ?
    ORDER BY c.class_date ASC, c.start_time ASC
  `;
  db.query(query, [userId], (err, results) => {
    if (err) res.status(500).send('אירעה שגיאה בטעינת מערכת השיעורים');
    else res.json(results);
  });
});

// השבוע האחרון שקיים במערכת השעות – בשביל חסימת דפדוף קדימה לשבועות ריקים
app.get('/api/max-class-date', (req, res) => {
  const query = 'SELECT MAX(class_date) AS maxDate FROM classes';
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ maxDate: null });
    }
    const row = results[0];
    res.json({ maxDate: row && row.maxDate ? row.maxDate : null });
  });
});

app.delete('/delete-class/:id', (req, res) => {
  db.query('DELETE FROM classes WHERE id = ?', [req.params.id], (err) => {
    if (err) res.status(500).json({ success: false, message: 'אירעה שגיאה במחיקת השיעור' });
    else res.json({ success: true, message: 'השיעור נמחק בהצלחה' });
  });
});

// יצירת שיעורים לשבוע שמוצג במסך (קולט רק startDate של יום ראשון)
app.post('/admin/generate-week-range', (req, res) => {
  const { startDate } = req.body; // YYYY-MM-DD של יום ראשון בשבוע המוצג

  if (!startDate) {
    return res.status(400).json({ success: false, message: 'חסר תאריך התחלה' });
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // 7 ימים בלבד
  end.setHours(23, 59, 59, 999);

  const startStr = start.toISOString().split('T')[0];
  const endStr   = end.toISOString().split('T')[0];

  // בודקים אם כבר יש שיעורים בשבוע הזה
  const checkSql = `
    SELECT COUNT(*) AS cnt
    FROM classes
    WHERE class_date BETWEEN ? AND ?
  `;
  db.query(checkSql, [startStr, endStr], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'שגיאה בבדיקת השבוע במערכת' });
    }

    if (results[0].cnt > 0) {
      return res.status(400).json({
        success: false,
        message: 'כבר קיימת מערכת שעות לשבוע הזה. מחקי קודם את כל השיעורים בשבוע אם את רוצה ליצור מחדש.'
      });
    }

    // אם השבוע ריק – מייצרים לפי התבניות, רק לשבוע הזה
    generateClassesForWeek(startStr, (err2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ success: false, message: 'שגיאה ביצירת שיעורים לשבוע' });
      }
      res.json({ success: true, message: 'השבוע נוצר בהצלחה' });
    });
  });
});

// ==========================================
//           הרשמה וביטול
// ==========================================

app.post('/register-class', (req, res) => {
  const { userId, classId } = req.body;
  const checkQuery = 'SELECT * FROM classes WHERE id = ?';
  db.query(checkQuery, [classId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ success: false, message: 'השיעור לא נמצא' });
    }

    const cls = results[0];
    const isFull = cls.current_participants >= cls.max_participants;
    const status = isFull ? 'waitlist' : 'registered';

    const registerQuery = 'INSERT INTO registrations (user_id, class_id, status) VALUES (?, ?, ?)';
    db.query(registerQuery, [userId, classId, status], (err2) => {
      if (err2) return res.json({ success: false, message: 'כבר נרשמת לשיעור הזה' });

      if (status === 'registered') {
        db.query('UPDATE classes SET current_participants = current_participants + 1 WHERE id = ?', [classId]);
      }

      res.json({
        success: true,
        status: status,
        message: isFull ? 'נכנסת לרשימת ההמתנה' : 'נרשמת לשיעור בהצלחה'
      });
    });
  });
});

app.post('/cancel-registration', (req, res) => {
  const { userId, classId } = req.body;
  db.query(
    'SELECT status FROM registrations WHERE user_id = ? AND class_id = ?',
    [userId, classId],
    (err, results) => {
      if (err || results.length === 0) {
        return res.json({ success: false, message: 'הרישום לשיעור לא נמצא' });
      }
      const oldStatus = results[0].status;

      db.query(
        'DELETE FROM registrations WHERE user_id = ? AND class_id = ?',
        [userId, classId],
        (err2) => {
          if (err2) return res.json({ success: false, message: 'אירעה שגיאה בביטול הרישום' });

          if (oldStatus === 'registered') {
            db.query('UPDATE classes SET current_participants = current_participants - 1 WHERE id = ?', [classId]);
          }

          res.json({ success: true, message: 'הרישום לשיעור בוטל בהצלחה' });
        }
      );
    }
  );
});

app.post('/admin-add-user', (req, res) => {
  const { userId, classId } = req.body;
  db.query(
    'SELECT * FROM registrations WHERE user_id = ? AND class_id = ?',
    [userId, classId],
    (err, results) => {
      if (results && results.length > 0) {
        return res.json({ success: false, message: 'המשתמשת כבר רשומה לשיעור' });
      }

      db.query(
        "INSERT INTO registrations (user_id, class_id, status) VALUES (?, ?, 'registered')",
        [userId, classId],
        (err2) => {
          if (err2) return res.json({ success: false, message: 'אירעה שגיאה בהוספת המשתמשת' });

          db.query('UPDATE classes SET current_participants = current_participants + 1 WHERE id = ?', [classId]);
          res.json({ success: true, message: 'המשתמשת נוספה לשיעור בהצלחה' });
        }
      );
    }
  );
});

app.get('/class-participants/:id', (req, res) => {
  const classId = req.params.id;
  const query = `
    SELECT u.first_name, u.last_name, u.email, r.status
    FROM registrations r
    JOIN users u ON r.user_id = u.email
    WHERE r.class_id = ?
    ORDER BY r.created_at ASC
  `;
  db.query(query, [classId], (err, results) => {
    if (err) res.status(500).send('אירעה שגיאה בטעינת המשתתפות בשיעור');
    else res.json(results);
  });
});

// ==========================================
//           הודעות
// ==========================================

app.post('/add-message', (req, res) => {
  db.query('INSERT INTO messages (content) VALUES (?)', [req.body.content], (err) => {
    if (err) res.status(500).json({ success: false, message: 'אירעה שגיאה בהוספת ההודעה' });
    else res.json({ success: true, message: 'ההודעה נוספה בהצלחה' });
  });
});

app.get('/messages', (req, res) => {
  db.query('SELECT * FROM messages ORDER BY created_at DESC', (err, results) => {
    if (err) res.status(500).send('אירעה שגיאה בטעינת ההודעות');
    else res.json(results);
  });
});

app.delete('/delete-message/:id', (req, res) => {
  db.query('DELETE FROM messages WHERE id = ?', [req.params.id], (err) => {
    if (err) res.status(500).json({ success: false, message: 'אירעה שגיאה במחיקת ההודעה' });
    else res.json({ success: true, message: 'ההודעה נמחקה בהצלחה' });
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
