const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Use environment variable or fallback to default local MongoDB
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/harmony-iot';

        if (!process.env.MONGODB_URI) {
            console.warn('⚠️  MONGODB_URI not found in environment variables. Using default: mongodb://localhost:27017/harmony-iot');
            console.warn('⚠️  Create a .env file in the root directory for production use.');
        }

        const conn = await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📚 Database: ${conn.connection.name}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        console.error('💡 Make sure MongoDB is running on your system.');
        console.error('   Windows: Check MongoDB service in Services');
        console.error('   Mac/Linux: Run "mongod" or check if MongoDB service is running');
        process.exit(1);
    }
};

module.exports = connectDB;
