const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const env = require("dotenv");
env.config();

//call routers 
const auth = require("./auth/auth");

const app = express();
app.use(cors());
app.use(express.json());

//connect database
mongoose.connect(process.env.MONGODB_URI).then(()=>console.log("Connected to database")).catch((err)=>console.log(`error on connecting database ${err}`));

app.get("/",(req,res)=>{
    res.send("server running");
});

app.use('/api/auth',auth);

app.listen(3000,()=>{console.log("running in port 3000")})