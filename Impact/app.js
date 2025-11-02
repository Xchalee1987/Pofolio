import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import bcrypt from "bcrypt";
import { DataRowMessage } from "pg-protocol/dist/messages";
import path from "path";
import multer from 'multer';



dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url)); //เหมือนว่าจะสร้างตัวแปร __dirname เพื่อให้ใช้เป็น ไดเรทเทอรีเริ้มต้น


const app = express();
const port = process.env.PORT || 3000;


// --- PostgreSQL pool ---
const { Pool } = pg; //ดึงclass pool ออกจาก pg
const pool = new Pool({ //สร้าง อินสแตนซ์ ขึ้นมาใช้งาน
  connectionString: process.env.DATABASE_URL, //ดึงค่าจาก .env จาก DATABASE_URL มา
});

// --- Session Store (เก็บ session ลง Postgres) ---
const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session", // ชื่อตาราง session (ปล่อยให้ lib สร้างให้โดยอัตโนมัติ)
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "dev-secret", // The browser stores this cookie and sends it back with each request.
    resave: false, // Don’t save session if nothing changed
    saveUninitialized: false, // Don’t create a session until something is stored in it, 
    // meaning if person visits this site and doesn't log in, no session is saved. A session will not be created
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 1 วัน
    },
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Map the root (/) of the URL to the physical public directory, can use / to file or folder in public directly
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'assets')));

// This is the default setting Express uses
// Express uses a setting named views to specify the default directory for template files
// app.set('views', path.join(__dirname, 'views'));
// unless you explicitly override it.

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ตั้งค่า multer สำหรับอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads');
  },
  filename: (req, file, cb) => {
     cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });


// --- Helper: แนบ user เข้ากับ req จาก session ---
app.use((req, res, next) => {  //ทำทุกครั้งที่มีการ Request เข้ามา
  if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
});

app.get("/", async (req, res) => {  //localhost:3000 ที่เรียกใช้
  let result = { rows: [] };
  try {
    result = await pool.query('SELECT * FROM concert_detail ORDER BY date ASC');
    res.render("main.ejs", {
      u : req.user,
      concerts: result.rows
    });
  } catch (err) {
        console.error("Error fetching concerts for main page: ", err.message);
  }
});

// --- Middleware: ต้องล็อกอินก่อน ---
function requireAuth(req, res, next) {
  if (!req.user) { // ดักเมื่อกดสั่งซื้อตั๋วโดยไม่ได้ลงชื่อเข้าใช้
    return res.status(401).sendFile(path.join(__dirname, 'public', 'login_page.html'));
  }
  next();
}

// check in case user without login enter where "no role" can't enter
// (enter the path that contain /u will check if user login yet)
app.use((req, res, next) => {
  const openPaths = ["/", "/login", "/logout", "/register", "/reset"]; //เส้นทางที่เข้าถึงได้โดยไม่ต้อง Login
  if (openPaths.includes(req.path)) { //เช็คreq ที่ถูกส่งมาปัจจุบันว่า มีใน path ในนี้ไหม 
    return next();  //ถ้า ใช่ ให้ไปต่อ
  }
  // ต้องแยกออกมาเพราะ path นี้มี path parameters/ route parameters
  // without this the event pages can't fetch available seats if not login first
  if (req.path.startsWith("/concertDetail")) {
    return next();
  }
  return requireAuth(req, res, next);
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).send("กรุณาลงชื่อเข้าใช้");
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('response.ejs', {
        u : req.user,
        msg : [ 'คุณไม่มีสิทธิเข้าถึง' ],
        addPath : [
          {path: '/', text: 'กลับไปหน้าหลัก'}
        ]
      });
    }
    next();
  };
}

// click on ลงชื่อเข้าใช้ in index.html will check first if already login
app.get("/login", (req, res) => {
  if(req.user){
    return res.redirect('/');
  }
  return res.status(401).sendFile(path.join(__dirname, 'public', 'login_page.html'));
});

app.post("/login", async (req, res) => {  //เมื่อมีการส่ง Request POST มา
  const { username, password } = req.body;
  try {
    const q = `
      SELECT user_id, username, phone, role
      FROM "user_detail"
      WHERE username = $1
        AND password = crypt($2, password)
      LIMIT 1
    `;
    const { rows } = await pool.query(q, [username, password]);

    if (rows.length === 0) {
      return res.status(401).render('response.ejs',{
        u : req.user,
        msg: [ 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' ],
        addPath : [
          {path: '/', text: 'กลับไปหน้าหลัก'}
        ]
      });
    }

    const u = rows[0];
    req.session.user = {
      user_id: u.user_id,
      username: u.username,
      phone: u.phone,
      role: u.role,
    };
    res.redirect('/');
  } catch (e) {
    console.error(e.message);
    res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});
// --- ออกจากระบบ ---
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.post("/register", async (req, res) => {
  const { username, number, password } = req.body;
  try {
    const q = `
      INSERT INTO user_detail
      (username, phone, password, role)
      VALUES ($1, $2, crypt($3, gen_salt('bf')) , 'user')
    `;

    await pool.query(q, [username, number, password]); //ดักจับถ้าชื่อผู้ใช้ซ้ำ

    return res.render('response.ejs', {
      msg : [
        'คุณลงทะเบียนสำเร็จแล้ว!',
        'กรุณาลงชื่อเข้าใช้เพื่อเริ่มใช้บริการของเรา'
      ],
      addPath : [
        {path: '/login', text: 'ลงชื่อเข้าใช้'}
      ]
    });
  } catch (e) {
    console.error(e);
    if (e.code === '23505') {
      return res.render('response.ejs', {
        msg : [
          'ชื่อผู้ใช้ซ้ำกรุณาลงทะเบียนใหม่'
        ],
        addPath : [
          {path: '/login', text: 'ย้อนกลับ'}
        ]
      });
    }
    return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.get('/listConcerts/add', requireRole('staff', 'admin'), (req, res) => {
  res.render('add_event.ejs', { u : req.user });
});

app.post('/listConcerts/add', requireRole('staff', 'admin'), upload.fields([
    { name: 'image', maxCount: 1 },   // สำหรับภาพหน้าปก
    { name: 'imageBG', maxCount: 1 }  // สำหรับภาพพื้นหลัง
  ]), async (req, res) => {
  const { title, artist, date, time, detail, ALcap, ARcap, Bcap, Ccap } = req.body;
  const image_path = req.files['image'] ? `/uploads/${req.files['image'][0].filename}`: null;
  const bgimage_path = req.files['imageBG'] ? `/uploads/${req.files['image'][0].filename}`: null;
    
  try {
    const concertResult = await pool.query(`
        INSERT INTO concert_detail (title, artist, date, time, detail, image_path, bgimage_path) 
        VALUES ($1, $2, $3, $4, $5, $6, $7 ) RETURNING concert_id;
        `, [title, artist, date, time, detail, image_path, bgimage_path]
      );

    const concert_id = concertResult.rows[0].concert_id;
      
      await pool.query(`
        INSERT INTO zone_detail (concert_id, zone_name, base_price, capacity)
        VALUES 
            ($1, 'AL', 7500, $2),
            ($1, 'AR', 7500, $3),
            ($1, 'B', 5500, $4),
            ($1, 'C', 4500, $5)
        ;`, [concert_id, ALcap, ARcap, Bcap, Ccap]);

    res.redirect('/listConcerts');
  } catch (err) {
    console.error(err.message);
    res.send('Error inserting concert');
  }
});

app.get('/listConcerts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM concert_detail ORDER BY concert_id DESC');
    res.render('listConcert.ejs', {
      u : req.user,
      concerts: result.rows
    });
  } catch (err) {
    console.error(err);
    res.send('Error loading concerts');
  }
});

app.post('/listConcert/delete/:id', requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const delTransQuery = `
      DELETE FROM "transaction"
      WHERE zone_id IN ( SELECT zone_id FROM "zone_detail" WHERE concert_id = $1 );
    `;
    await pool.query(delTransQuery, [ id ]);
    
    const delZonesQuery = `
      DELETE FROM "zone_detail"
      WHERE concert_id = $1;
    `;
    await pool.query(delZonesQuery, [ id ]);

    const delConcertQuery = `
      DELETE FROM "concert_detail"
      WHERE concert_id = $1;
    `;
    await pool.query(delConcertQuery, [ id ]);

    res.redirect('/listConcerts');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('เกิดข้อผิดพลาดในการลบข้อมูล');
  }
});

app.get('/concertDetail/:concert_id', async (req, res) => {
  const concertID = req.params.concert_id;
  try {
      const concertResult = await pool.query(
          'SELECT * FROM concert_detail WHERE concert_id = $1', 
          [ concertID ]
      );
        
      if (concertResult.rows.length === 0) {
        return res.status(404).send('Concert not found');
      }
      // ดึงข้อมูลคอนเสิร์ตที่พบมาเพียงรายการเดียว
      const concert = concertResult.rows[0];

      // FROM - Generates all possible seats for ALL zones in the concert
      // LEFT JOIN - Selects all SOLD (booked) seats for the concert
      // WHERE on last line - Only include seats that did NOT match a seat that's in transaction table
      const q = `
        SELECT
          all_seats.zone_name,
          all_seats.seat_number
        FROM (
          SELECT 
            generate_series(1, capacity) AS seat_number,
            zone_name
          FROM zone_detail
          WHERE concert_id = $1
        ) AS all_seats
        LEFT JOIN (
          SELECT
            z.zone_name,
            t.seat_number
          FROM transaction t
          JOIN zone_detail z ON t.zone_id = z.zone_id
          WHERE z.concert_id = $1
        ) AS sold_seats
        ON all_seats.zone_name = sold_seats.zone_name AND all_seats.seat_number = sold_seats.seat_number
        WHERE sold_seats.seat_number IS NULL;
      `;
      // use generate_series(1, z.capacity) for generate a series of integers from 1 to z.capacity:

      const availableSeatsResult = await pool.query(q, [ concert.concert_id ]);
      const seats = availableSeatsResult.rows;

      // filter() method accepts a function (often called a callback function)
      // that is executed once for each element in the Array
      // the callback function must return a boolean value
      // console.log(seats.filter((seat) => { return seat.zone_name === 'C' }));
        
      res.render('concertDetail.ejs', { 
        u : req.user,
        concert: concert, 
        seats : seats
      });
  } catch (err) {
    console.error('error massage*(/listConcerts/:concert_id): ', err);
    res.send('Error loading concert detail');
  }
});

app.post("/reset",async (req, res) =>{
   const { username,phone, passwordNew } = req.body;
  try {
    const q = `
      SELECT username, phone
      FROM "user_detail"
      WHERE username = $1
        AND phone = $2
      LIMIT 1
    `;
    console.log("this");
     const { rows }= await pool.query(q, [username,phone]);

    if (rows.length === 0) {
      return res.status(401).render('response.ejs',{
        msg : [ 'ชื่อผู้ใช้หรือเบอร์โทรไม่ถูกต้อง' ],
        addPath : [
          {path: '/login', text: 'ย้อนกลับ'}
        ]
      });
    }
    const qq = `
    UPDATE "user_detail" 
    SET password = crypt($1, gen_salt('bf')) 
    WHERE username = $2  RETURNING *
    `;
    await pool.query(qq, [passwordNew,username]);
   return res.render('response.ejs', {
    icon : 'greenCheck',
    msg : [ 'reset password Succeed' ],
    addPath : [
      {path: '/login', text: 'ลงชื่อเข้าใช้'}
    ]
   });

  } catch (e) {
    console.error(e);
   return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.post("/buyTicket", requireRole("user"), async (req, res) => {
    
  const { concert_id, zone_name, seat_number } = req.body;
    try {
    const q = `
      INSERT INTO transaction(user_id, zone_id, seat_number) 
      SELECT 
        $1 AS user_id,
        zone_id,
        $2 AS seat_number
      FROM zone_detail
      WHERE concert_id = $3 AND zone_name = $4;
    `;

    await pool.query(q, [ req.user.user_id, seat_number, concert_id, zone_name ] ); // ดักจับที่นั่งซ้ำ

    res.render('response.ejs', {
      u : req.user,
      icon : 'greenCheck',
      msg : [
        'บันทึกการจองสำเสร็จ',
        'เราได้บันทึกการจองของคุณเรียบร้อบแล้ว',
        'กรุณาชำระค่าใช้จ่ายตามเวลาที่กำหนด',
        'ระยะเวลาในการขำระ 24 ชม.',
        'ขอบคุณที่ใช้บริการ'
      ],
      addPath : [
        {path: '/', text: 'กลับไปหน้าหลัก'},
        {path: '/purchase_history', text: 'ไปหน้าประวัติการสั่งซื้อ'},
      ]
    });
  } catch (e) {
    console.error(e.message);
    if (e.code === '23505') { //ดักจับที่นั่งซ้ำ
     
      return res.status(409).render('response.ejs', { 
        mess:"ที่นั่งนี้ถูกจองไปแล้ว",
        u : req.user,
        mag : [ 'ที่นั่งนี้ถูกจองไปแล้ว' ],
        addPath : [
          {path: `/listConcerts/${concert_id}`, text: 'ย้อนกลับ'}
        ]
      });
    }
    return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.get("/purchase_history", requireRole('user', 'admin'), async (req, res) => {
  try {
    let q;
    let params;

    if (req.user.role === 'admin') {
      // Admin: ALL users' transactions
      q = `
        SELECT 
          t.trans_id,
          z.zone_name,
          t.seat_number,
          z.base_price,
          to_char(t.purchase_date, 'HH24:MI on DD Month YYYY') AS formatted_purchase_date,
          c.title,
          u.user_id,
          u.username
        FROM "transaction" t
        JOIN zone_detail z ON t.zone_id = z.zone_id
        JOIN concert_detail c ON z.concert_id = c.concert_id
        JOIN user_detail u ON t.user_id = u.user_id
        ORDER BY t.purchase_date DESC 
      `;
      params = []; 
    } else {
      //  User: only their own transactions
      q = `
        SELECT 
          t.trans_id,
          z.zone_name,
          t.seat_number,
          z.base_price,
          to_char(t.purchase_date, 'HH24:MI on DD Month YYYY') AS formatted_purchase_date,
          c.title
        FROM "transaction" t
        JOIN zone_detail z ON t.zone_id = z.zone_id
        JOIN concert_detail c ON z.concert_id = c.concert_id
        WHERE t.user_id = $1
        ORDER BY t.purchase_date DESC
      `;
      params = [req.user.user_id];
    }
    const result = await pool.query(q, params);

    // Get list of zone names only
    // const all_trans_id = result.rows.map(row => row.trans_id);
    // console.log('all transaction id: ', all_trans_id);

    // result = The entire response object from the database driver.
    // data type : Object
    // is Used to get metadata about the query, 
    // such as the command executed, the number of rows affected, and the fields returned.
    // vvvvvvvvvvv
    // console.log(result);

    // result.rows = An array containing only the actual data (the records) returned by the query.
    // data type : Array
    // is Used to iterate over the data and display it or process it in your application.
    // vvvvvvvvvvv
    // console.log(result.rows);

    res.render('purchase_history.ejs', { 
      u : req.user,
      ts : result.rows
     });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
});

app.delete('/admin/delete/:trans_id', async (req, res) =>{
  const { trans_id } = req.params;
  try {
    await pool.query(`DELETE FROM "transaction" WHERE trans_id = $1`, [ trans_id ]);
    res.json({ message: 'Transaction deleted'});
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
});

app.get("/editProfile", (req, res) => {
  res.render('edit_profile.ejs', { u : req.user });
});

app.post("/editProfile/update", async (req, res) => {
  const { inputUsername, inputPhone, inputPass } = req.body;
  try {
    const validPassword = await pool.query(
      'SELECT * FROM "user_detail" WHERE user_id = $1 AND password = crypt($2, password) LIMIT 1',
      [req.user.user_id, inputPass]
    );
    if (validPassword.rows.length === 0) {
      console.log("wrong password input");
      return res.status(400).json({ message: 'Invalid password' });
    }

    // RETURING is unnecessary but just keep it for curiousity
    await pool.query(
      'UPDATE "user_detail" SET username = $1, phone = $2 WHERE user_id = $3 RETURNING *',
      [inputUsername, inputPhone, req.user.user_id]
    );

    req.session.user.username = inputUsername;
    req.session.user.phone = inputPhone;

    console.log("profile update succesfully");
    res.render('response.ejs', {
      icon : 'greenCheck',
      msg : [ 'แก้ไขโปรไฟล์สำเร็จ' ],
      addPath : [
        {path: '/', text: 'กลับไปหน้าหลัก'},
      ]
    });
  } catch (err) {
    if (err.code === '23505') {
      console.error('Username already exists');
      return res.render('response.ejs', {
        msg : [ 'ชื่อผู้ใช้นี้มีอยู่แล้ว', 'โปรดลองใหม่อีกครั้ง' ],
        addPath : [ {path: '/editProfile', text: 'ย้อนกลับ'} ]
      });
    }
    console.error('error massage: ', err.message);
    res.status(500).send('Server error');
  }
});

app.post("/editProfile/updatePass", async (req, res) => {
  const { inputUsername, inputPhone, inputPass, inputPassNew } = req.body;
  try {
    const validPassword = await pool.query(
      'SELECT * FROM "user_detail" WHERE user_id = $1 AND password = crypt($2, password) LIMIT 1',
      [req.user.user_id, inputPass]
    );
    if (validPassword.rows.length === 0) {
      console.log("wrong password input");
      return res.status(404).json({ message: 'Invalid password' });
    }

    const q = `
    UPDATE "user_detail" 
    SET username = $1, phone = $2, password = crypt($3, gen_salt('bf')) 
    WHERE user_id = $4 RETURNING *
    `;
    await pool.query(q, [inputUsername, inputPhone, inputPassNew, req.user.user_id]);

    req.session.user.username = inputUsername;
    req.session.user.phone = inputPhone;

    console.log("profile update succesfully");
    res.render('response.ejs', {
      icon : 'greenCheck',
      msg : [ 'แก้ไขโปรไฟล์สำเร็จ' ],
      addPath : [
        {path: '/', text: 'กลับไปหน้าหลัก'},
      ]
    });
  } catch (err) {
    if (err.code === '23505') {
      console.error('Username already exists');
      return res.render('response.ejs', {
        msg : [ 'ชื่อผู้ใช้นี้มีอยู่แล้ว', 'โปรดลองใหม่อีกครั้ง' ],
        addPath : [ {path: '/editProfile', text: 'ย้อนกลับ'} ]
      });
    }
    console.error('error massage: ', err.message);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
  console.log(`URL : http://localhost:${port}/`);
});