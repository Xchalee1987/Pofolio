// toggle register page in login_page.html
$(document).ready(function(){
  $('#toggle-register a').click(function(){
    $('.toggle-form').hide();
    $('#registration-page').fadeIn(400);
  });

  $('.toggle-login a').click(function(){
    $('.toggle-form').hide();
    $('#login-page').fadeIn(400);
  });

  $('#toggle-reset a').click(function(){
    $('.toggle-form').hide();
    $('#reset-page').fadeIn(400);
  });
});
// toggle register page in login_page.html

// toggle user info in loginNav.ejs
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
// toggle user info in loginNav.ejs