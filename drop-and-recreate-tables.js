/**
 * Script to drop and recreate all database tables
 * This uses the existing syncAllModelsWithOptions function from models/index.js
 * 
 * WARNING: This will DELETE ALL DATA in your database!
 * 
 * Usage: node drop-and-recreate-tables.js
 */

require("dotenv").config();
const { syncAllModelsWithOptions, setupAssociations, sequelize } = require("./src/models");

async function dropAndRecreateTables() {
  try {
    console.log("⚠️  WARNING: This will DROP ALL TABLES and DELETE ALL DATA!");
    console.log("🔄 Starting table drop and recreation...\n");

    // Verify database connection
    await sequelize.authenticate();
    console.log("✅ Database connection verified\n");

    // Drop and recreate all tables with force: true
    console.log("🗑️  Dropping all existing tables...");
    await syncAllModelsWithOptions({ force: true, alter: false });
    console.log("✅ All tables dropped and recreated\n");

    // Setup associations after tables are created
    console.log("🔗 Setting up model associations...");
    setupAssociations();
    console.log("✅ Associations configured\n");

    console.log("✅ SUCCESS: All tables have been dropped and recreated!");
    console.log("✅ Your database is now fresh and ready to use.");
    
    // Close the database connection
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error dropping and recreating tables:", error);
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      code: error.code || error.original?.code || error.parent?.code,
    });
    await sequelize.close();
    process.exit(1);
  }
}

// Run the script
dropAndRecreateTables();

