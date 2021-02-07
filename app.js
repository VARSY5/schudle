//Importing
require('dotenv').config()
const express = require('express');
const mongoose = require('mongoose');
const _ = require('lodash');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { google } = require('googleapis');
const credentials = require('./credentials.json');
const fs = require('fs');
const { file } = require('googleapis/build/src/apis/file');
const mime = require('mime-types');

const algorithm = 'aes-256-ctr';
const secretKey = process.env.SECRETKEY; // length must be 32.
const iv = crypto.randomBytes(16);


// drive configuration 
const scopes = [
    'https://www.googleapis.com/auth/drive'
  ];

const auth = new google.auth.JWT(
    credentials.client_email, null,
    credentials.private_key, scopes
);

const drive = google.drive({ version: "v3", auth });

const encrypt = (text) => {
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
};

const decrypt = (hash) => {
    const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(hash.iv, 'hex'));
    const decrpyted = Buffer.concat([decipher.update(Buffer.from(hash.content, 'hex')), decipher.final()]);
    return decrpyted.toString();
};

//express app
const app = express();


//app use
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');


//Creating database
const db = mongoose.connect('mongodb://localhost:27017/schudle', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);


//Session prperties
app.use(session({
    secret: process.env.SECRETKEY,
    resave: false,
    saveUninitialized: true
}));


//Initializing assport with session
app.use(passport.initialize());
app.use(passport.session());


//Creating Schema

const reviewSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: Number,
    message: String,
})

const courseItemSchema = new mongoose.Schema({
    name: String,
    google_id: String,
    extension: String
})


const courseSchema = new mongoose.Schema({
    schoolid: String,
    coursename: String,
    course_username: String,
    professorid: [],
    studentid: [],
    items: [courseItemSchema],
});

const schoolSchema = new mongoose.Schema({
    schoolname: String,
    schoolemail: String,
    adminusername: String,
    shortname: String,
    studentid: [],
    professorid: [],
    courses: [],
});

const userSchema = new mongoose.Schema({
    username: String,
    firstname: String,
    lastname: String,
    schoolname: String,
    schoolshort: String,
    role: {
        type: String,
        enum: ['professor', 'admin', 'student'],
        default: 'student'
    },
    courses: [],
});


//Attach passport to userSchema
userSchema.plugin(passportLocalMongoose);


//Creating Collection
const School = new mongoose.model('School', schoolSchema);
const User = new mongoose.model('User', userSchema);
const Course = new mongoose.model('Course', courseSchema);
const Review = new mongoose.model('Review', reviewSchema);


//Creating Strategy for Authentication
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//Creating Transporter for NodeMailr
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL, // generated ethereal user
        pass: process.env.PASSWORD, // generated ethereal password
    },
});

// setting up multer
var storage = multer.diskStorage({
    destination: function(req, file, cb) {
      cb(null, "./public/"); //here we specify the destination. in this case i specified the current directory
    },
    filename: function(req, file, cb) {
      console.log(file); //log the file object info in console
      cb(null, file.originalname);//here we specify the file saving name. in this case. 
  //i specified the original file name .you can modify this name to anything you want
    }
  });
  
var uploadDisk = multer({ storage: storage });

//Routes

//Home route
app.get("/", function (req, res) {
    res.render("homepage");
});

app.post("/", function (req, res) {
    var button = req.body.button;
    if (button == 'review') {
        const review = new Review({
            name: req.body.name,
            email: req.body.email,
            phone: req.body.number,
            message: req.body.message,
        });
        review.save(function () {
            res.redirect('/');
        })
    }
});

//Register route
app.get("/register", function (req, res) {
    res.render("register");
});

app.post("/register", function (req, res) {
    var schoolname = _.startCase(req.body.schoolname);
    var shortname = _.lowerCase(req.body.shortname);
    var schoolemail = req.body.schoolemail;
    var adminusername = req.body.adminusername;
    var adminfirstname = _.capitalize(req.body.adminfirstname);
    var adminlastname = _.capitalize(req.body.adminlastname);

    const school = new School({
        schoolname: schoolname,
        shortname: shortname,
        schoolemail: schoolemail,
        adminusername: adminusername,

    })

    User.register({
        username: adminusername,
        firstname: adminfirstname,
        lastname: adminlastname,
        schoolname: schoolname,
        role: "admin",
        schoolshort: shortname,
    }, req.body.password, function (err) {
        if (err) {
            console.log(err);
            res.send({
                message: "admin not saved"
            });
        } else {
            school.save(function (err) {
                if (err) {
                    console.log(err);
                    res.send({
                        message: "school not saved"
                    });
                } else {
                    res.send({
                        message: "all saved"
                    });
                }
            });
        }
    })
})

app.post("/register-validation", function (req, res) {
    var val = req.body.val;
    if (val == "schoolname") {
        School.findOne({
            schoolname: _.capitalize(req.body.data.trim()),
        }, function (err, f) {
            if (err) console.log(err);
            else {
                if (f) {
                    res.send({
                        message: "taken"
                    });
                } else {
                    res.send({
                        message: "not taken"
                    });
                }
            }
        })
    }
    if (val == "schoolemail") {
        School.findOne({
            schoolemail: req.body.data.trim()
        }, function (err, f) {
            if (err) console.log(err);
            else {
                if (f) {
                    res.send({
                        message: "taken"
                    });
                } else {
                    res.send({
                        message: "not taken"
                    });
                }
            }
        })
    }
    if (val == "shortname") {
        School.findOne({
            shortname: _.lowerCase(req.body.data.trim()),
        }, function (err, f) {
            if (err) console.log(err);
            else {
                if (f) {
                    res.send({
                        message: "taken"
                    });
                } else {
                    res.send({
                        message: "not taken"
                    });
                }
            }
        })
    }
    if (val == "adminusername") {

        User.findOne({
            username: req.body.data.trim()
        }, function (err, f) {
            if (err) console.log(err);
            else {
                if (f) {
                    res.send({
                        message: "taken"
                    });
                } else {
                    res.send({
                        message: "not taken"
                    });
                }
            }
        })
    }
});

//Custom School login/logout route
app.get("/:schoolname", function (req, res) {
    var shortname = req.params.schoolname;

    School.findOne({
        shortname: shortname
    }, function (err, found) {

        if (!found) {
            res.render("error404");
        } else {
            res.render("login", {
                schoolname: found.schoolname,
                shortname: shortname,
            });
        }
    })
});

app.post("/:schoolname", function (req, res) {
    const username = req.body.username;
    const schoolname = req.params.schoolname;
    const button = req.body.button;

    if (button == "login") {
        User.findOne({
            username: username
        }, function (err, found) {
            if (!found) {

                res.send({
                    message: "User not found"
                })
            } else {
                if (found.schoolshort == schoolname) {
                    const user = new User({
                        username: username,
                        password: req.body.password
                    })
                    req.login(user, function (err) {
                        if (err) {
                            console.log(err);
                            res.send({
                                message: "Bad Credentials"
                            })
                        } else {
                            passport.authenticate("local", function (err, user, info) {
                                if (info) {
                                    req.session.destroy();
                                    res.send({
                                        message: "Bad Credentials"
                                    })
                                } else {
                                    if (found.role === "admin") {
                                        res.send({
                                            message: "admin"
                                        })
                                    } else if (found.role === "professor") {
                                        res.send({
                                            message: "professor"
                                        })
                                    } else if (found.role === "student") {
                                        res.send({
                                            message: "student"
                                        })
                                    }
                                };
                            })(req, res, function () {});
                        }
                    })
                } else {
                    res.send({
                        message: "User not found"
                    })
                }
            }
        })
    }
    if (button == "logout") {
        req.logout();
        res.redirect("/" + schoolname);
    }
})

//forgot password
app.get("/:schoolname/forgot-password", function (req, res) {
    const schoolname = req.params.schoolname;

    res.render('forgot-password', {
        school: schoolname,
        message: ""
    });
})

app.post("/:schoolname/forgot-password", function (req, res) {
    const schoolname = req.params.schoolname;
    const username = req.body.username;
    const userEmail = req.body.email;

    User.findOne({
        username: username,
        schoolname: schoolname
    }, function (err, found) {
        if (found) {
            time = (Date.now() + 900000).toString();
            linkString = schoolname + "-" + userEmail + "-" + username + "-" + time;
            hasedLink = encrypt(linkString);
            token = hasedLink.iv + "-" + hasedLink.content;

            var mailOptions = {
                from: process.env.EMAIL,
                to: userEmail,
                subject: 'Forgot Password',

                html: '<p>Click <a href="http://localhost:3000/recover-password/' + token + '">here</a> to reset your password</p>'
            };

            transporter.sendMail(mailOptions, function (err, info) {
                if (err) {
                    console.log(err);
                }
                res.send("<script>alert('Reset-Password link sent to Your Email. The link will expiries within 15min. Please setup your New Passsword. '); window.history.go(-1);</script>");
            })
        } else {
            res.send("<script>alert('User is not enrolled in this School.'); window.history.go(-1);</script>");
        }

    })
})

//Password Recovery route
app.get("/recover-password/:token", function (req, res) {
    
    const token = req.params.token;
    const haseString = token.toString().split("-");
    const hase = {
        iv: haseString[0].toString(),
        content: haseString[1].toString()
    }
    const linkString = decrypt(hase).split("-");
    const schoolname = linkString[0];
    const username = linkString[2];
    const time = linkString[3];

    if (time > Date.now()) {
        User.findOne({
            username: username,
            schoolname: schoolname
        }, function (err, user) {
            if (user) {
                res.render("recover-password", {
                    token: token,
                    message: ""
                });
            } else {
                //user not found in school. Somthing goes Wrong
                res.render('error404')
            }
        })
    } else(
        //link expired
        res.render('error404')
    )
})

app.post("/recover-password/:token", function (req, res) {

    const token = req.params.token;
    const haseString = token.toString().split("-");
    const hase = {
        iv: haseString[0].toString(),
        content: haseString[1].toString()
    }
    const linkString = decrypt(hase).split("-");
    const schoolname = linkString[0];
    const username = linkString[2];
    const time = linkString[3];
    if (time > Date.now()) {
        User.findOne({
            username: username,
            schoolname: schoolname
        }, function (err, user) {
            if (user) {
                user.setPassword(req.body.password, function (err, updatedUser) {
                    if (err) {
                        console.log(err);
                    }
                    if (updatedUser) {
                        updatedUser.save(function (err) {
                            if (err) {
                                console.log(err);
                            }
                        });
                    }
                })
                user.save(function (err) {
                    if (err) {
                        console.log(err);
                    }
                });
                School.findOne({schoolname: schoolname}, function (err,school) {
                    var short= school.shortname;
                    res.redirect("/" + short);
                });
                
            } else {
                //user not found in school. Somthing goes Wrong
                res.render('error404')
            }
        })
    } else(
        //link expired
        res.render('error404')
    )
})


//reset password route
app.get('/:schoolname/reset-password', function (req, res) {
    const schoolname = req.params.schoolname;

    if (req.isAuthenticated()) {
        res.render("reset_password", {
            message: "",
            school: req.params.schoolname
        });
    } else {
        res.redirect("/" + schoolname)
    }
})

app.post('/:schoolname/reset-password', function (req, res) {
    if (req.isAuthenticated()) {
        if (req.body.new_pass == req.body.conf_pass) {
            req.user.changePassword(req.body.curr_pass, req.body.new_pass, function (err) {
                if (err) {
                    console.log(err);
                    res.send('<script>alert("Your Current Password is incorrect.Please enter the correct password."); window.history.go(-1);</script>');
                } else {
                    res.send('<script>alert("password updated successfully"); window.history.go(-2);</script>');
                }
            })
        } else {
            res.send('<script>alert("Password confirmation doesn\'t match the password"); window.history.go(-1);</script>');
        }
    }
})

//Profiles
app.get("/:schoolname/profile", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.schoolshort == shortname) {
        res.render('profile', {
            shortname: req.params.schoolname,
            info: req.user,
        })
    } else {
        res.redirect("/" + shortname);
    }

})

//Admin Dashboard route
app.get("/:schoolname/admin/dashboard", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        School.findOne({
            shortname: shortname
        }, function (err, find) {
            Course.find({
                schoolid: find._id
            }, function (err, found) {
                res.render("admin_dash", {
                    school: shortname,
                    courses: found,
                    no_student: find.studentid.length,
                    no_professor: find.professorid.length,
                    name: req.user.firstname + ' ' + req.user.lastname,
                });
            })
        })
    } else {
        res.redirect("/" + shortname);
    }
})

//Professor Dashboard route
app.get("/:schoolname/professor/dashboard", function (req, res) {
    const schoolname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "professor" && req.user.schoolshort == schoolname) {
        Course.find({
            professorid: {
                $in: [String(req.user._id)]
            }
        }, function (err, find) {
            res.render("professor_dash", {
                name: req.user.firstname + ' ' + req.user.lastname,
                school: schoolname,
                courses: find
            })
        });
    } else {
        res.redirect("/" + schoolname);
    }
})


//Student Dashboard Route
app.get("/:schoolname/student/dashboard", function (req, res) {
    const schoolname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "student" && req.user.schoolshort == schoolname) {
        Course.find({
            studentid: {
                $in: [String(req.user._id)]
            }
        }, function (err, find) {
            res.render("student_dash", {
                name: req.user.firstname + ' ' + req.user.lastname,
                school: schoolname,
                courses: find
            })
        });
    } else {
        res.redirect("/" + schoolname);
    }
})


//Creating Professor route
app.get("/:schoolname/admin/createprof", function (req, res) {
    const schoolname = req.params.schoolname;

    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        res.render("create_prof", {
            shortname: shortname,
        });
    } else {
        res.redirect("/" + shortname);
    }
})

app.post("/:schoolname/admin/createprof", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        const username = req.body.username;
        const button = req.body.button;

        if (button == 'validate') {
            User.findOne({
                username: username
            }, function (err, found) {
                if (found) {
                    res.send({
                        message: 'User already exist',
                    })
                } else {
                    res.send({
                        message: 'User available',
                    })
                }
            })
        }


        if (button == 'register') {
            const firstname = _.capitalize(req.body.firstname);
            const lastname = _.capitalize(req.body.lastname);
            const schoolname = req.user.schoolname;
            User.register({
                username: username,
                firstname: firstname,
                lastname: lastname,
                schoolname: schoolname,
                role: "professor",
                schoolshort: shortname,
            }, req.body.password, function (err, user) {
                if (err) {
                    console.log(err);
                    res.send({
                        message: 'User not saved',
                    })
                } else {
                    User.findOne({
                        username: username
                    }, function (err, find) {
                        School.findOne({
                            shortname: shortname
                        }, function (err, founded) {
                            if (founded) {
                                founded.professorid.push(find._id)
                                founded.save(function () {
                                    res.send({
                                        message: 'User saved',
                                    })
                                });
                            }
                        })
                    })
                }
            })
        }
    } else {
        res.send({
            message: 'Uauthorised',
        })
    }
})

//Creating Student route
app.get("/:schoolname/admin/createstudent", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        res.render("create_student", {
            shortname: shortname,
        });
    } else {
        res.redirect("/" + shortname);
    }
})

app.post("/:schoolname/admin/createstudent", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        const username = req.body.username;
        const button = req.body.button;

        if (button == 'validate') {
            User.findOne({
                username: username
            }, function (err, found) {
                if (found) {
                    res.send({
                        message: 'User already exist',
                    })
                } else {
                    res.send({
                        message: 'User available',
                    })
                }
            })
        }


        if (button == 'register') {
            const firstname = _.capitalize(req.body.firstname);
            const lastname = _.capitalize(req.body.lastname);
            const schoolname = req.user.schoolname;
            User.register({
                username: username,
                firstname: firstname,
                lastname: lastname,
                schoolname: schoolname,
                role: "student",
                schoolshort: shortname,
            }, req.body.password, function (err, user) {
                if (err) {
                    console.log(err);
                    res.send({
                        message: 'User not saved',
                    })
                } else {
                    User.findOne({
                        username: username
                    }, function (err, find) {
                        School.findOne({
                            shortname: shortname
                        }, function (err, founded) {
                            if (founded) {
                                founded.studentid.push(find._id)
                                founded.save(function () {
                                    res.send({
                                        message: 'User saved',
                                    })
                                });
                            }
                        })
                    })
                }
            })
        }
    } else {
        res.send({
            message: 'Uauthorised',
        })
    }
})


//Creating course route
app.get("/:schoolname/admin/createcourse", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        res.render("create_course", {
            shortname: shortname,
        });
    } else {
        res.redirect("/" + shortname);
    }
})

app.post("/:schoolname/admin/createcourse-validation", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        const val = req.body.val;

        School.findOne({
            shortname: shortname
        }, function (err, find) {

            if (val == 'coursename') {
                Course.findOne({
                    schoolid: find._id,
                    coursename: _.capitalize(req.body.data),
                }, function (err, found) {
                    if (found) {
                        res.send({
                            message: 'taken',
                        })
                    } else {
                        res.send({
                            message: 'not taken',
                        })
                    }

                })
            }

            if (val == 'course_username') {
                Course.findOne({
                    schoolid: find._id,
                    course_username: _.upperCase(req.body.data),
                }, function (err, found) {
                    if (found) {
                        res.send({
                            message: 'taken',
                        })
                    } else {
                        res.send({
                            message: 'not taken',
                        })
                    }
                })
            }
        })
    } else {
        res.send({
            message: 'Uauthorised',
        })
    }
})

app.post("/:schoolname/admin/createcourse", function (req, res) {
    const shortname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == shortname) {
        const coursename = _.capitalize(req.body.coursename);
        const course_username = _.upperCase(req.body.course_username);

        School.findOne({
            shortname: shortname
        }, function (err, find) {
            const newCourse = new Course({
                coursename: coursename,
                course_username: course_username,
                schoolid: find._id,
            });

            newCourse.save(function () {
                Course.findOne({
                    schoolid: find._id,
                    coursename: coursename,
                }, function (err, founded) {
                    find.courses.push(founded._id)
                    find.save(function () {
                        res.send({
                            message: "all saved",
                        });
                    })
                });
            })
        })
    } else {
        res.send({
            message: 'Uauthorised',
        })
    }
})


//Custom Course route
app.get("/:schoolname/admin/courses/:coursename", function (req, res) {
    const schoolname = req.params.schoolname;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        const coursename = req.params.coursename;

        School.findOne({
            shortname: schoolname
        }, function (err, find) {
            Course.findOne({
                coursename: coursename,
                schoolid: find._id
            }, function (err, found) {
                if (found) {
                    var professorid;
                    var studentid;

                    if (found.professorid) professorid = found.professorid;
                    if (found.studentid) studentid = found.studentid;

                    var allids = professorid.concat(studentid);

                    User.find({
                        _id: {
                            $in: allids
                        }
                    }, function (err, founded) {
                        var professors = [];
                        var students = [];


                        for (var i = 0; i < founded.length; i++) {
                            if (founded[i].role == "student") students.push(founded[i].username);
                            if (founded[i].role == "professor") professors.push(founded[i].username);
                        }
                        res.render("course", {
                            school: schoolname,
                            coursename: coursename,
                            name: req.user.firstname + " " + req.user.lastname,
                            professors: professors,
                            students: students,
                        });
                    })
                } else {
                    res.render("error404");
                }
            })
        })
    } else {
        res.redirect("/" + schoolname);
    }
})

app.post("/:schoolname/admin/courses/:coursename", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        const button = req.body.button;

        if (button == "enrollstudent") {
            res.redirect("/" + schoolname + "/admin/courses/" + coursename + "/enrollstudent");
        }
        if (button == "assignprof") {
            res.redirect("/" + schoolname + "/admin/courses/" + coursename + "/assignprof");
        }
        if (button == "removeprof") {
            res.redirect("/" + schoolname + "/admin/courses/" + coursename + "/removeprof");
        }
        if (button == "removestudent") {
            res.redirect("/" + schoolname + "/admin/courses/" + coursename + "/removestudent");
        }
    } else {
        res.redirect("/" + schoolname);
    }
})

//Assigning Professor route
app.get("/:schoolname/admin/courses/:coursename/assignprof", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        School.findOne({
            shortname: schoolname
        }, function (err, found) {

            Course.findOne({
                coursename: coursename,
                schoolid: found._id
            }, function (err, find) {
                if (find) {
                    var a = found.professorid;
                    var b = find.professorid;

                    var professorsid = a.filter(x => !b.includes(x));

                    User.find({
                        _id: {
                            $in: professorsid
                        }
                    }, function (err, founded) {
                        var professors = []
                        for (var i = 0; i < founded.length; i++) {
                            professors.push(founded[i]);
                        }

                        res.render("assign_prof", {
                            school: schoolname,
                            coursename: coursename,
                            professors: professors,
                            message: ""
                        });
                    })

                } else {
                    res.render("error404");
                }
            })
        })

    } else {
        res.redirect("/" + schoolname);
    }
})

app.post("/:schoolname/admin/courses/:coursename/assignprof", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        var professors = req.body.profname;

        if (typeof professors == "string") {
            professors = [];
            professors.push(req.body.profname)
        }
        School.findOne({
            shortname: schoolname
        }, function (err, find) {
            Course.findOne({
                coursename: coursename,
                schoolid: find._id
            }, function (err, found) {

                for (var i = 0; i < professors.length; i++) {
                    found.professorid.push(professors[i]);
                    User.findOne({
                        _id: professors[i]
                    }, function (err, user) {
                        user.courses.push(found._id);
                        user.save(function () {});
                    })
                }
                found.save(function () {
                    res.redirect("/" + schoolname + "/admin/courses/" + coursename);
                })
            })
        })
    } else {
        res.redirect("/" + schoolname);
    }
})

//removing Professor route
app.get("/:schoolname/admin/courses/:coursename/removeprof", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        School.findOne({
            shortname: schoolname
        }, function (err, found) {

            Course.findOne({
                coursename: coursename,
                schoolid: found._id
            }, function (err, find) {
                if (find) {

                    var professorsid = find.professorid;
                    User.find({
                        _id: {
                            $in: professorsid
                        }
                    }, function (err, founded) {
                        var professors = []
                        for (var i = 0; i < founded.length; i++) {
                            professors.push(founded[i]);
                        }

                        res.render("remove_prof", {
                            school: schoolname,
                            coursename: coursename,
                            professors: professors,
                            message: ""
                        });
                    })

                } else {
                    res.render("error404");
                }
            })
        })

    } else {
        res.redirect("/" + schoolname);
    }
})

app.post("/:schoolname/admin/courses/:coursename/removeprof", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        var professors = req.body.profname;

        if (typeof professors == "string") {
            professors = [];
            professors.push(req.body.profname);
        }
        School.findOne({
            shortname: schoolname
        }, function (err, find) {

            for (var i = 0; i < professors.length; i++) {
                var prof_id = professors[i];
                Course.findOneAndUpdate({
                    coursename: coursename,
                    schoolid: find._id
                }, {
                    $pull: {
                        professorid: professors[i]
                    }
                }, function (err, founded) {
                    User.findOneAndUpdate({
                        _id: prof_id
                    }, {
                        $pull: {
                            courses: {
                                $in: founded._id
                            }
                        }
                    }, function (err, found) {});
                });
            }
            res.redirect("/" + schoolname + "/admin/courses/" + coursename);
        })
    } else {
        res.redirect("/" + schoolname);
    }
})


//Enrolling Student route
app.get("/:schoolname/admin/courses/:coursename/enrollstudent", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        School.findOne({
            shortname: schoolname
        }, function (err, found) {

            Course.findOne({
                coursename: coursename,
                schoolid: found._id
            }, function (err, find) {
                if (find) {
                    var a = found.studentid;
                    var b = find.studentid;

                    var studentid = a.filter(x => !b.includes(x));

                    User.find({
                        _id: {
                            $in: studentid
                        }
                    }, function (err, founded) {
                        var students = []
                        for (var i = 0; i < founded.length; i++) {
                            students.push(founded[i]);
                        }

                        res.render("enroll_student", {
                            school: schoolname,
                            coursename: coursename,
                            students: students,
                            message: ""
                        });
                    })

                } else {
                    res.render("error404");
                }
            })
        })

    } else {
        res.redirect("/" + schoolname);
    }
})

app.post("/:schoolname/admin/courses/:coursename/enrollstudent", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        var students = req.body.studentname;

        if (typeof students == "string") {
            students = [];
            students.push(req.body.studentname)
        }
        School.findOne({
            shortname: schoolname
        }, function (err, find) {
            Course.findOne({
                coursename: coursename,
                schoolid: find._id
            }, function (err, found) {

                for (var i = 0; i < students.length; i++) {
                    found.studentid.push(students[i]);
                    User.findOne({
                        _id: students[i]
                    }, function (err, user) {
                        user.courses.push(found._id);
                        user.save(function () {});
                    })
                }
                found.save(function () {
                    res.redirect("/" + schoolname + "/admin/courses/" + coursename);
                })
            })
        })
    } else {
        res.redirect("/" + schoolname);
    }
})

//Remove Student route
app.get("/:schoolname/admin/courses/:coursename/removestudent", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        School.findOne({
            shortname: schoolname
        }, function (err, found) {

            Course.findOne({
                coursename: coursename,
                schoolid: found._id
            }, function (err, find) {
                if (find) {
                    var studentid = find.studentid;

                    User.find({
                        _id: {
                            $in: studentid
                        }
                    }, function (err, founded) {
                        var students = []
                        for (var i = 0; i < founded.length; i++) {
                            students.push(founded[i]);
                        }

                        res.render("remove_student", {
                            school: schoolname,
                            coursename: coursename,
                            students: students,
                            message: ""
                        });
                    });

                } else {
                    res.render("error404");
                };
            });
        });

    } else {
        res.redirect("/" + schoolname);
    }
})

app.post("/:schoolname/admin/courses/:coursename/removestudent", function (req, res) {
    const schoolname = req.params.schoolname;
    const coursename = req.params.coursename;

    if (req.isAuthenticated() && req.user.role == "admin" && req.user.schoolshort == schoolname) {
        var students = req.body.studentname;

        if (typeof students == "string") {
            students = [];
            students.push(req.body.studentname)
        }
        School.findOne({
            shortname: schoolname
        }, function (err, find) {
            for (var i = 0; i < students.length; i++) {
                var stud_id = students[i];
                Course.findOneAndUpdate({
                    coursename: coursename,
                    schoolid: find._id
                }, {
                    $pull: {
                        studentid: students[i]
                    }
                }, function (err, founded) {
                    User.findOneAndUpdate({
                        _id: stud_id
                    }, {
                        $pull: {
                            courses: {
                                $in: founded._id
                            }
                        }
                    }, function (err, found) {});
                });
            };
            res.redirect("/" + schoolname + "/admin/courses/" + coursename);
        });
    } else {
        res.redirect("/" + schoolname);
    };
})

// open course page
app.get('/:schoolname/:course_id', function (req, res) {
    Course.findOne({
        _id: req.params.course_id
    }, function (err, found) {
        if (found) {
            var professorid;
            var studentid;
            if (found.professorid) professorid = found.professorid;
            if (found.studentid) studentid = found.studentid;

            var allids = professorid.concat(studentid);


            User.find({
                _id: {
                    $in: allids
                }
            }, function (err, founded) {
                var professors = [];
                var students = [];
                for (var i = 0; i < founded.length; i++) {
                    if (founded[i].role == "student") students.push(founded[i].username);
                    if (founded[i].role == "professor") professors.push(founded[i].username);
                }
                if (req.user.role == "professor") {
                    res.render("course_page_prof", {
                        school: req.params.schoolname,
                        found: found,
                        students: students,
                        professors: professors
                    });
                } else if (req.user.role == "student") {
                    res.render("course_page_stud", {
                        school: req.params.schoolname,
                        found: found,
                        students: students,
                        professors: professors
                    });
                }
            })

        } else {
            console.log("not found");
        }
        if (err) {
            console.log(err);
        }
    })
})

// add course content

app.get('/:schoolname/:course_id/add_course_cont', function (req, res) {
    drive.files.list({}, (err, res) => {
        try {if (err) throw err;
        const files = res.data.files;
        if (files.length) {
            files.map((file) => {
                console.log(file);
            });
        } else {
            console.log('No files found');
        }}
        catch (err) {
            next(err);
        }
    })
    res.render("add_course_cont", {
        school: req.params.schoolname,
        course_id: req.params.course_id
    });

})



app.post('/:schoolname/:course_id/add_course_cont', uploadDisk.single("file"), function (req, res) {
    // console.log(req.body);
    // console.log(req.file);
    if (req.isAuthenticated() && req.user.role == "professor") {
        Course.findOne({
            _id: req.params.course_id
        }, function (err, found) {
            if (err) {
                console.log(err);
            }
            if (found) {
                var filedet;
                var fileMetadata = {
                    name: req.body.content_name, // file name that will be saved in google drive
                };
                var media = {
                    mimeType: req.file.mimetype,
                    body: fs.createReadStream(req.file.destination + '/' + req.file.filename), // Reading the file from our server
                };

                drive.files.create({
                        resource: fileMetadata,
                        media: media
                    },
                    function (err, file) {
                        if (err) {
                            // Handle error
                            console.error(err.msg);
                        } else {
                            // if file upload success then return the unique google drive id
                            console.log("sucess");
                            fs.unlink(req.file.destination + '/' + req.file.filename, (err) => {
                                if (err) {
                                    console.error(err)
                                    return
                                }
                            })
                            // console.log(file);
                            filedet = file;
                            found.items.push({
                                name: req.body.content_name,
                                google_id: file.data.id,
                                extension: mime.extension(file.data.mimeType)
                            });
                            found.save(function (err) {
                                if (!err) {
                                    res.redirect("/" + req.params.schoolname + "/" + req.params.course_id);
                                }
                                console.log(err);
                            })
                        }
                    }
                );

            } else {
                console.log("not found");
            }
        })
    }
})

// Download content file

app.post('/:schoolname/download/:filename/:fileid', function (req, res) {
    var fileId = req.params.fileid;
    var dest = fs.createWriteStream('./public/' + req.params.filename);
    drive.files
        .get({
            fileId,
            alt: 'media'
        }, {
            responseType: 'stream'
        })
        .then((driveResponse) => {
            driveResponse.data
                .on('end', () => {
                    console.log('\nDone downloading file.');
                    const file = "./public/" + req.params.filename; // file path from where node.js will send file to the requested user
                    res.download(file, function(err){
                        //CHECK FOR ERROR
                        // console.log("inside download")
                        fs.unlink('./public/'+req.params.filename, (err) => {
                                if (err) {
                                  console.error(err)
                                  return
                            }})
                      }); // Set disposition and send it.
                    //   
                })
                .on('error', (err) => {
                    console.error('Error downloading file.');
                })
                .pipe(dest);
        })
});

// delete course content

app.get('/:schoolname/:course_id/delete_course_cont', function (req, res) {

    Course.findOne({
        _id: req.params.course_id,
    }, function (err, found) {
        if (err) {
            console.log(err);
        }
        if (found) {
            res.render("delete_course_cont", {
                school: req.params.schoolname,
                course_id: req.params.course_id,
                found: found,
            });
        } else {
            res.render("error404");
        }
    })
});

app.post('/:schoolname/:course_id/delete_course_cont', function (req, res) {
    Course.findOne({
        _id: req.params.course_id
    }, function (err, found) {
        if (err) {
            console.log(err);
        }
        if (found) {
            // console.log(Array.isArray(req.body.delete));
            found.items.forEach(function (item, i) {
                if (item._id == req.body.delete) {
                    drive.files.delete({
                            fileId: item.google_id,
                        })
                        .then(
                            async function (response) {
                                    console.log("success");
                                },
                                function (err) {
                                    console.log(err);
                                }
                        );
                    found.items.splice(i, 1);
                }
            })
        }
        found.save(function (err) {
            if (!err) {
                res.redirect("/" + req.params.schoolname + "/" + req.params.course_id);
            }
            console.log(err);
        })
    })

})
// Server Hosting
app.listen(3000, function () {
    console.log("server started");
})