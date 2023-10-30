const jwt = require("jsonwebtoken");
const mysql = require("mysql2");
const { Client } = require("ssh2");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const express = require("express");
const app = express();
const port = 8700;
const axios = require('axios');
require('dotenv').config();;
const moment = require('moment');

// SSH connection configuration
const sshConfig = {
  host: process.env.SSH_HOST,
  port: process.env.SSH_PORT,
  username: process.env.SSH_USERNAME,
  password: process.env.SSH_PASSWORD,
};

// MySQL connection configuration (through the SSH tunnel)
const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

// Create an SSH tunnel
const sshTunnel = new Client();

sshTunnel.on("ready", () => {
  sshTunnel.forwardOut(
    "localhost", // Bind address (your local machine)
    3306, // Local port for MySQL (can be any available port)
    "localhost", // Remote MySQL server address (usually localhost)
    3306, // Remote MySQL server port (default is 3306)
    (err, stream) => {
      if (err) throw err;

      // Create a MySQL connection using the SSH tunnel's stream
      const connection = mysql.createConnection({
        ...mysqlConfig,
        stream,
      });

      // Start the Express server after establishing the MySQL connection
      app.listen(port, () => {
        console.log(`API server is running on port ${port}`);
      });

      app.use(cors());
      app.use(bodyParser.json());

      function authenticateToken(req, res, next) {
        const authHeader = req.headers["authorization"];
        // Split the header value to extract the token (assuming the format is "Bearer <token>")
        const token = authHeader && authHeader.split(" ")[1];

        if (token == null) return res.sendStatus(401);

        jwt.verify(token, "secretKey", (err, user) => {
          if (err) return res.sendStatus(403);
          req.user = user;
          next();
        });
      }

      // registration
      app.post("/register", async (req, res) => {
        const { username, email, password } = req.body;

        // Check if any of the required fields are empty
        if (!username || !email || !password) {
          return res
            .status(400)
            .json({ error: "Please fill in all required fields" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Check if the email already exists in the database
        const emailExistsQuery =
          "SELECT COUNT(*) as count FROM users WHERE email = ?";
        connection.query(emailExistsQuery, [email], (err, results) => {
          if (err) {
            console.error("Error checking email existence:", err);
            return res.status(500).json({ error: "Internal server error" });
          }

          const emailCount = results[0].count;

          if (emailCount > 0) {
            return res.status(400).json({ error: "Email already exists" });
          }

          // Insert the user data into the database
          const insertQuery =
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)";
          connection.query(
            insertQuery,
            [username, email, hashedPassword],
            (err, results) => {
              if (err) {
                console.error("Error registering user:", err);
                return res.status(500).json({ error: "Internal server error" });
              }

              res.status(201).json({ message: "User registered successfully" });
            }
          );
        });
      });

      // login
      app.post("/login", async (req, res) => {
        const { email, password } = req.body;
        connection.query(
          "SELECT * FROM users WHERE email = ?",
          [email],
          async (error, results) => {
            if (error) {
              console.error("Error logging in:", error);
              res.status(500).json({ error: "Internal server error" });
            } else if (results.length > 0) {
              const user = results[0];
              const passwordMatch = await bcrypt.compare(
                password,
                user.password
              );
              if (passwordMatch) {
                const expiresIn = "1h";
                const token = jwt.sign({}, "secretKey", { expiresIn });
                res.status(200).json({ message: "Login successful", token });
              } else {
                res
                  .status(401)
                  .json({ error: "Email or Password are not match" });
              }
            } else {
              res
                .status(401)
                .json({ error: "Email or Password are not match" });
            }
          }
        );
      });

      // --------------panchang start---------------
      // post panchang
      app.post("/addpanchang",authenticateToken,(req,res)=>{
        const {date,tithi,rashi,nakshtra,nakshtratime,vinchudo,panchak,festival,bankholiday,rutu,} = req.body;

        const query = `INSERT INTO panchang (date, tithi, rashi, nakshtra, nakshtratime, vinchudo, panchak, festival, bankholiday, rutu)VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
      
        connection.query(query, [date,tithi,rashi,nakshtra,nakshtratime,vinchudo,panchak,festival,bankholiday,rutu,], (err, results) => {
          if (err) {
            console.error("Error inserting data into the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            res.json({ message: "Data inserted successfully" });
          }
        });
      })

      // get panchang
      app.get("/panchang",authenticateToken,(req, res) => {
        const query = "SELECT * FROM panchang";
        connection.query(query, (err, results) => {
          if (err) {
            res.status(500).json({ error: "Database error" });
          } else {
            res.json(results);
          }
        });
      });

      // get single date panchang
app.get("/panchangdate",authenticateToken,(req,res)=>{
  const { date } = req.query;
  // Assuming your database table is called 'your_table_name'
  const query = 'SELECT * FROM  panchang WHERE date = ?';
  connection.query(query, [date], (err, results) => {
    if (err) {
      console.error('Error querying the database:', err);
      res.status(500).json({ error: 'Internal server error' });
      return;
    }else{
      res.json(results);
    }
  });
})

      // update panchang
      app.put("/updatepanchang", authenticateToken,(req, res) => {
        const { id } = req.query;
        const { date, tithi, rashi, nakshtra, nakshtratime, vinchudo, panchak, festival, bankholiday, rutu } = req.body;
      
        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
      
        // Initialize an empty object to store the fields to update
        const fieldsToUpdate = {};
      
        // Check and add "date" to the fields to update if provided
        if (date) {
          fieldsToUpdate.date = date;
        }
      
        // Check and add "tithi" to the fields to update if provided
        if (tithi) {
          fieldsToUpdate.tithi = tithi;
        }
      
        // Check and add "rashi" to the fields to update if provided
        if (rashi) {
          fieldsToUpdate.rashi = rashi;
        }
      
        // Check and add "nakshtra" to the fields to update if provided
        if (nakshtra) {
          fieldsToUpdate.nakshtra = nakshtra;
        }
      
        // Check and add "nakshtratime" to the fields to update if provided
        if (nakshtratime) {
          fieldsToUpdate.nakshtratime = nakshtratime;
        }
      
        // Check and add "vinchudo" to the fields to update if provided
        if (vinchudo) {
          fieldsToUpdate.vinchudo = vinchudo;
        }
      
        // Check and add "panchak" to the fields to update if provided
        if (panchak) {
          fieldsToUpdate.panchak = panchak;
        }
      
        // Check and add "festival" to the fields to update if provided
        if (festival) {
          fieldsToUpdate.festival = festival;
        }
      
        // Check and add "bankholiday" to the fields to update if provided
        if (bankholiday) {
          fieldsToUpdate.bankholiday = bankholiday;
        }
      
        // Check and add "rutu" to the fields to update if provided
        if (rutu) {
          fieldsToUpdate.rutu = rutu;
        }
      
        // Construct the SQL query to update the panchang record with the provided id
        const query = "UPDATE panchang SET ? WHERE id = ?";
      
        // Execute the query to update the data in the database
        connection.query(query, [fieldsToUpdate, id], (err, results) => {
          if (err) {
            console.error("Error updating data in the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res.status(404).json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data updated successfully" });
            }
          }
        });
      });


      // delete panchang
      app.delete("/deletepanchang", authenticateToken,(req, res) => {
        const { id } = req.query; // Extract the "id" parameter from request query parameters
      
        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }
      
        // Construct the SQL query to delete the panchang record with the provided id
        const query = "DELETE FROM panchang WHERE id = ?";
      
        // Execute the query to delete the data from the database
        connection.query(query, [id], (err, results) => {
          if (err) {
            console.error("Error deleting data from the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res.status(404).json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data deleted successfully" });
            }
          }
        });
      });
       // --------------panchang end---------------

      // -------------------holiday start--------------
      // post holiday
      app.post("/addholiday", authenticateToken,(req, res) => {
        const { date, holiday } = req.body;
        const query = "INSERT INTO holiday ( date, holiday) VALUES ( ?, ?)";
        const Values = [date, holiday];

        connection.query(query, Values, (err, results) => {
          if (err) {
            res
              .status(500)
              .json({ error: "Database error", details: err.message });
          } else {
            res.status(200).json({ message: "Data add successfully" });
          }
        });
      });

      // get holiday
      app.get("/holiday", authenticateToken,(req, res) => {
        const query = "SELECT * FROM holiday";
        connection.query(query, (err, results) => {
          if (err) {
            res.status(500).json({ error: "Database error" });
          } else {
            res.json(results);
          }
        });
      });

      // delete holiday
      app.delete("/deleteholiday", authenticateToken,(req, res) => {
        const { id } = req.query; // Extract the "id" parameter from request params

        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        // Construct the SQL query to delete the katha record with the provided id
        const query = "DELETE FROM holiday WHERE id = ?";

        // Execute the query to delete the data from the database
        connection.query(query, [id], (err, results) => {
          if (err) {
            console.error("Error deleting data from the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res
                .status(404)
                .json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data deleted successfully" });
            }
          }
        });
      });
      // -------------------holiday end----------------

      // ---------------------city start-------------------------------
      // post city
      app.post("/addcity", authenticateToken,(req, res) => {
        const { name, lat, lng } = req.body;
        const query = "INSERT INTO city (name, lat, lng) VALUES (?, ?, ?)";
        const values = [name, lat, lng];

        connection.query(query, values, (err, result) => {
          if (err) {
            res
              .status(500)
              .json({ error: "Database error", details: err.message });
          } else {
            res.status(201).json({ message: "Data inserted successfully" });
          }
        });
      });

      //  get all city
      app.get("/city", authenticateToken,(req, res) => {
        const query = "SELECT * FROM city";
        connection.query(query, (err, results) => {
          if (err) {
            res.status(500).json({ error: "Database error" });
          } else {
            res.json(results);
          }
        });
      });

      // delete city
      app.delete("/deletecity", authenticateToken,(req, res) => {
        const { id } = req.query; // Extract the "id" parameter from request params

        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        // Construct the SQL query to delete the katha record with the provided id
        const query = "DELETE FROM city WHERE id = ?";

        // Execute the query to delete the data from the database
        connection.query(query, [id], (err, results) => {
          if (err) {
            console.error("Error deleting data from the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res
                .status(404)
                .json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data deleted successfully" });
            }
          }
        });
      });
      // ---------------------city end-------------------------------

      // -----------------------bank holiday start------------------------
      // post bankholiday
      app.post("/addbankholiday", authenticateToken,(req, res) => {
        const { date, bankholiday } = req.body;
        const query =
          "INSERT INTO bankholiday ( date, bankholiday) VALUES ( ?, ?)";
        const values = [date, bankholiday];

        // Execute the query to insert the data
        connection.query(query, values, (err, results) => {
          if (err) {
            console.error("Database error:", err); // Log the error for debugging
            res
              .status(500)
              .json({ error: "Database error", details: err.message }); // Send the error message to the client
          } else {
            res.status(201).json({ message: "Data inserted successfully" });
          }
        });
      });

      // get all bank holidays
      app.get("/bankholiday", authenticateToken,(req, res) => {
        const query = "SELECT * FROM bankholiday";
        connection.query(query, (err, results) => {
          if (err) {
            res.status(500).json({ error: "Database error" });
          } else {
            res.json(results);
          }
        });
      });

      // update bank holiday
      app.put("/updatebankholiday", authenticateToken,(req, res) => {
        // Extract the "id" from request query parameters
        const { id } = req.query;
        // Extract the updated data
        const { date, bankholiday } = req.body;

        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        // Check if either "date" or "bankholiday" is provided for update
        if (!date && !bankholiday) {
          return res.status(400).json({
            error:
              "At least one field (date or bankholiday) is required for the update",
          });
        }

        // Initialize an empty object to store the fields to update
        const fieldsToUpdate = {};

        // Check and add "date" to the fields to update if provided
        if (date) {
          fieldsToUpdate.date = date;
        }

        // Check and add "bankholiday" to the fields to update if provided
        if (bankholiday) {
          fieldsToUpdate.bankholiday = bankholiday;
        }

        // Construct the SQL query to update the bank holiday record with the provided id
        const query = "UPDATE bankholiday SET ? WHERE id = ?";

        // Execute the query to update the data in the database
        connection.query(query, [fieldsToUpdate, id], (err, results) => {
          if (err) {
            console.error("Error updating data in the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res
                .status(404)
                .json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data updated successfully" });
            }
          }
        });
      });

      // delete bank holiday
      app.delete("/deletebankholiday", authenticateToken,(req, res) => {
        const { id } = req.query; // Extract the "id" parameter from request params

        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        // Construct the SQL query to delete the katha record with the provided id
        const query = "DELETE FROM bankholiday WHERE id = ?";

        // Execute the query to delete the data from the database
        connection.query(query, [id], (err, results) => {
          if (err) {
            console.error("Error deleting data from the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res
                .status(404)
                .json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data deleted successfully" });
            }
          }
        });
      });
      // -----------------------bank holiday end--------------------------

      // --------------------------katha start----------------------
      // post katha date,vrat,katha
      app.post("/addkatha", authenticateToken,(req, res) => {
        const { date, vrat, katha } = req.body;
        const query = "INSERT INTO katha (date, vrat, katha) VALUES (?, ?, ?)";
        const values = [date, vrat, katha];

        connection.query(query, values, (err, result) => {
          if (err) {
            console.error("Database error:", err); // Log the error for debugging
            res
              .status(500)
              .json({ error: "Database error", details: err.message });
          } else {
            res.status(201).json({ message: "Data inserted successfully" });
          }
        });
      });

      // get all katha
      app.get("/katha", authenticateToken,(req, res) => {
        const query = "SELECT * FROM katha";
        connection.query(query, (err, results) => {
          if (err) {
            res.status(500).json({ error: "Database Error" });
          } else {
            res.json(results);
          }
        });
      });

      // Update katha
      app.put("/updatekatha", authenticateToken,(req, res) => {
        const { id } = req.query; // Extract the "id" parameter from request query parameters
        const { date, vrat, katha } = req.body; // Extract the updated data

        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        // Initialize an empty object to store the fields to update
        const fieldsToUpdate = {};

        // Check and add "date" to the fields to update if provided
        if (date) {
          // Explicitly set the time zone to UTC
          fieldsToUpdate.date = new Date(date + "T00:00:00Z");
        }

        // Check and add "vrat" to the fields to update if provided
        if (vrat) {
          fieldsToUpdate.vrat = vrat;
        }

        // Check and add "katha" to the fields to update if provided
        if (katha) {
          fieldsToUpdate.katha = katha;
        }

        // Construct the SQL query to update the katha record with the provided id
        const query = "UPDATE katha SET ? WHERE id = ?";

        // Execute the query to update the data in the database
        connection.query(query, [fieldsToUpdate, id], (err, results) => {
          if (err) {
            console.error("Error updating data in the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res
                .status(404)
                .json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data updated successfully" });
            }
          }
        });
      });

      // delete katha
      app.delete("/deletekatha", authenticateToken,(req, res) => {
        const { id } = req.query; // Extract the "id" parameter from request params

        // Validate if "id" is a valid integer
        if (isNaN(parseInt(id))) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        // Construct the SQL query to delete the katha record with the provided id
        const query = "DELETE FROM katha WHERE id = ?";

        // Execute the query to delete the data from the database
        connection.query(query, [id], (err, results) => {
          if (err) {
            console.error("Error deleting data from the database:", err);
            res.status(500).json({ error: "Internal server error" });
          } else {
            if (results.affectedRows === 0) {
              res
                .status(404)
                .json({ error: "Data not found for the given ID" });
            } else {
              res.json({ message: "Data deleted successfully" });
            }
          }
        });
      });
      // --------------------------katha end------------------------

      // get all rutu
      app.get("/rutu", authenticateToken,(req, res) => {
        const query = "SELECT * FROM rutu";
        connection.query(query, (err, results) => {
          if (err) {
            res.status(500).json({ error: "Database Error" });
          } else {
            res.json(results);
          }
        });
      });

      // get all nakshtra
      app.get("/nakshtra",authenticateToken,(req,res)=>{
        const query = "SELECT * FROM nakshtra";

        connection.query(query,(err,results)=>{
          if(err){
           res.status(500).json({message:"Database Error"});
          }else{
            res.json(results);
          }
        })
      })

       // get all rashi
       app.get("/rashi",authenticateToken,(req,res)=>{
        const query = "SELECT * FROM rashi";

        connection.query(query,(err,results)=>{
          if(err){
           res.status(500).json({message:"Database Error"});
          }else{
            res.json(results);
          }
        })
      })
      
      // get rashi letters
      app.get('/rashiletters', authenticateToken,(req, res) => {
        const rashiToSearch = req.query.rashi;
      
        const sql = `
          SELECT rashi.letter
          FROM panchang
          JOIN rashi ON panchang.rashi = rashi.rashi
          WHERE panchang.rashi = ?
        `;
      
        connection.query(sql, [rashiToSearch], (error, results) => {
          if (error) {
            console.error('Error executing SQL query:', error);
            res.status(500).json({ error: 'Internal server error' });
          } else if (results && results.length > 0) {
            // Ensure that there are results and it's not an empty array
            const cleanedLetters = results[0].letter;
            res.json({ letters: cleanedLetters });
          } else {
            console.error('No matching records found for rashi:', rashiToSearch);
            res.status(404).json({ error: 'No matching records found' });
          }
        });
      });
      

      // Function to get data from an API
async function getDataFromAPI(apiURL) {
  try {
    const response = await axios.get(apiURL);
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// get holiday,bankholiday,katha,festival api
// app.get('/allholidays', authenticateToken,async (req, res) => {
//   try {
//     const holidayData = await getDataFromAPI('http://localhost:6800/holiday');
//     const bankHolidayData = await getDataFromAPI('http://localhost:6800/bankholiday');
//     const katha = await getDataFromAPI('http://localhost:6800/katha');
//     const festival = await getDataFromAPI('http://localhost:6800/festival');

//     // Merge the data from both APIs
//     const combinedData = {
//       holidayData,
//       bankHolidayData,
//       katha,
//       festival,
//     };

//     res.json(combinedData);
//   } catch (error) {
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// get all festival
app.get("/festival",authenticateToken,(req,res)=>{
  const query = `SELECT id,date,festival
  FROM panchang
  WHERE festival IS NOT NULL AND festival != ''  
  AND festival NOT LIKE 'आज के दिन कोई त्यौहार नहीं है%' ;
  `;
  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error querying the database:", err);
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    // Assuming the query was successful, you can send the results as JSON
    res.json( results ); // Adjust the response structure as needed
  });
})

// ------------------sunrise,sunset,moonrise start------------
// get sunrise,sunset,moonrise time
app.get("/day",authenticateToken,(req,res)=>{
  const id = req.query.id; // Get the id from the query parameter

  if (!id) {
    res.status(400).json({ error: 'id is required in the query parameter.' });
    return;
  }

  connection.query(
    'SELECT lat, lng FROM city WHERE id = ?',
    [id],
    async (error, results) => {
      if (error) {
        console.error('Error querying the database:', error);
        res.status(500).json({ error: 'Internal server error' });
      } else if (results.length > 0) {
        const { lat, lng } = results[0];
        const apiKey = `e713563e7e4944648844ea977a1f550d`;
        const apiUrl = `https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&lat=${lat}&long=${lng}&formatted=0`;

        try {
          const response = await fetch(apiUrl);
          const data = await response.json();

          if (data) {
            const sunrise = data.sunrise;
            const sunset = data.sunset;
            const moonrise = data.moonrise;

            // Convert sunrise time to 12-hour format with AM and PM
            const sunriseTime = sunrise.split(':');
            let sunriseHours = parseInt(sunriseTime[0]);
            const sunriseMinutes = sunriseTime[1];
            const sunriseAMPM = sunriseHours >= 12 ? 'PM' : 'AM';

            // Adjust hours for 12-hour format
            if (sunriseHours > 12) {
              sunriseHours -= 12;
            }

            const formattedSunrise = sunriseHours + ':' + sunriseMinutes + ' ' + sunriseAMPM;

            // Convert sunset time to 12-hour format with AM and PM
            const sunsetTime = sunset.split(':');
            let sunsetHours = parseInt(sunsetTime[0]);
            const sunsetMinutes = sunsetTime[1];
            const sunsetAMPM = sunsetHours >= 12 ? 'PM' : 'AM';

            // Adjust hours for 12-hour format
            if (sunsetHours > 12) {
              sunsetHours -= 12;
            }

            const formattedSunset = sunsetHours + ':' + sunsetMinutes + ' ' + sunsetAMPM;

            // Convert moonrise time to 12-hour format with AM and PM
            const moonriseTime = moonrise.split(':');
            let moonriseHours = parseInt(moonriseTime[0]);
            const moonriseMinutes = moonriseTime[1];
            const ampm = moonriseHours >= 12 ? 'PM' : 'AM';

            // Adjust hours for 12-hour format
            if (moonriseHours > 12) {
              moonriseHours -= 12;
            }

            const formattedMoonrise = moonriseHours + ':' + moonriseMinutes + ' ' + ampm;

            res.json({
              sunrise: formattedSunrise, // Sunrise time in 12-hour format
              sunset: formattedSunset,
              moonrise: formattedMoonrise, // Sunset time in 12-hour format
            });
          } else {
            console.error('City not found or data not available.');
            res.status(404).json({ error: 'City not found or data not available' });
          }
        } catch (error) {
          console.error('Error fetching data:', error);
          res.status(500).json({ error: 'Error fetching data' });
        }
      } else {
        console.error('City not found in the database.');
        res.status(404).json({ error: 'City not found in the database' });
      }
    }
  );
})

// get sunrise,sunset,moonrise time anydate
app.get("/daydate",authenticateToken,(req,res)=>{
  const id = req.query.id; // Get the id from the query parameter
  const date = req.query.date; // Get the date from the query parameter

  if (!id) {
    res.status(400).json({ error: 'id is required in the query parameter.' });
    return;
  }

  if (!date) {
    res.status(400).json({ error: 'Date is required in the query parameter.' });
    return;
  }

  connection.query(
    'SELECT lat, lng FROM city WHERE id = ?',
    [id],
    async (error, results) => {
      if (error) {
        console.error('Error querying the database:', error);
        res.status(500).json({ error: 'Internal server error' });
      } else if (results.length > 0) {
        const { lat, lng } = results[0];
        const apiKey = `e713563e7e4944648844ea977a1f550d`;
        const apiUrl = `https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&lat=${lat}&long=${lng}&formatted=0&date=${date}`;

        try {
          const response = await fetch(apiUrl);
          const data = await response.json();

          if (data) {
            const sunrise = data.sunrise;
            const sunset = data.sunset;
            const moonrise = data.moonrise;

            // Convert times to 12-hour format with AM and PM
            const formatTime = (time) => {
              const timeParts = time.split(':');
              let hours = parseInt(timeParts[0]);
              const minutes = timeParts[1];
              const ampm = hours >= 12 ? 'PM' : 'AM';

              if (hours > 12) {
                hours -= 12;
              }

              return `${hours}:${minutes} ${ampm}`;
            };

            const formattedSunrise = formatTime(sunrise);
            const formattedSunset = formatTime(sunset);
            const formattedMoonrise = formatTime(moonrise);

            res.json({
              sunrise: formattedSunrise, // Sunrise time in 12-hour format
              sunset: formattedSunset, // Sunset time in 12-hour format
              moonrise: formattedMoonrise, // Moonrise time in 12-hour format
            });
          } else {
            console.error('City not found or data not available.');
            res.status(404).json({ error: 'City not found or data not available' });
          }
        } catch (error) {
          console.error('Error fetching data:', error);
          res.status(500).json({ error: 'Error fetching data' });
        }
      } else {
        console.error('City not found in the database.');
        res.status(404).json({ error: 'City not found in the database' });
      }
    }
  );
})
// -----------------sunrise,sunset,moonrise end--------------



// -----------------------choghadiu start-------------------------------
// Your database connection and query logic to get lat and lng values
function getLatAndLng(id) {
  return new Promise((resolve, reject) => {
    connection.query('SELECT lat, lng FROM city WHERE id = ?', [id], (error, results) => {
      if (error) {
        reject(error);
      } else if (results.length > 0) {
        resolve(results[0]);
      } else {
        reject('City not found in the database');
      }
      
    });
  });
}

async function getSunriseAndSunset(id, selectedDate) {
  try {
    // Fetch lat and lng values from the database
    const { lat, lng } = await getLatAndLng(id);
    
    // Format the selectedDate as 'YYYY-MM-DD' for the API request
    const formattedDate = selectedDate.format('YYYY-MM-DD');

    const apiKey = 'e713563e7e4944648844ea977a1f550d';
    const response = await axios.get(`https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&lat=${lat}&long=${lng}&date=${formattedDate}&formatted=0`);
    
    if (response.status === 200) {
      const data = response.data;
      return { sunrise: moment(data.sunrise, 'h:mm:ss A'), sunset: moment(data.sunset, 'h:mm:ss A') };
    } else {
      console.error('API Request Failed:', response.status, response.statusText);
      throw new Error('Error fetching sunrise and sunset times');
    }
  } catch (error) {
    console.error('Error:', error.message);
    throw new Error('Error fetching sunrise and sunset times');
  }
}

// Helper function to generate Choghadiya time slots
function generateChoghadiyaSlots(sunrise, sunset, slotDurationMinutes, limit = 8) {
  const choghadiyaSlots = [];
  let currentTime = sunrise.clone();
  let count = 0;

  while (currentTime.isBefore(sunset) && count < limit - 1) {
    const endTime = currentTime.clone().add(slotDurationMinutes, 'minutes');
    choghadiyaSlots.push({ start: currentTime.format('h:mm A'), end: endTime.format('h:mm A') });
    currentTime = endTime;
    count++;
  }

  // Add the last slot that ends at sunset
  if (count < limit) {
    choghadiyaSlots.push({ start: currentTime.format('h:mm A'), end: sunset.format('h:mm A') });
  }

  return choghadiyaSlots;
}

// get day chogadiya
app.get("/daychoghadiya",authenticateToken,async(req,res)=>{
  try {
    const { id, date } = req.query;
    
    // Validate that both id and date are provided
    if (!id || !date) {
      res.status(400).json({ error: ' ID and date are required parameters' });
      return;
    }

    // Parse the date parameter into a Moment.js object
    const selectedDate = moment(date, 'YYYY-MM-DD');

    // Pass the city ID and selectedDate to getSunriseAndSunset function
    const { sunrise, sunset } = await getSunriseAndSunset(id, selectedDate);
    const choghadiyaSlots = generateChoghadiyaSlots(sunrise, sunset, 90, 8); // Limit to 8 slots

    res.json(choghadiyaSlots);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
})

  
  async function getNightChoghadiyaSlots(id, selectedDate) {
    try {
      // Fetch lat and lng values from the database
      const { lat, lng } = await getLatAndLng(id);

      const apiKey = 'e713563e7e4944648844ea977a1f550d';
      const response = await axios.get(`https://api.ipgeolocation.io/astronomy?apiKey=${apiKey}&lat=${lat}&long=${lng}&formatted=0&date=${selectedDate.format('YYYY-MM-DD')}`);

      if (response.status === 200) {
        const data = response.data;
        const sunset = moment(data.sunset, 'HH:mm:ss'); // Parse the sunset time

        // Generate 7 Choghadiya slots starting from sunset time with 1-hour 29-minute duration
        const choghadiyaSlots = [];
        let currentTime = sunset.clone();
        const duration = moment.duration({ hours: 1, minutes: 30 });

        for (let i = 0; i < 7; i++) {
          const endTime = currentTime.clone().add(duration);

          choghadiyaSlots.push({
            start: currentTime.format('h:mmA'),
            end: endTime.format('h:mmA'),
          });

          currentTime = endTime;
        }

        // Calculate the next sunrise time (for the end time of the last slot)
        const nextSunrise = moment(data.sunrise, 'HH:mm:ss').add(1, 'day');

        // Set the end time of the last slot to the next day's sunrise time
        choghadiyaSlots.push({
          start: currentTime.format('h:mmA'),
          end: nextSunrise.format('h:mmA'),
        });

        return choghadiyaSlots;
      } else {
        console.error('API Request Failed:', response.status, response.statusText);
        throw new Error('Error fetching sunset time');
      }
    } catch (error) {
      console.error('Error:', error.message);
      throw new Error('Error fetching night Choghadiya slots');
    }
  }

  // night choghadiya
  app.get("/nightchoghadiya",authenticateToken,async(req,res)=> {
    try {
      // Pass the city ID and selected date to getNightChoghadiyaSlots function
      const { id, date } = req.query;
      
      if (!id || !date) {
        res.status(400).json({ error: 'City ID and date are required parameters' });
        return;
      }

      const selectedDate = moment(date, 'YYYY-MM-DD');
      const choghadiyaSlots = await getNightChoghadiyaSlots(id, selectedDate);

      res.json(choghadiyaSlots);
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

// -----------------------choghadiu end-------------------------------

    }
  );
});

// Connect to the SSH server
sshTunnel.connect(sshConfig);
