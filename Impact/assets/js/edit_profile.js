/* edit profile buttons in edit_profile.ejs */
$(document).ready(function(){
  $('.editnamebtn').click(function(){
    $('#input-username').toggleClass("disable");
    $('.editnamebtn').toggleClass("disable");
  });

  $('.editphonebtn').click(function(){
    $('#input-phone').toggleClass("disable");
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

let username = document.getElementById("input-username").value;
let phone = document.getElementById("input-username").value;
const inputUsernameBox = document.getElementById("input-username");
const inputPhoneBox = document.getElementById("input-phone");
const inputNewPasswordBox = document.getElementById("input-passwordNew");
const editForm = document.getElementById("edit-form");

function resetDefault(n) {
    if (n == 1) { inputUsernameBox.value = username; }
    if (n == 2) { inputPhoneBox.value = phone; }   
}

function confirmToSetAction() {
  if (confirm(`คุณแน่ใจว่าต้องการแก้ไขโปรไฟล์ตามข้อมูลที่กรอกหรือไม่?`)) {
    inputPassNew = inputNewPasswordBox.value;

    // if (message)	Checks if message is NOT null,
    // undefined, 0, false, or an empty string ("").
    // This is the standard "has value" check. [Not Null/Undefined/Empty]
    //
    // if (message && message.trim().length > 0)	Checks that the variable exists 
    // AND that its length is greater than zero after removing leading/trailing whitespace
    // (best for user input). [Not Empty String]
    let useAction = '';
    if (inputPassNew) {
      useAction = '/editProfile/updatePass';
    }
    else {
      useAction = '/editProfile/update';
    }

    editForm.action = useAction;
    return true;
  }
  else return false;
}