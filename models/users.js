const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username : {type:String, require:true, trim : true, minlength:2},
    email : {type:String, require:true, unique:true, lowercase:true, trim:true},
    password : {type:String,require:true, minlength:8}
})

module.exports = mongoose.model("user",userSchema);