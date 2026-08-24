# ระบบจองตั๋วคอนเสิร์ต
เป็นระบบที่ใช้ express ร่วมกับ Middleware body-parser เพื่อส่งrequest และ response
เชื่อมต่อกับ database PostgreSQL อย่าง pgAdmin4 

app.js เป็นไฟล์หลักในโปรเจคนี้
# app.js  ----> Runโดย nodemon app.js

views เป็น โฟรเดอร์ที่ใช้เก็บไฟล์หน้าต่างไว้เป็น .ejs 

Tables
  concert_detail
    concert_id, title, artist, date, "time", detail, image_path, bgimage_path
  session
    sid, sess, expire
  transaction
    trans_id, user_id, zone_id, seat_number, purchase_date
  user_detail
    user_id, username, phone, password, role
  zone_dtail
    zone_id, concert_id, zone_name, base_price, capacity

