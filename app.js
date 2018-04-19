var express = require('express');
var app = express();
var request = require('request');

var flash = require('connect-flash');
app.use(flash());

var handlebars = require('express-handlebars').create({defaultLayout: 'main'});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

var formidable = require('formidable');
var fs = require('fs');
var Jimp = require('jimp');
app.use(require('body-parser').urlencoded({extended: true}));
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/uploads'));

var session = require('express-session');
app.use(session({
    resave: false,
    saveUninitialized: false,
    secret: 'compsci719'
}));

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var sqlite3 = require('sqlite3').verbose();

app.set('port', process.env.PORT || 3000);

passport.serializeUser(function(user, done){
    done(null, user.userId);
});

passport.deserializeUser(function(userId, done){
    // get the user object from db
    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    // select user from db based on username
    db.get ('SELECT userId, userName FROM user WHERE userId = ?', userId, function(err, row){
        // if user does not exist from the database return false, else get the user
        if(!row){
            res.redirect('/signup');
        } else {
            var user = row;
            done(null, user);
        }
    });  
});

// username and password authentication
passport.use('local', new LocalStrategy({passReqToCallback: true}, function (req, username, password, done){
        validateUser(req, username, password, done);
    }
));

app.use(passport.initialize());
app.use(passport.session());

//startup page
app.get('/', function(req, res){
    res.render('startup', {layout: 'startupLayout'});
})

// login page
app.get('/login', function(req, res){
    var errorMsg = req.flash('error')[0];
    var info = req.flash('info')[0];
    res.render('login', {layout: 'loginmain', errorMsg:errorMsg, info:info});
})

// after user enter username and password
app.post('/login',
    passport.authenticate('local', {
        failureRedirect: '/login',
        failureFlash: true
}), function(req, res) {
    req.session.user=req.user.userId;
    req.session.admin = true;
    res.redirect('/home/' + req.user.userId);
});

// make sure a user is logged in
function isLoggedIn(req, res, next){
    //if user is authenticated, carry on
    if (req.isAuthenticated()){
        return next();
    } else {
        req.flash('info', 'Please log in.')
        res.redirect('/login');
    }
}

app.get('/logout', function(req, res){
    req.session.regenerate(function(){
        req.logout();
        res.render('logout',{layout: 'logoutLayout'});
    });   
})

//display sign up page
app.get('/signup', function(req, res) {
    res.render('signup', { layout: 'signupLayout' });
});

// create user account
app.post("/createAccount", function(req, res){
    var email = req.body.email;
    var userName = req.body.userName;

    // reCaptcha
    if(req.body['g-recaptcha-response'] === undefined || req.body['g-recaptcha-response'] === '' || req.body['g-recaptcha-response'] === null) {
        return res.json({"responseCode" : 1,"responseDesc" : "Please select captcha"});
    }
    // Put your secret key here.
    var secretKey = "6LfkYQoUAAAAALSxHMdi19fjSJrISx2ygAUAKnru";
    // req.connection.remoteAddress will provide IP address of connected user.
    var verificationUrl = "https://www.google.com/recaptcha/api/siteverify?secret=" + secretKey + "&response=" + req.body['g-recaptcha-response'] + "&remoteip=" + req.connection.remoteAddress;
    // Hitting GET request to the URL, Google will respond with success or error scenario.
    request(verificationUrl, function(error,response,body) {
        body = JSON.parse(body);
        // Success will be true or false depending upon captcha validation.
        if(body.success !== undefined && !body.success) {
        console.log({"responseCode" : 1,"responseDesc" : "Failed captcha verification"});
        } 
        console.log({"responseCode" : 0,"responseDesc" : "Sucess"});
        
    });

    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    db.serialize(function(){
       // check if user already exist
       var stmt = "SELECT * FROM user WHERE userName = '" + userName + "' OR email = '" + email + "'";
       db.get(stmt, function(err, rows){
           if (err) throw err;
           if(typeof rows !== "undefined"){
               req.flash('Duplicate account details. Please enter another email or username and try again.');
               res.redirect('/signup');
           } else {
                // stores a new entry of user to the database
                db.run('INSERT INTO user (password, userName, email) VALUES (?, ?, ?)', [req.body.password, req.body.userName, req.body.email], function(err){
					if(err){
						console.log('Error updating user database: ' + err)
					}
				});
                // retrieve userId from user table
                db.all('SELECT * FROM user ORDER BY userId ASC', function(err, rows){
					if(err){
						console.log('Error finding user: ' + err)
					}
                    userId = rows[rows.length - 1].userId;
                    // enter data into profile table
                    createProfile(userId,req,res);
                });
            }
        });
           
    });

});

// display user homepage
app.get('/home', isLoggedIn, function(req, res) {
    res.redirect('/home/' + req.user.userId);
});

app.get('/home/:userId', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    var profile = [];
    var article = [];
    var multimedia = [];
    var articleCount= [];
    var mediaCount= [];
    var color = "#" + RandomColor();
    var headercolor = "#" + RandomColor();
    var display;
    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    var errors = req.flash('error')[0];

    db.serialize(function(){
        // retrieves the profile from the profile table that matches the id
        db.all('SELECT * FROM profile WHERE userId=?', req.params.userId, function(err, rows) {
			if(err){
				console.log('Error retriving user profile: ' + err);
			}
            rows.forEach(function (row) {  
                profile.push({
                    "fName":row.fName, 
                    "lName":row.lName, 
                    "userId":row.userId, 
                    "userName":row.userName, 
                    "dob":row.dob, 
                    "gender":row.gender, 
                    "email":row.email, 
                    "occupation":row.occupation, 
                    "hobbies":row.hobbies,
                    "profileImage":row.profileImage
                });
            });
        });   
        
        // count articles from the article table that matches the id
        db.all('SELECT COUNT(*) AS articleCount FROM article WHERE deleted IS NULL AND userId=?', req.params.userId, function(err, rows){
			if(err){
				console.log('Error counting article: ' + err);
			}
            rows.forEach(function(row){
                articleCount.push({"count":row.articleCount});
           });  
        });

        // retrieve articles from the article table that matches the id
        db.all('SELECT * FROM article WHERE deleted IS NULL AND userId=?', req.params.userId, function(err, rows){
			if(err){
				console.log('Error retrieving article: ' + err);
			}
            rows.forEach(function(row){
                var dateArray = row.date.split(" ");
                var date = dateArray[0] + " " + dateArray[1] + " " + dateArray[2] + " " + dateArray[3];
                article.push({"articleId":row.articleId, "title":row.title, "date":date});
            });  
        });

        // count multimedia from media table that matches the id
        db.all('SELECT COUNT(*) AS mediaCount FROM media WHERE deleted IS NULL AND userId=?', req.params.userId, function(err, rows){
			if(err){
				console.log('Error counting media: ' + err);
			}
            rows.forEach(function(row){
                mediaCount.push({"count":row.mediaCount});
            });  
        });

        // retrieve multimedia from media table that matches the id
        db.all('SELECT * FROM media WHERE deleted IS NULL AND userId=?', req.params.userId, function(err, rows){
			if(err){
				console.log('Error retrieving media: ' + err);
			}
            rows.forEach(function(row){
                var dateArray = row.date.split(" ");
                var date = dateArray[0] + " " + dateArray[1] + " " + dateArray[2] + " " + dateArray[3];
                multimedia.push({"title":row.caption, "date":date, "route":row.title});
            });
                res.render('home', {
                    fName:profile[0].fName, 
                    lName:profile[0].lName, 
                    userId:profile[0].userId, 
                    userName:profile[0].userName, 
                    dob: profile[0].dob, 
                    gender:profile[0].gender, 
                    email:profile[0].email, 
                    occupation:profile[0].occupation, 
                    hobbies:profile[0].hobbies,
                    profileImage:profile[0].profileImage,
                    articleCount:articleCount[0].count,
                    article:article,
                    mediaCount:mediaCount[0].count,
                    multimedia:multimedia,
                    color:color,
                    headercolor:headercolor,
                    user:user,
                    errors: errors
            });  
        });
        db.close();
    });
});

// display edit profile page
app.get('/profile/:userId', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    // check if user is the same person who owns the profile
    if(user != req.params.userId){
        // if not the same person
        req.flash('error','You do not have permission to edit this profile');
        res.redirect('/home/' + req.params.userId);
    } else {
        // if the same person render the edit profile page
        var photoPath = __dirname + '/public/photos/';
        var photoDisplay = [];
        var profile = [];
        var color = "#" + RandomColor();
        var headercolor = "#" + RandomColor();

        // get all file and directory names in the Photos folder
        fs.readdir(photoPath, function(err, files){
            // if there is an error, assume the folder does not exist, or cannot be read
            if (err) {
                console.log(err);
                res.end();
            } else {
                var thumbSuffix = "_thumbnail.png";
                
                // For each file or directory name found, 
                // adds to the imageDisplay string if it is a full-size image
                files.forEach( function (file) {
                    if (file.endsWith(thumbSuffix)) return;
                    if (file.endsWith('jpg') || file.endsWith('png') || file.endsWith('gif')) {
                        var photo = file;
                        // found the full size image 
                        // and try to find the matching thumbnail file for the image
                        var fileNamePrefix = file.substring(0, file.indexOf('.'));
                        var thumbnail = fileNamePrefix + thumbSuffix;
                        photoDisplay.push({"photo":photo, "thumbnail": thumbnail});
                    }
                });
            }
        });
        
        var db = new sqlite3.Database(__dirname + '/db/blog.db');

        // retrieves the profile from the profile table that matches the id
        db.all('SELECT * FROM profile WHERE userId=?', req.params.userId, function(err, rows) {
			if(err){
				console.log('Error retrieving profile: ' + err);
			}
            rows.forEach(function (row) {  
                profile.push({
                    "fName":row.fName, 
                    "lName":row.lName, 
                    "userId": row.userId, 
                    "userName": row.userName, 
                    "dob":row.dob, 
                    "gender": row.gender, 
                    "email": row.email, 
                    "occupation": row.occupation, 
                    "hobbies": row.hobbies,
                    "profileImage":row.profileImage
                });
            });
            res.render('edit_profile', {
                fName:profile[0].fName, 
                lName:profile[0].lName, 
                userId:profile[0].userId, 
                userName:profile[0].userName, 
                dob: profile[0].dob, 
                gender:profile[0].gender, 
                email:profile[0].email, 
                occupation:profile[0].occupation, 
                hobbies:profile[0].hobbies,
                profileImage:profile[0].profileImage,
                color:color,
                photoDisplay:photoDisplay,
                headercolor:headercolor,
                user: user
            });  
        });   
        db.close();
    } 
});

// update user profile with submitted form data
app.post('/updateProfile/:userId', function(req, res, next) {
    var user = req.user.userId;
    console.log(user);
    
    var userId;
    var defaultProfile;
    
    // parsing the form and update profile data
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, file){
		if(err){
			console.log('Error parsing the form: ' + err);
		}		
        
        userId = fields.userId;
        defaultProfile = fields.defaultProfile;
    
        var db = new sqlite3.Database(__dirname + '/db/blog.db');
        db.run('UPDATE profile SET email=?, hobbies=?, occupation=? WHERE userId=?',
        [fields.email, fields.hobbies, fields.occupation, userId], function(err){
			if(err){
				console.log('Error updating profile: ' + err);
			}
		});
        db.close();
    });

    // upload image to profileImages folder
    var maxFileSize = 5* 1024 *1024; //5Mb
    var fileName;
    var filePath;
    var profileImage = '/profileImages/' + user + '.jpg';
    form.on('fileBegin', function(name, file){
        if(file.name !== ''){
            var fileType = file.type.split('/').pop();
            if(form.bytesExpected > maxFileSize || (fileType != 'jpeg' && fileType != 'png' && fileType != 'gif' && fileType != 'jpg')){
                this.emit('error', 'Size must not be over 5Mb and the file must be an image');
            } else {
                fileName = 'profile.jpg'
                file.path = __dirname + '/public/profileImages/' + fileName;
                filePath = file.path;
            } 
        } else {
            console.log('No image uploaded');
        }
            
    });

    //log any errors from the form
    form.on('error', function(err){
        console.log('An error has occured: \n' + err);
        next(err);
    });

    // rename the profile image and render user home page
    form.on('end', function(){
        if(typeof filePath !== 'undefined' && typeof filePath !== ''){
            resizeProfileImage(filePath, profileImage);
            var db = new sqlite3.Database(__dirname + '/db/blog.db');
            db.run('UPDATE profile SET profileImage=? WHERE userId=?',
            [profileImage, userId], function(err){
				if(err){
					console.log('Error updating profile: ' + err);
				}
			});
            db.close();
            res.redirect('/home/' + userId);
        } else if (typeof defaultProfile !== '' && typeof defaultProfile !== 'undefined'){
            filePath = __dirname + '/public' + defaultProfile;
            resizeProfileImage(filePath, profileImage);
            var db = new sqlite3.Database(__dirname + '/db/blog.db');
            db.run('UPDATE profile SET profileImage=? WHERE userId=?',
            [profileImage, userId], function(err){
				if(err){
					console.log('Error updating profile: ' + err);
				}
			});
            db.close();
            res.redirect('/home/' + userId);
        } else {
            res.redirect('/home/' + userId);
        }
    });
});

app.get('/deleteAccount/:userId', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    var accountOwner;

    var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
    db.get("SELECT userId FROM user WHERE userId=?", req.params.userId, function(err, rows){
		if(err){
			console.log('Error finding user: '+ err);
		}
        accountOwner = rows.userId;
        if (user != accountOwner){
            req.flash('error', 'You do not have permission to delete this account.')
            res.redirect('/home/' + req.params.userId);
        } else {
            var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
            db.run("UPDATE user SET deleted=? WHERE userId=?", ["yes", req.params.userId], function(err, next){
                if (err) throw err;
            });
            db.run("UPDATE profile SET deleted=? WHERE userId=?", ["yes", req.params.userId], function(err, next){
                if (err) throw err;
                res.redirect('/logout');
            });
            db.close();  
        }
    });

});

// render the add post page
app.get('/addpost', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    res.render('addPost', {user:user});
});

// add new post to the database
app.post('/addPost', function (req, res) {

    var user = req.user.userId;
    var articleId ="";
    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    // stores a new entry of article to the database
    var form = new formidable.IncomingForm();
    
    form.on('fileBegin', function (name, file){
        if(file.name !== ''){
            // replace spaces in any uploaded files with underscores
            file.name = file.name.replace(/\s+/g,"_");
            file.path = __dirname + '/uploads/' + file.name; 
            console.log(file.path);
        } else {
            console.log('No image uploaded.')
        }
        
    });

    form.multiples=true;
    var user = req.user.userId;
    form.parse(req, function (err, fields, files) {
        if(err){
            console.log('Error parsing the form: ' + err);
        }
        var currentDate = Date();
            console.log("right before db.run");
            db.serialize (function() {
                db.run("INSERT INTO article (title, content, date, userId) VALUES (?,?,?,?);", 
                [fields.title, fields.content, currentDate, user], function(err){
					if (err) {
						console.log('Error updating article: ' + err);
					};
				});
                
				var numOfFile = 0;
                if (files.fileUpload.name == "") {
                        numOfFile = 0;
                } else if (files && files.fileUpload.length == undefined) {
                        numOfFile = 1;
                } else {
                    numOfFile = files.fileUpload.length;
                }
                    if (numOfFile == 1) {
                        console.log("right before db.run media");
                        db.run("INSERT INTO media (title, caption, type, date, articleId, userId) VALUES (?,?,?,?,?,?);", 
                        ["/" + files.fileUpload.name, fields["caption-"+0], files.fileUpload.type, currentDate, articleId, user], 
                        function (err) { 
                            console.log('Error updating media database: '+ err);
                        });
                    } else if (numOfFile > 1) {
                        for (i=0; i < numOfFile; i++){
                            console.log("right before db.run media loop");
                            db.run("INSERT INTO media (title, caption, type, date, articleId, userId) VALUES (?,?,?,?,?,?);", 
                            ["/" + files.fileUpload[i].name, fields["caption-"+i], files.fileUpload[i].type, currentDate, articleId, user], 
                            function (err) {
                                console.log('Error updating media database: '+ err);
                            });
                        } 
                    } 

                //storing articleId
                db.all("SELECT articleId FROM article WHERE date=?", [currentDate], function (err, rows) {
					if (err) {
                        console.log('Error finding articleId: ' + err);
                    }
                    articleId = rows[0].articleId;
                    db.run("UPDATE media SET articleId=? WHERE date=?", [articleId, currentDate], function (err){
						console.log('Error updating media database: '+ err);
					});
                    db.close();
                    res.redirect('/article/' + articleId);
                });
            });
        });
});

app.get('/article/:id', isLoggedIn, function (req, res) {
    
    var user = req.user.userId;
    var color = "#" + RandomColor();
    var article = {};
    var media = [];
    var comments = [];
    var errors = req.flash('error')[0];

    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    
    // retrieves the article from the articles table that matches the id
    db.all('SELECT title, caption, deleted, type FROM media WHERE articleId=?', req.params.id, function (err, rows) {
		if (err){
			console.log('Error retriving article: ' + err);
		}
		for (i = 0; i < rows.length; i++) { 
			if(rows[i].deleted === "yes") {continue;}
				var mediaHTML;
				var captionHTML;
				if(rows[i].type.split("/")[0] === "image"){
					mediaHTML = "<img class='articleImage' id='featuredImage' src=" + rows[i].title + " alt='placeholder' ; />"
                    captionHTML = "<div class='page' id='descriptionText'>" + rows[i].caption + "</div>"
				} else if (rows[i].type.split("/")[0] === "video") {
					mediaHTML = "<video class='articleVideo' controls><source src=" + rows[i].title + " type="+ rows[i].type +">Your browser does not support the video tag.</video>"
                    captionHTML = "<div class='page' id='descriptionText'>" + rows[i].caption + "</div>"
				}

			media.push({ "mediaHTML": mediaHTML, "captionHTML": captionHTML })
		};
    });

    // retrieves comments from comment table that matches the id
    db.all('SELECT * FROM comment a JOIN profile b ON a.userId = b.userId WHERE a.deleted IS NULL AND a.articleId=?', 
    req.params.id, 
        function (err, rows) {
			if(err){
				console.log('Error retrieving comments: ' + err);
			} 
            for (i = 0; i < rows.length; i++) { 
                comments.push({ "commentId": rows[i].commentId, "comment": rows[i].content, "postDate": rows[i].date, "user": rows[i].userId, "userName": rows[i].userName, "profileImage": rows[i].profileImage, "articleId": req.params.id })
        };
    });

    db.all('SELECT articleId, title, content, deleted FROM article WHERE articleId=?', req.params.id, function (err, rows) {
        if (err){
            console.log('Error retrieving article content: ' + err);
        }
        if(rows[0].deleted === "yes") {
            res.redirect('/addPost');
        } else {
            rows.forEach(function (row) {
                article = {  "articleId": row.articleId, "title": row.title, "content": row.content };
            });
        res.render('viewArticle', { errors:errors, articleId: article.articleId, title: article.title, articleText: article.content, mediaSource: media, commentSource: comments, user:user });

        };
    });
    db.close();
});

app.post('/postComment', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
    var currentDate = Date();
    // stores a new entry of comment to the database
    db.run("INSERT INTO comment (content, date, userId, articleId) VALUES (?,?,?,?);", 
	[req.body.commentContent, currentDate, user, req.body.articleId], 
	function(err){
		if (err){
			console.log('Error storing comment: ' + err);
		}
        res.redirect('/article/' + req.body.articleId);
    });
    db.close();
});

app.post('/editComment/:commentId', isLoggedIn, function(req, res, err) {
	if(err){
		console.log('Error editing comment: ' + err);
	}
    // check if user is the same person who posted the comment
    var user = req.user.userId;
    var commentUser = req.body.userId;
    console.log(req.body.articleId);
   
    if(user != commentUser){
        req.flash('error', 'You do not have permission to edit this comment.')
        res.redirect('/article/' + req.body.articleId);
    } else {
        var db = new sqlite3.Database(__dirname + '/db/blog.db');
        db.run("UPDATE comment SET content=? WHERE commentId=?", 
        [req.body.commentContent, req.body.commentId], function (err) {
			if (err){
				console.log('Error updating comment: '+ err);
			}
            res.redirect('/article/' + req.body.articleId);
        });
        db.close();
    }

});

app.get('/deleteComment/:id/:articleId', isLoggedIn, function (req, res) {
    var user = req.user.userId;
    var commentUser;

    var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
    db.all('SELECT userId FROM comment WHERE commentId = ?', req.params.id, function(err, rows){
		if (err){
			console.log('Error finding user: ' + err);
		}
        // check if user is the same person who posted the comment
        commentUser = rows[0].userId;
        if(user != commentUser){
            // if not the same person as who posted the comment
            req.flash('error', 'You do not have permission to delete this comment.')
            res.redirect('/article/' + req.params.articleId);
        } else {
            // if the same person as who posted the comment
            db.run("UPDATE comment SET deleted=? WHERE commentId=?", ["yes", req.params.id], function(err) {
				if (err){
					console.log("Error deleting comment: "+ err);
				}
                res.redirect('/article/' + req.params.articleId);
            });
            db.close();
        }
    });
});

// make editable page for article and comments
app.get('/edit/:id', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    var articleUser;

    var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
    db.all('SELECT userId FROM article WHERE articleId = ?', req.params.id, function(err, rows){
		if (err){
			console.log('Error finding user: '+ err);
		}
        articleUser = rows[0].userId;
        // check if user is the same person who posted the article
        if(user != articleUser){
            // if user is not the same person who posted the article
            req.flash('error', 'You do not have permission to edit this article.')
            res.redirect('/article/' + req.params.id);
        } else {
            // if user is the same person who posted the article
            var article = [];
            var media = [];
            var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
            // retrieves the article from the articles table that matches the id
            db.all('SELECT articleId, title, content FROM article WHERE articleId=?', req.params.id, function (err, rows) {
                if(err){
                    console.log('Error retrieving article content: ' + err);
                }
                rows.forEach(function (row) {
                    console.log(row);
                    article = {  "articleId": row.articleId, "title": row.title, "content": row.content };
                });
            }); 
            db.all('SELECT title, caption, mediaId, deleted FROM media WHERE articleId=?', req.params.id, function (err, rows) {
                if(err){
					console.log('Error retrieving media: ' + err);
				}
                for (i = 0; i < rows.length; i++) { 
                    if(rows[i].deleted === "yes") continue;
                    
                    media.push({ "mediaPath": rows[i].title, "caption": rows[i].caption, "mediaId": rows[i].mediaId })
                };
                res.render('editArticle', { articleId: article.articleId, title: article.title, articleText: article.content, mediaSource: media, user:user });
            });  
            db.close();
        }
    });
    
});

app.post('/editArticle', function(req, res) {
    var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
    var form = new formidable.IncomingForm();
    
    form.on('fileBegin', function (name, file) {
        if(file.name !== ''){
            // replace spaces in any uploaded files with underscores
            file.name = file.name.replace(/\s+/g,"_");
            file.path = __dirname + '/uploads/' + file.name; 
            console.log(file.path);
        } else {
            console.log('No image uploaded.')
        }
    });
	
	//log any errors from the form
    form.on('error', function(err){
        console.log('An error has occured: \n' + err);
        next(err);
    });

    form.multiples=true;
    var user = req.user.userId;
    form.parse(req, function (err, fields, files) {
		if(err){
			console.log('Error parsing the form: '+ err);
		}

        var articleId = fields.articleId;
        var currentDate = Date();

        var numOfFile = 0;
        if (files.fileUpload.name == "") {
            numOfFile = 0
        } else if (files && files.fileUpload.length == undefined) {
            numOfFile = 1;
        } else {
            numOfFile = files.fileUpload.length;
        }
        

        if (numOfFile == 1) {
            console.log("right before db.run media");
            db.run("INSERT INTO media (title, caption, type, date, articleId, userId) VALUES (?,?,?,?,?,?);", 
            ["/" + files.fileUpload.name, fields["caption-"+0], files.fileUpload.type, currentDate, articleId, user], function (err) { 
                console.log("Error inserting into media: " + err);
            });
        } else if (numOfFile > 1) {
            for (i=0; i < numOfFile; i++){
                console.log("right before db.run media loop");
                db.run("INSERT INTO media (title, caption, type, date, articleId, userId) VALUES (?,?,?,?,?,?);", 
                ["/" + files.fileUpload[i].name, fields["caption-"+i], files.fileUpload[i].type, currentDate, articleId, user], 
                function (err) {
                    console.log("Error inserting into media: " + err);
                });
            };
        }

        if (typeof properFields['mediaId[]'] === 'string') {
            properFields['mediaId[]'] = [properFields['mediaId[]']]
        }

        for ( index in properFields['mediaId[]'] ) {
            mediaId = properFields['mediaId[]'][index];
            console.log(mediaId);
            console.log(properFields['mediaUpdate['+mediaId+']']);
            console.log(properFields['mediaCaptionUpdate['+mediaId+']']);

            if (properFields['mediaUpdate['+mediaId+']'] === "delete") {
                db.run("UPDATE media SET deleted=? WHERE mediaId=?", ["yes", mediaId], function(err) {
                    if(err){
					console.log('Error updating media deleted status: '+ err);
				}
                });
            }

            db.run("UPDATE media SET caption=? WHERE mediaId=?", [properFields['mediaCaptionUpdate['+mediaId+']'], mediaId], function(err) {
				if(err){
					console.log('Error updating media caption: '+ err);
				}  
            });
        }

        db.run('UPDATE article SET title=?, content=? WHERE articleId=?', 
        [fields.title, fields.content, fields.articleId], function(err){
			if(err){
				console.log('Error updating article: '+ err);
                res.redirect('/article/' + fields.articleId);
			}
        });
        db.close();
    });

    var properFields = {};

    form.on('field', function(name, value) {
        if (!properFields[name]) {
            properFields[name] = value;
        } else {
            if (properFields[name].constructor.toString().indexOf("Array") > -1) { // is array
            properFields[name].push(value);
            } else { // not array
            var tmp = properFields[name];
            properFields[name] = [];
            properFields[name].push(tmp);
            properFields[name].push(value);
            }
        }
        });
});

app.get('/delete/:id', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    var articleUser;

    var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
    db.get("SELECT userId FROM article WHERE articleId=?", req.params.id, function(err, rows){
		if(err){
			console.log('Error finding user: '+ err);
		}
        articleUser = rows.userId;
        if (user != articleUser){
            req.flash('error', 'You do not have permission to delete this article.')
            res.redirect('/article/' + req.params.id);
        } else {
            var db = new sqlite3.Database(__dirname + '/db/blog.db'); 
            db.run("UPDATE article SET deleted=? WHERE articleId=?", ["yes", req.params.id], function(err) {
				if(err){
					console.log('Error updating article: '+ err);
				}
            });

            db.run("UPDATE comment SET deleted=? WHERE articleId=?", ["yes", req.params.id], function(err) {
				if(err){
					console.log('Error updating comment: '+ err);
				}
            });

            db.run("UPDATE media SET deleted=? WHERE articleId=?", ["yes", req.params.id], function(err) {
				if(err){
					console.log('Error updating media: '+ err);
				}
                res.redirect('/library');
            });
            db.close();
        }
    });
});

// display gallery
app.get('/gallery', isLoggedIn, function (req, res) {
    var user = req.user.userId;
    var mediaImage = [];
    var mediaVideo = [];

    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    // retrieves the article from the articles table that matches the id

    db.all('SELECT *, type FROM media', req.params.id, function (err, rows) {
		if(err){
			console.log('Error retrieving media: '+ err);
		}
        for (i = 0; i < rows.length; i++) { 
            if(rows[i].deleted === "yes") {continue;}
                var mediaImageHTML;
                var captionImageHTML;
                var mediaVideoHTML;
                var captionVideoHTML;
                if(rows[i].type.split("/")[0] === "image"){
                    mediaImageHTML = "<div class='col-lg-3 col-md-4 col-xs-6 thumb'><a class='html5lightbox' data-group='images'  href=" + rows[i].title + " title='" + rows[i].caption + "'><img style = 'display: inline-block; height: 220px;' class='articleImage' id='featuredImage' src=" + rows[i].title + " alt='placeholder' ; /></a>"
                    captionImageHTML = "<div class='page' id='descriptionText'>" + rows[i].caption + "</div></div>"
                    mediaImage.push({ "mediaImageHTML": mediaImageHTML, "captionImageHTML": captionImageHTML })
                } else if (rows[i].type.split("/")[0] === "video") {
                    mediaVideoHTML = "<div class='col-lg-3 col-md-4 col-xs-6 thumb'><a class='html5lightbox' data-group='videos' href=" + rows[i].title + " title='" + rows[i].caption + "'><video style = 'display: inline-block; height: 220px;' class='articleVideo' controls><source src=" + rows[i].title + " type="+ rows[i].type +">Your browser does not support the video tag.</video></a>"
                    captionVideoHTML = "<div class='page' id='descriptionText'>" + rows[i].caption + "</div></div>"
                    mediaVideo.push({ "mediaVideoHTML": mediaVideoHTML, "captionVideoHTML": captionVideoHTML })
                }
        };
        res.render('gallery', { mediaImageSource: mediaImage, mediaVideoSource: mediaVideo});
        db.close();
    });
});

// display library
app.get('/library', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    var articles = [];
    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    // retrieve all the articles from the article table
    db.all('SELECT * FROM article a JOIN profile b ON a.userId = b.userId WHERE a.deleted IS NULL', 
    function(err, rows){
		if(err){
			console.log('Error retrieving articles: '+ err);
		}
        rows.forEach(function (row){
            var dateArray = row.date.split(" ");
            var date = dateArray[0] + " " + dateArray[1] + " " + dateArray[2] + " " + dateArray[3];
            articles.push({"id":row.articleId, "title": row.title, "userId": row.userId, "date": date, "userName": row.userName, "profileImage":row.profileImage});
        });
        res.render('library', {articles: articles, user:user});
    });
    db.close();
});

app.get('/community', isLoggedIn, function(req, res) {
    var user = req.user.userId;
    var community = [];
    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    // retrieve all the articles from the article table
    db.all('SELECT *, COUNT(b.articleId) as numpost FROM profile a LEFT OUTER JOIN article b ON a.userId=b.userId WHERE a.deleted IS NULL GROUP BY a.userId', 
	function(err, rows){
		if (err){
			console.log('Error retrieving user profiles: '+ err);
		}
        rows.forEach(function (row){
            community.push({"userId": row.userId, "userName": row.userName, "profileImage":row.profileImage, "numpost":row.numpost});
        });
        res.render('community', {community:community, user:user});
    });
    db.close();
});

app.get('/error', function(req, res){
    var errors = req.flash('error')[0];
    res.render('error', {layout: 'loginmain', errors:errors});
})


// 404 catch-all handler (middleware)
app.use(function (req, res, next) {
    req.flash('error', '404 - Not Found');
    res.redirect('/error');
});

// 500 error handler (middleware)
app.use(function (err, req, res, next) {
    console.error(err.stack);
    req.flash('error', '505 - Server Error');
    res.redirect('/error');
});

app.listen(app.get('port'), function () {
    console.log('Express started on http://localhost:' + app.get('port') + '; press Ctrl-C to terminate.');
});

// function for username and password authentication
function validateUser(req, username, password, done){
    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    // select user from db based on username
    db.get ('SELECT userId, userName, password FROM user WHERE deleted IS NULL AND userName = ?', username, function(err, row){
        // if user does not exist from the database return false, else get the user
        if(!row){
            return done(null, false, req.flash('error', 'Incorrect Username or Password'));
        } else {
            var user = row;
            if(user.password == password){
                return done(null, user);
            }
            return done(null, false, req.flash('error', 'Incorrect Username or Password'));
        }
    });
}

function RandomColor() {
  var hex = (Math.round(Math.random()*0xffffff)).toString(16);
  while (hex.length < 6) hex = "0" + hex;
  return hex;
}

function createProfile(userId, req, res) {
    var db = new sqlite3.Database(__dirname + '/db/blog.db');
    db.run('INSERT INTO profile (userId, userName, fName, lName, email, dob, gender) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        userId, 
        req.body.userName, 
        req.body.fName, 
        req.body.lName, 
        req.body.email, 
        req.body.birthday + "/" + req.body.birthmonth + "/" + req.body.birthyear,
        req.body.gender
        ], function(err) {
                if(err) {
                    console.log('Error creating profile: ' + err);
                } else {
                    console.log('Database updated')
                }
				req.flash('info', 'New account created. Please log in.')
                res.redirect('/login');
            });
    
    db.close();
}

function resizeProfileImage (filePath, profileImage){
    console.log(filePath, profileImage);
    Jimp.read(filePath, function (err, img) {
                if (err) throw err;
                // Check the original image size and
                // set the profile image size no greater than 200 pixels
                var imgW = img.bitmap.width;
                var imgH = img.bitmap.height;
                var profileLen = 230;
                if(!(imgW < profileLen && imgH < profileLen)){
                    if (imgW > imgH){
                        var scaleFactor = profileLen/imgW;
                        imgW = Math.round(imgW * scaleFactor);
                        imgH = profileLen
                    } else {
                        var scaleFactor = profileLen/imgH;
                        imgW = Math.round(imgW * scaleFactor);
                        imgH = profileLen;
                    }
                }
                // resize the image and save on disk
                img.resize(imgW, imgH)
                    .write(__dirname + '/public' + profileImage, function(err){
                        if(err) throw err;
                    });
            });
}

