'use strict';

/* jasmine specs for controllers go here */

describe('App.Controllers.Controller', function(){
  var controller,scope;

  beforeEach(function(){
        scope = {};
      controller = new App.Controllers.Controller(scope);
    
  });


  it('should create default survey', function() {
    expect(scope.survey.surveyor).toBe(null);
    expect(scope.survey.consensus).toBe("50");
    expect(scope.survey.question).toBe(null);
    expect(scope.survey.sent).toBe(false);
  });

  it('should require telephone to be 10 digits', function() {
    var phone = '2185551212';
    var result = phone.match(scope.telephone);
    expect(result[0]).toBe(phone);
  });

  it('should add new option', function() {
    expect(scope.survey.questionOptions.length).toBe(1);
    scope.addOption();
    expect(scope.survey.questionOptions.length).toBe(2);
  });

  it('should add new participant', function() {
    
    expect(scope.survey.participants.length).toBe(1);
    scope.addParticipant();
    expect(scope.survey.participants.length).toBe(2);
    
    
  });
});


