/* edit profile buttons in edit_profile.ejs */
$(document).ready(function(){
  $('.editnamebtn').click(function(){
    $('.editUsername').toggleClass("disable");
    $('.editnamebtn').toggleClass("disable");
  });

  $('.editphonebtn').click(function(){
    $('.editPhone').toggleClass("disable");
    $('.editphonebtn').toggleClass("disable");
  });

  $('.editpassbtn').click(function(){
    $('.passwordLabel').toggleClass("disable");
    $('.editpassbtn').toggleClass("disable");
    $('#input-passwordNew').toggleClass("disable");
    $('.clear-password').val("");
  });
});
/* edit profile buttons in edit_profile.ejs */

let username;
let phone;

async function getUserData() {
  try {
    const res = await fetch("/api/user");
    const user = await res.json();

    username = user.username;
    phone = user.phone;
  } catch (err) {
    console.error("Error fetching user:", err);
  }
}

function resetDefault(n) {
    if (n == 1) { document.getElementById("input-username").value = username; }
    if (n == 2) { document.getElementById("input-phone").value = phone; }   
}

function resetAllDefault() {
    document.getElementById("input-username").setAttribute("value", username);
    document.getElementById("input-phone").setAttribute("value", phone);
}

document.getElementById("edit-form").addEventListener('submit', async (e) => {
    e.preventDefault();
    if (confirm(`คุณแน่ใจว่าต้องการแก้ไขโปรไฟล์ตามข้อมูลที่กรอกหรือไม่?`)) {
      if (document.getElementById("input-passwordOld").value === "") {
          document.getElementById("no-password-entered").innerHTML = "โปรดป้อนรหัสผ่านเพื่อทำการ";
      }
      const inputUsername = document.getElementById("input-username").value;
      const inputPhone = document.getElementById("input-phone").value;
      const inputPass = document.getElementById("input-passwordOld").value;
      const inputPassNew = document.getElementById("input-passwordNew").value;
      let response;

      if (inputPassNew === "") {
          const formData = new URLSearchParams();
          formData.append('inputUsername', inputUsername);
          formData.append('inputPhone', inputPhone);
          formData.append('inputPass', inputPass);

          response = await fetch('/editProfile/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
          });
      }
      else {
          response = await fetch('/editProfile/updatePass', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputUsername, inputPhone, inputPass, inputPassNew })
          });
      }
      const msg = await response.json();
      console.log('Server response:', msg.message);
      if (response.status === 200) {
          username = inputUsername;
          phone = inputPhone;
          console.log("user as ", username);
          console.log("num as", phone);
      }
      alert(msg.message);
    }
});

getUserData().then(() => {
  resetAllDefault();
});