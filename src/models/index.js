const { sequelize } = require("../config/database");

// Import TuVibe models
const AdminUser = require("./adminUser")(sequelize);
const PublicUser = require("./publicUser")(sequelize);
const TokenTransaction = require("./tokenTransaction")(sequelize);
const ChatUnlock = require("./chatUnlock")(sequelize);
const PremiumVerification = require("./premiumVerification")(sequelize);
const MarketItem = require("./marketItem")(sequelize);
const LookingForPost = require("./lookingForPost")(sequelize);
const Favourite = require("./favourite")(sequelize);
const Payment = require("./payment")(sequelize);
const Notification = require("./notification")(sequelize);
const ProfileView = require("./profileView")(sequelize);
const Report = require("./report")(sequelize);

const models = {
  AdminUser,
  PublicUser,
  TokenTransaction,
  ChatUnlock,
  PremiumVerification,
  MarketItem,
  LookingForPost,
  Favourite,
  Payment,
  Notification,
  ProfileView,
  Report,
};

// Initialize models in correct order (parent tables first)
const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating tables...");
    console.log("📋 Syncing tables...");

    await AdminUser.sync({ force: false, alter: false });
    await PublicUser.sync({ force: false, alter: true });

    await PremiumVerification.sync({ force: false, alter: false });
    await MarketItem.sync({ force: false, alter: false });

    await TokenTransaction.sync({ force: false, alter: false });
    await ChatUnlock.sync({ force: false, alter: false });
    await LookingForPost.sync({ force: false, alter: false });
    await Favourite.sync({ force: false, alter: false });
    await Payment.sync({ force: false, alter: false });
    await Notification.sync({ force: false, alter: false });
    await ProfileView.sync({ force: false, alter: false });
    await Report.sync({ force: false, alter: false });

    console.log("✅ All models synced successfully");
  } catch (error) {
    console.error("❌ Error syncing models:", error);
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      parent: error.parent?.message,
      original: error.original?.message,
      sql: error.sql,
    });
    throw error;
  }
};

const setupAssociations = () => {
  try {
    // PublicUser ↔ TokenTransaction
    models.PublicUser.hasMany(models.TokenTransaction, {
      foreignKey: "public_user_id",
      as: "tokenTransactions",
    });
    models.TokenTransaction.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "user",
    });

    // PublicUser ↔ ChatUnlock (initiated)
    models.PublicUser.hasMany(models.ChatUnlock, {
      foreignKey: "public_user_id",
      as: "initiatedChats",
    });
    models.ChatUnlock.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "initiator",
    });
    // PublicUser ↔ ChatUnlock (target)
    models.ChatUnlock.belongsTo(models.PublicUser, {
      foreignKey: "target_user_id",
      as: "target",
    });

    // PublicUser ↔ PremiumVerification
    models.PublicUser.hasOne(models.PremiumVerification, {
      foreignKey: "public_user_id",
      as: "premiumVerification",
    });
    models.PremiumVerification.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "publicUser",
    });
    models.PremiumVerification.belongsTo(models.AdminUser, {
      foreignKey: "admin_id",
      as: "admin",
    });
    models.AdminUser.hasMany(models.PremiumVerification, {
      foreignKey: "admin_id",
      as: "handledVerifications",
    });

    // AdminUser ↔ MarketItem
    models.AdminUser.hasMany(models.MarketItem, {
      foreignKey: "created_by",
      as: "marketItems",
    });
    models.MarketItem.belongsTo(models.AdminUser, {
      foreignKey: "created_by",
      as: "creator",
    });

    // PublicUser ↔ LookingForPost
    models.PublicUser.hasMany(models.LookingForPost, {
      foreignKey: "public_user_id",
      as: "lookingForPosts",
    });
    models.LookingForPost.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "author",
    });

    // PublicUser ↔ Favourite
    models.PublicUser.hasMany(models.Favourite, {
      foreignKey: "public_user_id",
      as: "favourites",
    });
    models.Favourite.belongsTo(models.PublicUser, {
      foreignKey: "favourite_user_id",
      as: "favouritedUser",
    });
    // Also link favourite record back to owner
    models.Favourite.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "owner",
    });

    // PublicUser ↔ Payment
    models.PublicUser.hasMany(models.Payment, {
      foreignKey: "public_user_id",
      as: "payments",
    });
    models.Payment.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "payer",
    });

    // PublicUser ↔ Notification
    models.PublicUser.hasMany(models.Notification, {
      foreignKey: "public_user_id",
      as: "notifications",
    });
    models.Notification.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "recipient",
    });

    // PublicUser ↔ ProfileView (viewer)
    models.PublicUser.hasMany(models.ProfileView, {
      foreignKey: "viewer_id",
      as: "viewsGiven",
    });
    models.ProfileView.belongsTo(models.PublicUser, {
      foreignKey: "viewer_id",
      as: "viewer",
    });

    // PublicUser ↔ ProfileView (viewed)
    models.PublicUser.hasMany(models.ProfileView, {
      foreignKey: "viewed_id",
      as: "viewsReceived",
    });
    models.ProfileView.belongsTo(models.PublicUser, {
      foreignKey: "viewed_id",
      as: "viewedUser",
    });

    // PublicUser ↔ Report (reporter)
    models.PublicUser.hasMany(models.Report, {
      foreignKey: "public_user_id",
      as: "reports",
    });
    models.Report.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "reporter",
    });

    // PublicUser ↔ Report (reported user)
    models.PublicUser.hasMany(models.Report, {
      foreignKey: "reported_user_id",
      as: "reportsAgainst",
    });
    models.Report.belongsTo(models.PublicUser, {
      foreignKey: "reported_user_id",
      as: "reportedUser",
    });

    // AdminUser ↔ Report
    models.AdminUser.hasMany(models.Report, {
      foreignKey: "admin_id",
      as: "handledReports",
    });
    models.Report.belongsTo(models.AdminUser, {
      foreignKey: "admin_id",
      as: "handledBy",
    });

    console.log("✅ All associations set up successfully");
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
  }
};

module.exports = { ...models, initializeModels, setupAssociations, sequelize };
