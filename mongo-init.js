// MongoDB initialization script
db = db.getSiblingDB('card-adder');

// Create collections
db.createCollection('users');
db.createCollection('cards');
db.createCollection('jobs');
db.createCollection('stats');

// Create indexes
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "username": 1 }, { unique: true });
db.cards.createIndex({ "userId": 1 });
db.jobs.createIndex({ "userId": 1 });
db.jobs.createIndex({ "status": 1 });

print('Database initialized successfully!'); 