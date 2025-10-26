$(document).ready(function(){
  $('.message a').click(function(){
    $('.login-page').animate({height:"toggle", opacity:"toggle"}, "slow");
  });
});

$(document).ready(function(){
  $('#profile').click(function(e) {
    e.preventDefault();
    $('.overlay-toggle').animate({width:"toggle", opacity:"toggle"}, "fast");
  });
  
  $('.overlay-container').on('click', function(e) {
    if (!$('.overlay').is(e.target) && $('.overlay').has(e.target).length === 0) {
      $('.overlay-container').animate({width:"toggle", opacity:"toggle"}, "fast");
    }
  });
});

/* User progfile in edit_profile.ejs */
$(document).ready(function(){
  $('.editnamebtn').click(function(){
    $('.editUsername').toggleClass("disable");
    $('.editnamebtn').toggleClass("disable");
    $('.resetEditUsername').toggleClass("disable");
  });

  $('.editphonebtn').click(function(){
    $('.editPhone').toggleClass("disable");
    $('.editphonebtn').toggleClass("disable");
    $('.resetEditPhone').toggleClass("disable");
  });

  $('.editpassbtn').click(function(){
    $('.passwordLabel').toggleClass("disable");
    $('.editpassbtn').toggleClass("disable");
    $('#input-passwordNew').toggleClass("disable");
    $('.clear-password').val("");
  });
});
/* User progfile in edit_profile.ejs */
