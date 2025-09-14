const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/users");
const jwt = require("jsonwebtoken");

const router = express.Router();


//register user
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        if (!username || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        const hashpass = await bcrypt.hash(password, 10);
        const newuser = new User({ username, email, password:hashpass });
        await newuser.save();
        console.log(`User register sucessfully with ${email} , ${username}`);
        res.status(200).json({ message: `User register succesfully with ${username}` })
    }
    catch (err) {
        console.error(err);
        if(err.code == 11000){
            return res.status(409).json({error : `user for ${email} is already registered`});
        }
        return res.status(500),json({error:`internal server error try after sometime or contact support`});
    }
});

//login user
router.post("/login",async(req,res)=>{
    const {email,password} = req.body;

    try{
        const user = await User.findOne({email});
        if(!user) return res.status(404).json({error:`user not found check main id`});

        const pass = await bcrypt.compare(password,user.password);
        if(!pass) return res.status(404).json({error:`for ${email} password is invalid`});

        const token = jwt.sign({id:user._id,name:user.username,email:user.email},process.env.JWT_SECRET,{expiresIn:'7d'});

        console.log("user login");

        res.status(201).json({token,message:`Login sucessfully ${user.username}`});
    }
    catch(err){
        console.log(err);
        return res.status(500),json({error:`internal server error try after sometime or contact support`});
    }
});

module.exports = router;