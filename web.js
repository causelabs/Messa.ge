var express     = require('express'),
    mongoose    = require('mongoose'),
    fs          = require('fs'),
    Schema      = mongoose.Schema,
    https       = require('https'),
    io          = require('socket.io'),
    querystring = require('querystring'),
    _           = require('underscore');

Myapp = {
    sandbox: false
};
Myapp.twilio = {
    config: {
        accountSid: process.env.TWILIO_ACCOUNTSID,
        authToken: process.env.TWILIO_AUTHTOKEN,
        number: process.env.TWILIO_NUMBER,
        host: 'api.twilio.com',
        path: process.env.TWILIO_PATH
    },
    getHttpsConfig: function() {
        return {
            host: Myapp.twilio.config.host,
            port: 443,
            path: Myapp.twilio.config.path,
            method: 'POST',
            auth: Myapp.twilio.config.accountSid + ':' + Myapp.twilio.config.authToken
        };
    },
    sendSms: function(httpsOptions, queryString, cb) {
        // Disable SMS messages in sandbox mode
        if (Myapp.sandbox) {
            return;
        }

        // Send Sms
        var twilioReq = https.request(httpsOptions, cb);

        twilioReq.write(queryString);
        twilioReq.end();
    }
};


/**
 * A bevvy of functions
 */
Myapp.functions = {
    getSmsMessage: function(data) {
        /**
         * Construct the text message we'll send to participants
         */
        var message = data.surveyor + " wants to know:\n" +  data.question + "?\n"; 
        var optionNum;
        for (var i = 0, l = data.questionOptions.length; i < l; i++) {
            optionNum = i + 1;
            message = message +  optionNum + '~ ' + data.questionOptions[i].value +  "\n";
        }
        return message + 'REPLY WITH NUMBER';
        
    },
    getSummaryMessage: function(survey) {
        /**
         * Construct the Summary message when no winner is required
         */
        var tally = this.tallyResponses(survey);
        var message = 'Results for: ' + survey.question + "?\n";
        var optionNum;
        for (var i = 0, l = survey.questionOptions.length; i < l; i++) {
            optionNum = i + 1;
            message = message +  optionNum + '~ ' + survey.questionOptions[i].value +  ' = ' + tally[i] + "\n";
        }
        return message;

    },
    allVotesIn: function(participants) {
        /**
         * Runs through the participants to see if they have all responded
         */
        for (var i = 0, l = participants.length; i < l; i++) {
            if (participants[i].response === null) {
                return false;
            }            
		}
        return true;
    },
    getResponseRate: function(participants) {
        /**
         * Calculates the response rate of the participants
         */
        var total = participants.length,
            responses = 0;
        for (var i = 0, l = participants.length; i < l; i++) {
            if (participants[i].response !== null) {
                responses++;
            }
    	}
        return responses / total * 100;
    },
    getAgree: function(survey) {
        /**
         * Find the neccessary agreement number to calculate a winner
         */
        return Math.round((survey.participants.length * survey.consensus) / 100) ;
    },
    tallyResponses: function(survey) {
        /**
         * Tally our responses
         */

        // We allow a max of four options
        var tally = [0,0,0,0];

        var participants = survey.participants;

        // Run through participant responses and see if we have a consensus
        for (var i = 0, l = participants.length; i < l; i++) {
            var answer = participants[i].response;
            if (answer) {
                console.log('Participant: ' + participants[i].mobile + ' = ' + answer);
                tally[answer - 1]++;
            }

    	}

        return tally;
        
    },
    findWinner: function(tally, agree) {
        // Figure out if we have a winner yet.
        for (var i = 0, l = tally.length; i < l; i++) {
            if (tally[i] >= agree) {
                return i;
            }
        }

        return null;

    },
    formatMobile: function(data) {
        /**
         * Run through the mobile numbers and make sure they are formatted to
         * spec.
         * They need to be ten digits, then have +1 prepended.
         */
        var participants = data.participants;
        for (var i = 0, l = participants.length; i < l; i++) {
            var mobile = participants[i].mobile;
            // Skip this stuff if the mobile is not defined.
            if (mobile === null) {
                continue;
            }

            // Strip out non-numbers
            mobile = mobile.replace(/[^\d.]/g, '');
            
            // Ensure 10 digits long, so what shall I do if it's too longer or
            // too short????
            // Chomp off leading 1 if 11 digits
            if (mobile.length === 11 && mobile.charAt(0) === '1') {
                mobile = mobile.substring(1);
            }
                
            // Add +1
            mobile = '+1' + mobile;
            participants[i].mobile = mobile;
		}
    },
    sendSmsToParticipants: function(participants, message, cb) {
        /**
         * POST info for sending SMS
         */
        var twilioPost = {
            From:   Myapp.twilio.config.number,
            Body:   message,
        };


        /**
         * Send SMS
         */
        var httpsOptions = Myapp.twilio.getHttpsConfig();

        for (var i = 0, l = participants.length; i < l; i++) {
            var participant = participants[i];

            // Config post data
            twilioPost.To = participant.mobile;
            
            // Convert post to a query string
            queryString = querystring.stringify(twilioPost);

            // Append headers to httpsOptions
            httpsOptions.headers = {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Content-Length': queryString.length
            };
            
            // Send SMS
            var sms = Myapp.twilio.sendSms(httpsOptions, queryString, cb);
        }   
    }
};

/**
 * Create NodeServer
 */
var app = express.createServer(express.logger());
app.configure(function(){
    app.use(express.static(__dirname + '/public'));
    app.set('views', __dirname + '/public');
    app.use(express.bodyParser());
    app.set('view options', {layout: false});
    app.register('.html', {
        compile: function(str, options) {
            return function(locals){
                return str;
            };
        }
    });
});


/**
 * Configuration
 */
app.configure('production', function() {
    mongoose.connect(process.env.MONGODB_URI);
});


var port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log("Listening on " + port);
  console.log(process.env.NODE_ENV);
});


/**
 * Socket.io listener
 */
var sio = io.listen(app),
    sioClients = [];

sio.sockets.on('connection', function(socket) {
    sioClients.push(socket);
});



var OptionSchema     = new Schema({
    value: String,
    votes: Number
});

/**
 * Embedded Participant info
 */
var ParticipantSchema = new Schema({
    name: String,
    mobile: String,
    response: Number,
    responseCreatedOn: Date
});

/**
 * Main Survey object
 */
var SurveySchema      = new Schema({
    type: String,
    surveyor: String,
    question: String,
    questionOptions: [OptionSchema],
    participants: [ParticipantSchema],
    consensus: Number,
    minResponse: Number,
    result: Number,
    createdOn: {type: Date, "default": Date.now}
});

var Option = mongoose.model('option', OptionSchema);
var Participant = mongoose.model('participant', ParticipantSchema);
var Survey = mongoose.model('survey', SurveySchema);

app.get('/survey/:id', function(req, res) {
    res.render('index.html');
});

/**
 * Client posts a new survey to nodejs
 */
app.post('/sms/send.json', function(req, res) {
    var data = req.body;
    console.log(data);


    // Check data for sanity

    // Strip out numeric in mobilephones
    Myapp.functions.formatMobile(data);

    // Get the formatted message
    var message = Myapp.functions.getSmsMessage(data);
    console.log(message);

    /**
     * Save to MongoHQ
     */
    var survey = new Survey(data);
    survey.save( function(error, data){
        if (error) {
            console.log(error);
        } else {
            console.log(data);
        }
    });

    res.send({id: survey._id}); 

    if (Myapp.sandbox) {
        return; /// Testing... forgo the SMS request to Twilio if in sandbox mode
    }

    /**
     * Send out a txt to all participants with question
     */
    Myapp.functions.sendSmsToParticipants(survey.participants, message, function(res) {
        console.log('statusCode', res.statusCode);
        console.log('headers', res.headers);

        res.on('data', function(d) {
            process.stdout.write(d);
        });
    });

    res.send({id: survey._id});

});

/**
 * Utility to find surveys
 */
app.get('/surveys', function(req, res) {
    Survey.find({}, {}, {safe: true}, function(err, data) {

        if (err) {
            console.log(err);
            return;
        }
        console.log(data);
        var output = '';
        for (var i = 0, l = data.length; i < l; i++) {
            output = output + data[i].question;
		}
        res.send(output);
    });
});

/**
 * Process response from a participant via SMS
 */
app.post('/twilio/sms/response', function (req, res) {
    // Need to get the POST data
    var data = req.body;

    var smsResponse = data.Body.replace(/[^\d.]/g, '');

    // Find the survey associated with this phone#
    Survey.where('participants.mobile', data.From).desc('createdOn').findOne(function(err, survey) {
        if (err) {
            console.log(err);
            return;
        }

        // No survey found.... nothing to see here
        if (null === survey) {
            console.log('record not found');
            return;
        }

        console.log(survey);

        if (survey.length === 0 && survey.participants.length === 0) {
            console.log('No results');
            return;
        }

        // If the result has already been set, do not send again.
        if (survey.result !== null) {
            console.log('Not going to resend a survey... results were: ' + survey.result);
            return;
        }

        var participants = survey.participants;
        for (var i = 0, l = participants.length; i < l; i++) {
            var participant = participants[i];
            // Match the From # to the participant mobile
            if (participant.mobile == data.From) {
                // Do not allow them to change their vote
                // Ensure body exists, should be safe to just test existance as
                // the number should be 1-4
                if (participant.response == null && data.Body) {
                    participant.response = smsResponse;
                } else {
                // We also don't want a double vote to trigger an SMS message
                // to everyone
                    return;
                }
            }
		}


        if (survey.type === 'survey') {
            /**
             * Use a summary only response
             */
            var message = Myapp.functions.getSummaryMessage(survey);
            var allVotes = Myapp.functions.allVotesIn(survey.participants);
            var responseRate = Myapp.functions.getResponseRate(survey.participants);
            var minResponse = survey.minResponse || 0;

            /**
             * If There is no minResponse, we'll check to make sure all votes
             * are in... then we'll send a summary
             */
            if ((!minResponse) && allVotes) {
                console.log('Im sending a summary... all votes in and no minResponse');

                survey.result = 1;

                // Send SMS
                Myapp.functions.sendSmsToParticipants(survey.participants, message, function(res) {
                    console.log('statusCode', res.statusCode);
                    console.log('headers', res.headers);

                    res.on('data', function(d) {
                        process.stdout.write(d);
                    });
                });                
            } else if (minResponse && responseRate >= minResponse) {
                /**
                 * If a minimum reponse has been set, then we'll make sure it's
                 * set and that our responseRate is above the minResponse
                 */
                console.log('Im sending a summary... min response has been meet');
                survey.result = 1;

                // Send SMS
                Myapp.functions.sendSmsToParticipants(survey.participants, message, function(res) {
                    console.log('statusCode', res.statusCode);
                    console.log('headers', res.headers);

                    res.on('data', function(d) {
                        process.stdout.write(d);
                    });
                });  

            }
        } else {  // survey.type === 'winner'
            
            // Tally the results
            var tally = Myapp.functions.tallyResponses(survey);

            // Get a winner if there is one.... returns null if no winner;
            var winner = Myapp.functions.findWinner(tally, Myapp.functions.getAgree(survey));

            console.log('Winner is: ' + winner);

            /**
             * Tallying the results come up with a winner
             */
            if (null !== winner) {
                // Save winner
                survey.result = winner;
                // Send off response to SMS participants
                var message = 'The response to: ' + survey.question + "? \n" + 'IS: ' + survey.questionOptions[winner].value;

                Myapp.functions.sendSmsToParticipants(survey.participants, message, function(res) {
                    console.log('statusCode', res.statusCode);
                    console.log('headers', res.headers);

                    res.on('data', function(d) {
                        process.stdout.write(d);
                    });
                });

                // Send socket.io of winner to client
                sio.sockets.emit('winner', {
                    winner: winner
                });

            }
        }

        survey.save(function(err){
            console.log(err);
            return;
        });

        sio.sockets.emit('response', {
            mobile: data.From,
            response:  smsResponse
        });

    });

    // Need to look up survey with matching From
    
    res.send('done');
});


/**
 * Polling from the client
 */
app.get('/poll/:id', function(req, res) {
    res.send(req.params.id);

});


