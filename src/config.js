const mongoose = require('mongoose');
const connect = mongoose.connect("mongodb://localhost:27017/StudyHub");

// Check database connected or not
connect.then(() => {
    console.log("Database Connected Successfully");
})
.catch(() => {
    console.log("Database cannot be Connected");
})

// Create Schema
const Loginschema = new mongoose.Schema({
    name: {
        type:String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    exp: {
        type: Number,
        default: 0
    },
    timeSpent: {
        type: Number,
        default: 0
    }
});

// collection part
const collection = new mongoose.model("Login", Loginschema);

module.exports = collection;