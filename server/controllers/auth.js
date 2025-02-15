const User = require("../models/User");
const utility = require("../utils/utility");
let jwt = require("jsonwebtoken");
const Doctor = require("../models/Doctors");

/// pangea
const Pangea = require("pangea-node-sdk");
const pangeaDomain = process.env.PANGEA_DOMAIN;
const auditToken = process.env.PANGEA_AUDIT_TOKEN;
const auditConfig = new Pangea.PangeaConfig({ domain: pangeaDomain });
const audit = new Pangea.AuditService(auditToken, auditConfig);

const clientIpAddress = (req) => {
  return req?.headers["origin"] || req?.socket.remoteAddress || "localhost";
};

const hostIpAddress = (req) => {
  return req?.headers["host"] || req?.hostname || "localhost";
};


///


/**
 * @api {post} /api/register create
 * @apiName create a User
 * @apiGroup User
 *
 * @apiParam {string} name name of user
 * @apiParam {string} email email of user
 * @apiParam {string} password password of user
 *
 * @apiParamExample {json} request-example
 * {
 *	"name":"test",
 *	"email":"test@test.com",
 *	"password":"test",
 *}
 *
 * @apiParamExample {json} response-example
 */
const register = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email missing." });
    }

    const userData = {};
    const doctorData = {};

    User.findOne({ email: email.toLowerCase() }, async (error, response) => {
      if (error) {
        return res
          .status(400)
          .json({ message: "error occurred", error: error });
      } else if (response) {
        return res.status(200).json({
          message: "user already exist with same email id",
          response: response,
        });
      } else {
        utility.hash(req.body.password, (error, hash) => {
          userData.password = hash;
          userData.email = email.toLowerCase();
          userData.name = req.body.name;
          if (req.body.userType == "user") {
            userData.userType = "user";
          } else {
            userData.userType = "doctor";
            doctorData.doctorName = req.body.name;
            doctorData.hospitalName = req.body.hospitalName;
            doctorData.hospitalAddress = req.body.hospitalAddress;
            doctorData.specialization = req.body.specialization;
            doctorData.city = req.body.city;
            doctorData.state = req.body.state;
            doctorData.country = req.body.country;
            let lat = req.body.location[0] == null ? 0 : req.body.location[0];
            let long = req.body.location[1] == null ? 0 : req.body.location[1];
            doctorData.location = {
              type: "Point",
              coordinates: req.body.location,
              coordinates: [lat, long],
            };
          }

          try {
            User.create(userData, async (error, response) => {
              if (error) {
                console.log("user not registered", error);
                return res
                  .status(400)
                  .json({ message: "error occurred", error: error });
              } else if (response) {
                if (req.body.userType == "doctor") {
                  doctorData.user_id = response._id;
                  let doctorsRecord = await Doctor.create(doctorData);
                  await doctorsRecord.save();
                }
                let token = utility.jwtToken({
                  id: response._id,
                  email: response.email,
                  userType: response.userType,
                });

                audit.log({
                  actor: response.email,
                  action: "Create User",
                  status: "Success",
                  target:`${hostIpAddress(req)}`,
                  source:`${clientIpAddress(req)}`,
                  message: `User '${response.email}' created.`,
                });
      
      
                return res.status(200).json({
                  message: "user created successfully",
                  token: token,
                  user: response,
                });
              } else {

                audit.log({
                  actor: response.email,
                  action: "Create User",
                  status: "Failed",
                  target:`${hostIpAddress(req)}`,
                  source:`${clientIpAddress(req)}`,
                  message: `User '${response.email}' failed to created.`,
                });
      
                return res
                  .status(400)
                  .json({ message: "error occurred", error: error });
              }
            });
          } catch (e) {

            audit.log({
              actor: response.email,
              action: "Create User",
              status: "Failed",
              target:`${hostIpAddress(req)}`,
              source:`${clientIpAddress(req)}`,
              message: `User '${response.email}' failed to created.`,
            });
            
            console.log(err);
            return res.status(500).json({ message: "Unable to register" });
          }
        });
      }
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Unable to register" });
  }
};

/**
 * @api {post} /api/login login
 * @apiName login a User
 * @apiGroup User
 * @apiParam {string} email email of user
 * @apiParam {string} password password of user
 **/
const login = async (req, res) => {
  try {
    console.log(req.body.email, req.body.password);
    let check = {
      email: req.body.email ? req.body.email.toLowerCase() : req.body.email,
    };
    let response = await User.findOne(check);
    if (response) {
      utility.check(req.body.password, response.password, (error, match) => {
        if (match) {
          let token = utility.jwtToken({
            id: response._id,
            email: response.email,
            userType: response.userType,
          });

          audit.log({
            actor: response.email,
            action: "Login User",
            status: "Success",
            target:`${hostIpAddress(req)}`,
            source:`${clientIpAddress(req)}`,
            message: `User '${response.email}' logged in.`,
          });

          return res.status(200).json({
            message: "user found, token sent",
            token: token,
            user: response,
          });
        } else {

          audit.log({
            actor: response.email,
            action: "Login User",
            status: "Failed",
            target:`${hostIpAddress(req)}`,
            source:`${clientIpAddress(req)}`,
            message: `User '${response.email}' failed to logged in.`,
          });

          return res
            .status(404)
            .json({ message: "Invalid email id or password" });
        }
      });
    } else {
      audit.log({
        actor: response.email,
        action: "Login User",
        status: "Failed",
        target:`${hostIpAddress(req)}`,
        source:`${clientIpAddress(req)}`,
        message: `User '${response.email}' failed to logged in.`,
      });

      return res.status(404).json({ message: "Invalid email id or password" });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Unable to Log in" });
  }
};

/**
 * @api {authenticationMiddleWare}
 * @apiName authenticationMiddleWare
 * @apiGroup User
 */
const authenticateMiddleware = async (req, res, next) => {
  let token = req.headers["x-access-token"];
  if (token) {
    jwt.verify(token, process.env.TOKEN_SECRET, async function (err, decoded) {
      if (err) {
        return res.status(401).json({
          error: err,
          success: false,
          message: "Failed to authenticate token",
          tokenAutorization: false,
        });
      } else {
        if (decoded.userType == "doctor" || decoded.userType == "user") {
          req.decoded = decoded;
          next();
        } else {
          return res.status(401).json({
            success: false,
            message: "Failed to authenticate token",
            tokenAutorization: false,
          });
        }
      }
    });
  } else {
    return res.status(403).send({
      success: false,
      msg: "No token, authorization denied",
    });
  }
};

/**
 * /api/auth
 */
const getLoginDetails = async (req, res) => {
  try {
    // console.log(req.decoded);
    const user = await User.findById(req.decoded.id).select("-password");
    // console.log("user", user);
    res.status(200).json(user);
  } catch (err) {
    console.log(err.message);
    res.status(500).send("Server error");
  }
};

module.exports = { getLoginDetails, authenticateMiddleware, login, register } 