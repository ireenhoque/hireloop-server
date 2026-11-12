import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

const client = new MongoClient(`mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@ac-snt1vpk-shard-00-00.no0zmbq.mongodb.net:27017,ac-snt1vpk-shard-00-01.no0zmbq.mongodb.net:27017,ac-snt1vpk-shard-00-02.no0zmbq.mongodb.net:27017/?ssl=true&replicaSet=atlas-go3jyo-shard-0&authSource=admin`);


export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1); // stop the server instead of crashing later with a confusing error
    }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db("loopadmin");
const users = database.collection("user");
const jobs = database.collection("jobs");

app.get('/', (req, res) => {
    res.send('HireLoop Server is running');
})


app.get('/users', async (req, res) => {
    const cursor = users.find({}, { projection: { password: 0 } }); // never send passwords
    const result = await cursor.toArray();
    res.send(result);
})

// jobs related apis
app.get('/jobs', async (req, res) => {

    const query = {};
    // console.log('Query:', req.query);
    const { jobType, isRemote, search, category } = req.query;

    if (jobType) {
        const escaped = jobType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.jobType = { $regex: new RegExp(`^${escaped}$`, "i") };
    }

    if (isRemote) {
        query.isRemote = isRemote === 'true'; // "true" (string) → true (boolean)
    }

    if (category) {
        query.category = category;
    }

    // Case-insensitive search across multiple fields
    if (search) {
        // Escape regex special characters so input like "next(" doesn't crash the query
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
            { title: { $regex: escaped, $options: 'i' } },
            { responsibilities: { $regex: escaped, $options: 'i' } },
            { qualifications: { $regex: escaped, $options: 'i' } }
        ];
    }

    const cursor = jobs.find(query);
    const result = await cursor.toArray();
    res.send(result);
})


app.post('/jobs', async (req, res) => {
    const job = req.body;

    // Basic validation: reject if required fields are missing
    const requiredFields = ['title', 'companyName', 'category', 'jobType', 'location', 'deadline'];
    const missing = requiredFields.filter(field => !job[field]);
    if (missing.length > 0) {
        return res.status(400).send({ message: `Missing required fields: ${missing.join(', ')}` });
    }

    // Sensible defaults for optional fields
    job.status = job.status || 'Active';
    job.applicants = job.applicants || 0;

    const result = await jobs.insertOne(job);
    res.send(result);
})

app.delete('/jobs/:id', async (req, res) => {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid job id' });
    }
    const query = { _id: new ObjectId(id) };
    const result = await jobs.deleteOne(query);
    res.send(result);
})


app.listen(port, () => {
    console.log(`HireLoop Server is running on port: ${port}`);
})