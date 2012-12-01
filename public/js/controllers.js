'use strict';

/* Controllers */
var myapp = angular.module('myApp', [], function($locationProvider) {
    $locationProvider.html5Mode(true);
})
.factory('SurveyService', function() {
    var today = new Date();
    var survey = {
        type: '',
        surveyor: null,
        question: null,
        questionOptions: [{
            value: null,
            tally: 0
        }],
        consensus: null,
        participants: [{
            mobile: null,
            name: null,
            response: null
        }],
        minResponse: 100,
        sent: false,
        expiration: today.setDate(today.getDate() + 4),
        result: null
    };


    return survey;
});
var App = {};
App.Controllers = {};
App.Controllers.Html5Ctl = function($scope, $location) {
    $scope.$location = $location;

    $scope.changeUrl = function() {
        $scope.$location.path('survey/dude');
    };
};
App.Controllers.Controller = function($scope, $http, $defer, $location, SurveyService) {
    $scope.id = null;
    $scope.survey = SurveyService;

    // Telephone validation pattern
    $scope.telephone = /^[\d]{10}$/;

    $scope.showObject = function() {
        console.log($scope.survey);
    };
    $scope.showId = function() {
        console.log($scope.id);
    };

    /** 
     * Process the response from the server
     */
    var socket = io.connect('/');
    socket.on('response', function(data) {
        console.log(data);
        $scope.updateParticipant(data);        
    });

    /**
     * Process a winner if we receive one from the server
     */
    socket.on('winner', function(data) {
        $scope.setResult(data);
    });

    $scope.setResult = function(data) {
        $defer(function(){
            $scope.survey.result = data.winner;
        },200); 
    };

    /**
     * Check if the Send button should be enable
     */
    $scope.isSendDisabled = function() {
        return $scope.questionForm.$invalid || $scope.participantForm.$invalid || $scope.surveyorForm.$invalid || $scope.isOverCharCount();
    };

    $scope.updateParticipant = function(data) {
        // Strip +1 from mobile number
        var mlength = data.mobile.length;
        var mobile = data.mobile.substr(2, mlength);
        console.log(mobile);
        // Find object in participants array
        var participant = _.find($scope.survey.participants,function(obj) { 
            return obj.mobile === mobile;
        });
        // Update response
        $defer(function(){
            participant.response = data.response;
        }, 200);


        // Inc tally for question
        var response = data.response;
            response--; 
            console.log(response);
        $scope.survey.questionOptions[response].tally++;

    };

    /**
     * Add an question option
     */
    $scope.addOption = function() {
        $scope.survey.questionOptions.push({
            value: null,
            tally: 0
        });
    };

    /**
     * Remove a question option
     */
    $scope.removeOption = function(option) {
        for (var i = 0, len = $scope.survey.questionOptions.length; i < len; i++) {
            if (option === $scope.survey.questionOptions[i]) {
                $scope.survey.questionOptions.splice(i,1);
            }
        }
    };

    /**
     * Style a response based on tally / totalVotes
     */
    $scope.questionOptionStyle = function(option) {
        if (option.tally > 0) {
            var totalVotes = $scope.survey.participants.length,
                percentage = option.tally / totalVotes,
                elementWidth = 400;
            return {
                width: (option.tally / totalVotes)  * 100 + '%'
            };
        } else {
            return {
                width: '15%',
                backgroundColor: '#7BBE91',
                backgroundImage: 'none'
            }
        }
    };

    /**
     * Add class to winner option
     */
    $scope.winnerClass = function(index) {
        return index === $scope.survey.result ? 'badge-success' : '';
    };


    /**
     * Add a mobile participant
     */
    $scope.addParticipant = function() {

        $scope.survey.participants.push({
            name: null,
            mobile: null,
            response: null,
        });

        $scope.newName = $scope.newNumber = '';

    };

    /**
     * Delete a mobile participant
     */
    $scope.deleteParticipant = function(participant) {
        for (var i = 0, len = $scope.survey.participants.length; i < len; i++) {
            if (participant === $scope.survey.participants[i]) {
                $scope.survey.participants.splice(i,1);
            }
        }
    };

    /**
     * Print response next to participant
     */
    $scope.printResponse = function(response) {
        if (response !== null) {
            var index = response - 1;
            var option = $scope.survey.questionOptions[index].value;
            return response + '. ' + option;
        }
        return;
    };

    /**
     * Pretty indepth character count
     */
    $scope.characterCount = function() {
        var total = 0,
            s = $scope.survey;

        total = s.surveyor ? total + s.surveyor.length : total;
        total = s.question ? total + s.question.length : total;
        for (var i = 0, l = s.questionOptions.length; i < l; i++) {
            total = s.questionOptions[i].value ? total + s.questionOptions[i].value.length : total;
		}
        
        //total = total + s.question ? s.question.length : 0;
        return total;
    };

    $scope.isOverCharCount = function() {
        if ($scope.characterCount() > 100) {
            return true;
        }
        return false;
    };

    /**
     * Get name of option based on response
     */
    $scope.getOptionName = function(response) {
        if (response !== null) {
            var index = response;
            $defer(function(){
                return $scope.survey.questionOptions[index--].value;
            }, 200);
        }
    };
        

    /**
     * Send to server to save and send out sms
     */
    $scope.sendSms = function() {
        // If already sent, we don't want it sent twice
        if ($scope.survey.sent) {
            return;
        }
        
        $http({
            method: 'POST', 
            url: '/sms/send.json',
            data: $scope.survey,
        }).
        success(function(data, status) {
            console.log(data);
            $scope.id = data.id
            $scope.xhrdata = data + new Date();
            $scope.survey.sent = true;
            $location.path('survey/' + data.id);
        }).
        error(function(data, status) {
            console.log('failed');
        });
    };


};
