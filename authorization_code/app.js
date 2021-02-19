/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var sqlite3 = require('sqlite3').verbose();

var client_id = '0619847e14194e56a1626645d10a33d9'; // Your client id
var client_secret = 'b4b7fe03489e497985eeac2ec7ea969b'; // Your secret
var redirect_uri = 'http://127.0.0.1:8888/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */

 var sqlDB = new sqlite3.Database('../spotify.db', sqlite3.OPEN_READWRITE, function(err, db){
  if (err) throw err;
  console.log('sqlDB is running');
});

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());


app.get('/login', function(req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);
  // your application requests authorization
  var scope = 'user-read-private user-read-email user-read-currently-playing user-read-playback-state user-modify-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {
	// your application requests refresh and access tokens
	// after checking the state parameter
	var code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? req.cookies[stateKey] : null;
  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    // res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {
	      var sql = "INSERT INTO userInfo(cookie, access_token, refresh_token) VALUES('"+storedState+"', '"+body.access_token+"', '"+body.refresh_token+"')";

	      sqlDB.run(sql, [], function(err){
		      if (err) { return console.error(err.message);}
		      console.log('insert done.');
	      });

	      res.redirect('/#');
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/userLogin', function(req, res) {
  var cookie = req.query.cookie; //req.cookies['spotify_auth_state'];
    if(cookie){
    var sql = "SELECT access_token, refresh_token FROM userInfo WHERE cookie='"+cookie+"'";
    sqlDB.get(sql, [ ], (err, row) => {
        if (err) throw err;
        if(row){
	        var access_token = row.access_token,
              refresh_token = row.refresh_token;

	        var options = {
		        url: 'https://api.spotify.com/v1/me',
		        headers: { 'Authorization': 'Bearer ' + access_token },
		        json: true
	        };
	        // use the access token to access the Spotify Web API
	        request.get(options, function(error, response, body) {
		        if (!error && response.statusCode === 200) {
			        var returnArr = {'result': true, 'access_token': access_token, 'display_name': body.display_name};
			        res.json(returnArr);
            }else{
		          console.log('Access_token expired.');
		          //if token expired, use refresh_token to get a new token
			        refreshToken(refresh_token, cookie, function(returnArr){
				        res.json(returnArr);
              });
            }
	        });
        }else{
	        res.json( {'result': false, 'err': 'no record in sql database!'});
        }
      });   
    }
});

app.get('/getTime', function(req, res) {
	var date = new Date();
	var current_hour = date.getHours();
	if(current_hour >= 5 && current_hour < 12){
		var greeting = "Rise & Shine";
	}else if(current_hour >= 12 && current_hour < 18){
		greeting = "Good Afternoon";
	}else if(current_hour >= 18 && current_hour < 23){
		greeting = "Good Evening";
	}else{
		greeting = "Night Night";
	}

	var returnArr = {'result': true, 'greeting': greeting};
	res.json(returnArr);
});

function refreshToken(refresh_token, cookie, callback){
	var authOptions = {
		url: 'https://accounts.spotify.com/api/token',
		form: {
			grant_type: 'refresh_token',
			refresh_token : refresh_token
		},
		headers: {
			'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
		},
		json: true
	};

	request.post(authOptions, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			var sql = "UPDATE userInfo SET access_token='"+body.access_token+"' WHERE cookie='"+cookie+"'";
			sqlDB.run(sql, [], function(err){
				if (err) { return console.error(err.message);}
				console.log('update access_token into sql database done.');
			});
			var access_token = body.access_token;
			var options = {
				url: 'https://api.spotify.com/v1/me',
				headers: { 'Authorization': 'Bearer ' + access_token },
				json: true
			};
			request.get(options, function(error, response, body) {
				if (!error && response.statusCode === 200) {
					var returnArr = {'result': true, 'access_token': access_token, 'display_name': body.display_name};
				}else{
					returnArr = {'result': false, 'err': 'Could not get user info.'};
				}
				return callback(returnArr);
			});
		}else{
			//token expired and authorized been removed.
			var sql = "UPDATE userInfo SET cookie='----expired----' WHERE cookie='"+cookie+"'";
			sqlDB.run(sql, [], function(err){
				if (err) { return console.error(err.message);}
				console.log('Authorized been removed, so remove cookie in sql.');
			});
			var returnArr = {'result': false, 'err': 'Can not use refresh_token to get a new access_token. Authorized may be removed.'};
			return callback(returnArr);
		}

	});
}


app.get('/getPlayerInfo', function(req, res) {
    var access_token = req.query.access_token;
    var options = {
      url: 'https://api.spotify.com/v1/me/player',
      headers: { 'Authorization': 'Bearer ' + access_token },
      json: true
    };
    request.get(options, function(error, response, body) {
      res.json(body);
    });
});

app.get('/play', function(req, res) {
    var access_token = req.query.access_token;
    var options = {
      url: 'https://api.spotify.com/v1/me/player/play',
      headers: { 'Authorization': 'Bearer ' + access_token },
      json: true
    };
    request.put(options, function(error, response, body) {
      res.json('play');
    });
});

app.get('/pause', function(req, res) {
    var access_token = req.query.access_token;
    var options = {
      url: 'https://api.spotify.com/v1/me/player/pause',
      headers: { 'Authorization': 'Bearer ' + access_token },
      json: true
    };
    request.put(options, function(error, response, body) {
      res.json('pause');
    });
});

app.get('/playNext', function(req, res) {
    var access_token = req.query.access_token;
    var options = {
      url: 'https://api.spotify.com/v1/me/player/next',
      headers: { 'Authorization': 'Bearer ' + access_token },
      json: true
    };
    request.post(options, function(error, response, body) {
      res.json(body);
    });
});

app.get('/playPrevious', function(req, res) {
    var access_token = req.query.access_token;
    var options = {
      url: 'https://api.spotify.com/v1/me/player/previous',
      headers: { 'Authorization': 'Bearer ' + access_token },
      json: true
    };
    request.post(options, function(error, response, body) {
      res.json(body);
    });
});

app.get('/volume', function(req, res) {
	var access_token = req.query.access_token;
	var volume = req.query.volume;
	var options = {
		url: 'https://api.spotify.com/v1/me/player/volume?volume_percent='+volume,
		headers: { 'Authorization': 'Bearer ' + access_token },
		json: true
	};
	request.put(options, function(error, response, body) {
		res.json('pause');
	});
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);
