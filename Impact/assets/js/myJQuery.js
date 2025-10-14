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
