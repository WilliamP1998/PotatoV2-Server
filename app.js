const express = require("express");
const bodyParser = require("body-parser");
const mongodb = require("mongodb");
const socket = require("socket.io");
const port = 3000;
let users;
let count;
let chatRooms;
const multer = require("multer");
let messagesArray = [];
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, "./uploads/");
  },
  filename: function(req, file, cb) {
    cb(null, new Date().toISOString() + file.originalname);
  }
});
const fileFilter = (req, file, cb) => {
  // reject a file
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

//use multer to upload file
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 5
  },
  fileFilter: fileFilter
});
const app = express();

app.use(bodyParser.json());

//connect to mongo db
const MongoClient = mongodb.MongoClient;

app.use((req, res, next) => {
  res.append("Access-Control-Allow-Origin", "http://localhost:4200");
  res.append("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
  res.append(
    "Access-Control-Allow-Headers",
    "Origin, Accept,Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers"
  );
  res.append("Access-Control-Allow-Credentials", true);
  next();
});

MongoClient.connect("mongodb://localhost:27017/Chat_App", (err, Database) => {
  if (err) {
    console.log(err);
    return false;
  }
  console.log("Connected to MongoDB");
  //create db named chat app
  const db = Database.db("Chat_App");

  //create collections in the db
  groups = db.collection("groups");
  channels = db.collection("channel");
  users = db.collection("users");
  chatRooms = db.collection("chatRooms");

  //put the server in port 3000
  const server = app.listen(port, () => {
    console.log("Server started on port " + port + "...");
  });
  const io = socket.listen(server);

  //create socket functions for chatting
  io.sockets.on("connection", socket => {
    socket.on("join", data => {
      socket.join(data.room);
      chatRooms.find({}).toArray((err, rooms) => {
        if (err) {
          console.log(err);
          return false;
        }
        count = 0;
        rooms.forEach(room => {
          if (room.name == data.room) {
            count++;
          }
        });
        if (count == 0) {
          chatRooms.insert({ name: data.room, messages: [] });
        }
      });
    });
    socket.on("message", data => {
      io.in(data.room).emit("new message", {
        user: data.user,
        message: data.message
      });
      chatRooms.update(
        { name: data.room },
        { $push: { messages: { user: data.user, message: data.message } } },
        (err, res) => {
          if (err) {
            console.log(err);
            return false;
          }
          console.log("Document updated");
        }
      );
    });
    socket.on("typing", data => {
      socket.broadcast
        .in(data.room)
        .emit("typing", { data: data, isTyping: true });
    });
  });
});

app.get("/", (req, res, next) => {
  res.send("Welcome to the express server...");
});

//api create users
app.post("/api/users", (req, res, next) => {
  let user = {
    avatar: req.body.avatar,
    username: req.body.username,
    email: req.body.email,
    password: req.body.password,
    grouplist: req.body.grouplist,
    admingrouplist: req.body.admingrouplist,
    role: req.body.role
  };
  let count = 0;
  users.find({}).toArray((err, Users) => {
    if (err) {
      console.log(err);
      return res.status(500).send(err);
    }
    for (let i = 0; i < Users.length; i++) {
      if (Users[i].username == user.username) count++;
    }
    // Add user if not already signed up
    if (count == 0) {
      users.insert(user, (err, User) => {
        if (err) {
          res.send(err);
        }
        res.json(User);
      });
    } else {
      // Alert message logic here
      res.json({ user_already_signed_up: true });
    }
  });
});

//login api
app.post("/api/login", (req, res) => {
  let isPresent = false;
  let correctPassword = false;
  let loggedInUser;

  users.find({}).toArray((err, users) => {
    if (err) return res.send(err);
    users.forEach(user => {
      if (user.username == req.body.username) {
        if (user.password == req.body.password) {
          isPresent = true;
          correctPassword = true;
          loggedInUser = {
            username: user.username,
            email: user.email
          };
        } else {
          isPresent = true;
        }
      }
    });
    res.json({
      isPresent: isPresent,
      correctPassword: correctPassword,
      user: loggedInUser
    });
  });
});

//api get users
app.get("/api/users", (req, res, next) => {
  users.find({}, { username: 1, email: 1, _id: 0 }).toArray((err, users) => {
    if (err) {
      res.send(err);
    }
    res.json(users);
  });
});

//api get chat room
app.get("/chatroom/:room", (req, res, next) => {
  let room = req.params.room;
  chatRooms.find({ name: room }).toArray((err, chatroom) => {
    if (err) {
      console.log(err);
      return false;
    }
    res.json(chatroom[0].messages);
  });
});

//api create group
app.post("/api/addgroup", function(req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }
  group = req.body;

  //check for duplicate id's
  groups.find({ id: group.id }).count((err, count) => {
    if (count == 0) {
      //if no duplicate
      groups.insertOne(group, (err, dbres) => {
        if (err) throw err;
        let num = dbres.insertedCount;
        //send back to client number of items instered and no error message
        res.send({ num: num, err: null });
      });
    } else {
      //On Error send back error message
      res.send({ num: 0, err: "duplicate item" });
    }
  });
});

//api delete group
app.post("/api/deletegroup", function(req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }

  groupID = req.body.groupid;
  //create a new mongo Object ID from the passed in _id
  var groupid = new ObjectID(groupID);

  //Delete a single item based on its unique ID.
  groups.deleteOne({ _id: groupid }, (err, docs) => {
    //get a new listing of all items in the database and return to client.
    //  collection.find({}).toArray((err,data)=>{
    //console.log('data' + data);
    //   res.send(data);
    // });
    res.send({ ok: 1 });
  });
});

// api get groups
app.get("/api/getgroups", function(req, res) {
  groups.find({}).toArray((err, data) => {
    res.send(data);
  });
});

//api get 1 group
app.post("/api/getgroup", function(req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }

  groupID = req.body.groupid;
  //Create objectID from passed in+id
  var groupid = new ObjectID(groupID);

  groups
    .find({ _id: groupid })
    .limit(1)
    .toArray((err, docs) => {
      //send to client and array of items limited to 1.
      console.log(docs);
      res.send(docs);
    });
});

//api create channel
app.post("/api/addchannel", function(req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }
  channel = req.body;

  //check for duplicate id's
  channels.find({ id: channel.id }).count((err, count) => {
    if (count == 0) {
      //if no duplicate
      channels.insertOne(channel, (err, dbres) => {
        if (err) throw err;
        let num = dbres.insertedCount;
        //send back to client number of items instered and no error message
        res.send({ num: num, err: null });
      });
    } else {
      //On Error send back error message
      res.send({ num: 0, err: "duplicate item" });
    }
  });
});

//api delete channel
app.post("/api/deletechannel", function(req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }

  channelID = req.body.channelid;
  //create a new mongo Object ID from the passed in _id
  var channelid = new ObjectID(channelID);

  //Delete a single item based on its unique ID.
  channels.deleteOne({ _id: channelid }, (err, docs) => {
    //get a new listing of all items in the database and return to client.
    //  collection.find({}).toArray((err,data)=>{
    //console.log('data' + data);
    //   res.send(data);
    // });
    res.send({ ok: 1 });
  });
});

//api get channels
app.get("/api/getchannels", function(req, res) {
  channels.find({}).toArray((err, data) => {
    res.send(data);
  });
});

//apiget 1 channel
app.post("/api/getchannel", function(req, res) {
  if (!req.body) {
    return res.sendStatus(400);
  }

  channelID = req.body.channelid;
  //Create objectID from passed in+id
  var channelid = new ObjectID(channelID);

  channels
    .find({ _id: channelid })
    .limit(1)
    .toArray((err, docs) => {
      //send to client and array of items limited to 1.
      console.log(docs);
      res.send(docs);
    });
});
