const express = require('express');
const path = require('path');
const collection = require('./config');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

let currentUsername = null;
let faceProcess;
let ocrProcess;
let latestDetectionStatus = false;
let latestReadingStatus = false;
let trackerRunning = false;
let inactivityTimer = null; // Timer for inactivity
let inactivityLimit =  30 * 1000; // 5 minutes in milliseconds
let inactivityStatus = false;

app.get('/', (req, res) => {
    res.render('landing');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.get('/home', (req, res) => {
    res.render('home');
});

app.get('/profile', async (req, res) => {
    try {
        const user = await collection.findOne({ name: currentUsername });
        if (!user) {
            return res.status(404).send('User not found');
        }

        const userData = {
            name: user.name,
            exp: user.exp,
            timeSpent: user.timeSpent || 0 // Assuming you have a field for time spent learning
        };

        res.render('profile', { user: userData });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).send('Error fetching user data');
    }
});

app.get('/leaderboard', async (req, res) => {
    try {
        const users = await collection.find().sort({ exp: -1 }).exec();
        res.render('leaderboard', { users });
    } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        res.status(500).send("Error fetching leaderboard data");
    }
});

app.get('/summarizer', (req, res) => {
    res.render('summarizer', { summary: null, error: null });
});

app.get('/inactivity-status', (req, res) => {
    res.json({ inactivity: inactivityStatus });
    inactivityStatus = false; // Reset the status after sending
});

app.post('/start-tracker', (req, res) => {
    if (faceProcess) {
        res.status(400).send('Tracker already running');
        return;
    }

    console.log("Starting OCR and face tracking scripts...");

    faceProcess = spawn('python', [path.join(__dirname, '..', 'python_modules', 'facelooking.py')]);

    faceProcess.stdout.on('data', (data) => {
        console.log(`Face tracking stdout: ${data}`);
        // Here you can parse the stdout data and send it to the client if needed.
    });

    faceProcess.stderr.on('data', (data) => {
        console.error(`Face tracking stderr: ${data}`);
    });

    faceProcess.on('close', (code) => {
        console.log(`Face tracking process exited with code ${code}`);
        faceProcess = null;
    });

    // Start the OCR script
    ocrProcess = spawn('python', [path.join(__dirname, '..', 'python_modules', 'ocr.py')]);

    ocrProcess.stdout.on('data', (data) => {
        console.log(`OCR stdout: ${data}`);
    });

    ocrProcess.stderr.on('data', (data) => {
        console.error(`OCR stderr: ${data}`);
    });

    ocrProcess.on('close', (code) => {
        console.log(`OCR process exited with code ${code}`);
    });

    trackerRunning = true;
    res.send('Tracker started');
});

app.post('/stop-tracker', (req, res) => {
    stopTracker();
    res.send('Tracker stopped');
});

function stopTracker() {
    if (faceProcess || ocrProcess) {
        faceProcess.kill();
        faceProcess = null;
        ocrProcess.kill();
        ocrProcess = null;
    }
    trackerRunning = false; // Set tracker running status to false
    clearTimeout(inactivityTimer); // Clear the inactivity timer
}

// Register User
app.post('/signup', async (req, res) => {
    const data = {
        name: req.body.username,
        password: req.body.password
    };

    const existingUser = await collection.findOne({ name: data.name });

    if (existingUser) {
        res.send('User already exists. Please choose a different username.');
    } else {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(data.password, saltRounds);

        data.password = hashedPassword;

        const userdata = await collection.insertMany(data);
        console.log(userdata);
        currentUsername = req.body.username;
        res.render('home');
    }
});

// Login user 
app.post('/login', async (req, res) => {
    try {
        const check = await collection.findOne({ name: req.body.username });
        if (!check) {
            res.send('User name not found');
        }
        const isPasswordMatch = await bcrypt.compare(req.body.password, check.password);
        if (!isPasswordMatch) {
            res.send('Wrong Password');
        } else {
            currentUsername = req.body.username;
            res.render('home');
        }
    } catch {
        res.send('Wrong Details');
    }
});

app.post('/detection-status', (req, res) => {
    const { is_looking } = req.body;
    // console.log('Detection status:', is_looking);
    latestDetectionStatus = is_looking;  // Store the latest detection status
    checkInactivity();
    res.sendStatus(200);
});

app.get('/detection-status', (req, res) => {
    // Return the latest detection status
    res.json({ is_looking: latestDetectionStatus });
});

app.post('/reading-status', (req, res) => {
    const { is_reading } = req.body;
    console.log('Received reading status:', is_reading);
    latestReadingStatus = is_reading;
    checkInactivity();
    res.sendStatus(200);
});


app.get('/reading-status', (req, res) => {
    // Return the latest detection status
    res.json({ is_reading: latestReadingStatus });
});

// Function to update Exp every 5 minutes
const updateExpPeriodically = async () => {
    setInterval(async () => {
        if (currentUsername && trackerRunning && latestDetectionStatus && latestReadingStatus) {
            try {
                const user = await collection.findOne({ name: currentUsername });
                if (user) {
                    user.exp += 1; // Increment Exp by 1 point
                    user.timeSpent += 5;
                    await user.save();
                    console.log(`Updated ${currentUsername}'s exp to ${user.exp}`);
                }
            } catch (error) {
                console.error('Error updating user exp:', error);
            }
        }
    // }, 5 * 60 * 1000); // 5 minutes interval
    }, 3 * 1000); //3 seconds interval
};

// Start the periodic update function
updateExpPeriodically();

// Function to check for inactivity
function checkInactivity() {
    if (!latestDetectionStatus || !latestReadingStatus) {
        if (!inactivityTimer) {
            inactivityTimer = setTimeout(() => {
                stopTracker();
                currentUsername = null; // Clear current username
                console.log("It has been 5 minutes since you took a break. Get back to studying");
                inactivityStatus = true;
            }, inactivityLimit);
        }
    } else {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
    }
}

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.render('summarizer', { summary: null, error: "No file uploaded" });
    }

    const filePath = path.join(uploadDir, req.file.filename);

    const pythonProcess = spawn('python', [path.join(__dirname, '..', 'python_modules', 'app.py'), filePath]);

    let summary = '';
    let error = null;

    pythonProcess.stdout.on('data', (data) => {
        summary += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        error = "Error processing file";
    });

    pythonProcess.on('close', (code) => {
        if (error) {
            res.render('summarizer', { summary: null, error });
        } else {
            res.render('summarizer', { summary, error: null });
        }
    });

    // Set a timeout for the Python process to prevent long loading times
    // setTimeout(() => {
    //     if (pythonProcess.exitCode === null) {
    //         pythonProcess.kill('SIGKILL');
    //         res.render('summarizer', { summary: null, error: "Processing timed out" });
    //     }
    // }, 180000); // 3 minutes
});

// Define Port for Application
const port = 5000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
