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
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false, // Don’t save session if nothing changed
    saveUninitialized: false, // Don’t create a session until something is stored in it
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24, // 1 วัน
    },
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'assets')));

// --- Helper: แนบ user เข้ากับ req จาก session ---
app.use((req, res, next) => {  //ทำทุกครั้งที่มีการ Request เข้ามา
  if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
});

app.get("/", (req, res) => {  //localhost:3000 ที่เรียกใช้
  res.render("main.ejs", { u : req.user });
});

// --- Middleware: ต้องล็อกอินก่อน ---
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).sendFile(path.join(__dirname, 'public', 'login_page.html'));
  }
  next();
}

// check in case user without login enter where "no role" can't enter
// (enter the path that contain /u will check if user login yet)
app.use((req, res, next) => {
  const openPaths = ["/", "/login", "/logout", "/register","/reset", "/naruto", "/Lisa", "/Mayaram", "/Solo", "/cocktail"]; //เส้นทางที่เข้าถึงได้โดยไม่ต้อง Login
  if (openPaths.includes(req.path)) { //เช็คreq ที่ถูกส่งมาปัจจุบันว่า มีใน path ในนี้ไหม 
    return next();  //ถ้า ใช่ ให้ไปต่อ
  }
  // ต้องแยกออกมาเพราะ path นี้มี path parameters/ route parameters
  // without this the event pages can't fetch available seats if not login first
  if (req.path.startsWith("/fetchSeats")) {
    return next();
  }
  return requireAuth(req, res, next); //ถ้าไม่ ให้ไปทำฟังชั่น requireAuth บรรทัดที่ 63
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).send("กรุณาลงชื่อเข้าใช้");
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('No_login.ejs', {
         mess:"คุณไม่มีสิทธิ"
        ,u : req.user });
      // return res.status(403).send("ไม่มีสิทธิ์");
    }
    next();
  };
}

// click on ลงชื่อเข้าใช้ in index.html will check first if already login
app.get("/login", (req, res) => {  
  if(req.user){
    return res.render("main.ejs", { u : req.user });
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

    const { rows } = await pool.query(q, [username, password]); // ถ้าตรวจสอบแล้วพบ มันจะส่ง 1 กลับมา

    if (rows.length === 0) {
      return res.status(401).render('No_login.ejs',{
        mess:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
      
        , u : req.user }
        
      );
    }

    const u = rows[0];
    req.session.user = {
      user_id: u.user_id,
      username: u.username,
      phone: u.phone,
      role: u.role,
    };
    res.render("main.ejs", { u });
  } catch (e) {
    console.error(e);
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

    return res.render('register.ejs');
  } catch (e) {
    console.error(e);
    if (e.code === '23505') {
      return res.status(409).send(`
        <h1>ชื่อผู้ใช้ซ้ำกรุณาลงทะเบียนใหม่</h1>
        <a href="/login">ย้อนกลับ/a>
        `);
    }
    return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
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
      return res.status(401).render('No_login.ejs',{
        mess:"ชื่อผู้ใช้หรือเบอร์โทรไม่ถูกต้อง "}      
      );
    }
    const qq = `
    UPDATE "user_detail" 
    SET password = crypt($1, gen_salt('bf')) 
    WHERE username = $2  RETURNING *
    `;
    await pool.query(qq, [passwordNew,username]);
   return res.render("Yes_reset.ejs");

  } catch (e) {
    console.error(e);
   return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

app.post("/buyTicket", requireRole("user"), async (req, res) => {
    
  const { concert_title, zone_name, seat_number } = req.body;
    try {
    const q = `
      INSERT INTO transaction(user_id, zone_id, seat_number) 
      SELECT 
        $1 AS user_id,
        z.zone_id,
        $2 AS seat_number
      FROM zone_detail z
      JOIN concert_detail c
        ON z.concert_id = c.concert_id
      WHERE c.title = $3 AND z.zone_name = $4;
    `;

    await pool.query(q, [req.user.user_id, seat_number, concert_title, zone_name]);//ดักจับที่นั่งซ้ำ

    res.render('succeed.ejs', { u : req.user });
  } catch (e) {
    console.error(e);
    if (e.code === '23505') { //ดักจับที่นั่งซ้ำ
     
      return res.status(409).render('No_login.ejs', { 
        mess:"ที่นั่งนี้ถูกจองไปแล้ว",
        u : req.user });
    }
    return res.status(500).send("เกิดข้อผิดพลาดภายในระบบ");
  }
});

//path to each event
app.get("/naruto", (req, res) => {
 res.render('naruto.ejs', { u : req.user });
});

app.get("/cocktail", (req, res) => {
 res.render('cocktail.ejs', { u : req.user });
});

app.get("/Solo", (req, res) => {
 res.render('solo.ejs', { u : req.user });
});

app.get("/Mayaram", (req, res) => {
 res.render('Mayaram.ejs', { u : req.user });
});

app.get("/Lisa", (req, res) => {
 res.render('Lisa.ejs', { u : req.user });
});
// End path


app.get("/purchase_history", (req, res) => {
  res.render('purchase_history.ejs', { u : req.user });
});

app.get("/editProfile", (req, res) => {
  res.render('edit_profile.ejs', { u : req.user });
});

// fetch user transaction for display in purcahse_history.ejs
app.get('/fetchTransactions', async (req, res) => {
  try {
    let q;
    let params;

    if (req.user.role === 'admin') {
      // Admin: fetch ALL users' transactions
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
      //  User: fetch only their own transactions
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

    res.json(result.rows);
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
})

// fetch seat available in events.ejs
app.get('/fetchSeats/:concert_title/:zone_name', async (req, res) => {
  const { concert_title, zone_name } = req.params;
  try {
    const q = `
        SELECT seat_number
        FROM (
          SELECT generate_series(1, z.capacity) AS seat_number
          FROM zone_detail z
          JOIN concert_detail c ON z.concert_id = c.concert_id
          WHERE c.title = $1 AND z.zone_name = $2
        ) AS all_seats
        WHERE seat_number NOT IN (
          SELECT t.seat_number
          FROM transaction t
          JOIN zone_detail z ON t.zone_id = z.zone_id
          JOIN concert_detail c ON z.concert_id = c.concert_id
          WHERE c.title = $1 AND z.zone_name = $2
        )
      `;
      // use generate_series(1, z.capacity) for generate a series of integers from 1 to z.capacity:
    const result = await pool.query(q, [ concert_title, zone_name ]);
    res.json(result.rows);
  } catch (err) {
    console.error('error massage: ', err.message);
    res.status(500).send('unable to fetch seats for zone: ', zone_name);
  }
});

app.delete('/admin/delete/:id', async (req, res) =>{
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM "transaction" WHERE trans_id = $1`, [ id ]);
    res.json({ message: 'Transaction deleted'});
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).send('Query to database not successful');
  }
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
      return res.status(404).json({ message: 'Invalid password' });
    }

    await pool.query(
      'UPDATE "user_detail" SET username = $1, phone = $2 WHERE user_id = $3 RETURNING *',
      [inputUsername, inputPhone, req.user.user_id]
    );

    req.session.user.username = inputUsername;
    req.session.user.phone = inputPhone;

    console.log("profile update succesfully");
    return res.status(200).json({ 
      message: 'profile update'
    });
  } catch (err) {
    if (err.code === '23505') {
      console.error('Username or Phone Number already exists');
      return res.status(400).json({ 
        message : 'Username or Phone Number has been taken'
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
    return res.json({ message: 'profile update' });
  } catch (err) {
    if (err.code === '23505') {
      console.error('Username or Phone Number already exists');
      return res.json({ message : 'Username is already taken' });
    }
    console.error('error massage: ', err.message);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
  console.log(`URL : http://localhost:${port}/`);
});