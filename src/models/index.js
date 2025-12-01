const { DataTypes } = require("sequelize");
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
const Subscription = require("./subscription")(sequelize);
const SubscriptionUsage = require("./subscriptionUsage")(sequelize);
const Notification = require("./notification")(sequelize);
const ProfileView = require("./profileView")(sequelize);
const Report = require("./report")(sequelize);
const ProfileTag = require("./profileTag")(sequelize);
const ProfileBoost = require("./profileBoost")(sequelize);
const AccountSuspension = require("./accountSuspension")(sequelize);
const SuspensionMessage = require("./suspensionMessage")(sequelize);
const Story = require("./story")(sequelize);
const StoryView = require("./storyView")(sequelize);
const StoryReaction = require("./storyReaction")(sequelize);
const StoryComment = require("./storyComment")(sequelize);
const StoryHighlight = require("./storyHighlight")(sequelize);
const StoryCollection = require("./storyCollection")(sequelize);
const StoryChallenge = require("./storyChallenge")(sequelize);
const StoryMusic = require("./storyMusic")(sequelize);
const Post = require("./post")(sequelize);
const PostReaction = require("./postReaction")(sequelize);
const PostComment = require("./postComment")(sequelize);
const CommentReaction = require("./commentReaction")(sequelize);

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
  Subscription,
  SubscriptionUsage,
  Subscription,
  Notification,
  ProfileView,
  Report,
  ProfileTag,
  ProfileBoost,
  AccountSuspension,
  SuspensionMessage,
  Story,
  StoryView,
  StoryReaction,
  StoryComment,
  StoryHighlight,
  StoryCollection,
  StoryChallenge,
  StoryMusic,
  Post,
  PostReaction,
  PostComment,
  CommentReaction,
};

const ensureProfileBoostTargetAreaColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const tableDefinition = await queryInterface.describeTable(
      "profile_boosts"
    );
    const currentType = tableDefinition?.target_area?.type?.toLowerCase?.();
    if (!currentType || currentType.includes("text")) {
      return;
    }
    console.log("🔧 Updating profile_boosts.target_area column to TEXT...");
    await queryInterface.changeColumn("profile_boosts", "target_area", {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    console.log("✅ profile_boosts.target_area column updated to TEXT");
  } catch (error) {
    const tableMissing =
      error?.original?.code === "42P01" ||
      error?.message?.toLowerCase?.().includes("does not exist");
    if (tableMissing) {
      console.log(
        "ℹ️ profile_boosts table not found yet; skipping target_area adjustment."
      );
      return;
    }
    console.error(
      "⚠️ Failed to adjust profile_boosts.target_area column:",
      error
    );
    throw error;
  }
};

const ensurePostShareCountColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const tableDefinition = await queryInterface.describeTable("posts");
    if (tableDefinition?.share_count) {
      console.log("ℹ️ share_count column already exists in posts table");
      return;
    }
    console.log("🔧 Adding share_count column to posts table...");
    await queryInterface.addColumn("posts", "share_count", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "share_count",
    });
    console.log("✅ share_count column added to posts table");
  } catch (error) {
    const tableMissing =
      error?.original?.code === "42P01" ||
      error?.message?.toLowerCase?.().includes("does not exist");
    if (tableMissing) {
      console.log(
        "ℹ️ posts table not found yet; share_count will be created during sync."
      );
      return;
    }
    const columnExists =
      error?.original?.code === "42701" ||
      error?.message?.toLowerCase?.().includes("already exists");
    if (columnExists) {
      console.log("ℹ️ share_count column already exists in posts table");
      return;
    }
    console.error("⚠️ Failed to add share_count column to posts table:", error);
    // Don't throw - allow sync to continue
  }
};

const ensureStoryMusicIdColumn = async () => {
  try {
    // Check if column exists
    const [columnCheck] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'stories' 
      AND column_name = 'music_id'
    `);

    if (columnCheck.length === 0) {
      console.log("🔧 Adding music_id column to stories table...");
      await sequelize.query(`
        ALTER TABLE stories 
        ADD COLUMN music_id UUID
      `);
      console.log("✅ music_id column added to stories table");
    } else {
      console.log("ℹ️ music_id column already exists in stories table");
    }

    // Check if foreign key constraint exists
    const [fkCheck] = await sequelize.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'stories' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%music_id%'
    `);

    if (fkCheck.length === 0) {
      console.log("🔧 Adding foreign key constraint for music_id...");
      await sequelize.query(`
        ALTER TABLE stories 
        ADD CONSTRAINT stories_music_id_fkey 
        FOREIGN KEY (music_id) 
        REFERENCES story_music(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
      `);
      console.log("✅ Foreign key constraint added for music_id");
    } else {
      console.log("ℹ️ Foreign key constraint for music_id already exists");
    }
  } catch (error) {
    const tableMissing =
      error?.original?.code === "42P01" ||
      error?.message?.toLowerCase?.().includes("does not exist");
    if (tableMissing) {
      console.log(
        "ℹ️ stories table not found yet; music_id will be created during sync."
      );
      return;
    }
    const columnExists =
      error?.original?.code === "42701" ||
      error?.message?.toLowerCase?.().includes("already exists");
    const constraintExists =
      error?.original?.code === "42710" ||
      error?.message?.toLowerCase?.().includes("already exists");
    if (columnExists || constraintExists) {
      console.log(
        "ℹ️ music_id column or constraint already exists in stories table"
      );
      return;
    }
    console.error("⚠️ Failed to add music_id column to stories table:", error);
    // Don't throw - allow sync to continue
  }
};

const ensurePublicUserIncognitoColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const tableDefinition = await queryInterface.describeTable("public_users");
    if (tableDefinition?.incognito_expires_at) {
      console.log("ℹ️ incognito_expires_at column already exists on public_users");
      return;
    }
    console.log("🔧 Adding incognito_expires_at column to public_users...");
    await queryInterface.addColumn("public_users", "incognito_expires_at", {
      type: DataTypes.DATE,
      allowNull: true,
      field: "incognito_expires_at",
    });
    console.log("✅ incognito_expires_at column added to public_users");
  } catch (error) {
    const tableMissing =
      error?.original?.code === "42P01" ||
      error?.message?.toLowerCase?.().includes("does not exist");
    if (tableMissing) {
      console.log(
        "ℹ️ public_users table missing; incognito_expires_at will be created during sync."
      );
      return;
    }
    const columnExists =
      error?.original?.code === "42701" ||
      error?.message?.toLowerCase?.().includes("already exists");
    if (columnExists) {
      console.log(
        "ℹ️ incognito_expires_at column already exists on public_users (race condition)"
      );
      return;
    }
    console.error(
      "⚠️ Failed to add incognito_expires_at column to public_users:",
      error
    );
    // Don't throw - allow sync to continue
  }
};

const ensureSubscriptionUsageIncognitoColumn = async () => {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const tableDefinition = await queryInterface.describeTable(
      "subscription_usage"
    );
    if (tableDefinition?.incognito_minutes_used) {
      console.log(
        "ℹ️ incognito_minutes_used column already exists on subscription_usage"
      );
      return;
    }
    console.log("🔧 Adding incognito_minutes_used column to subscription_usage...");
    await queryInterface.addColumn("subscription_usage", "incognito_minutes_used", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    console.log("✅ incognito_minutes_used column added to subscription_usage");
  } catch (error) {
    const tableMissing =
      error?.original?.code === "42P01" ||
      error?.message?.toLowerCase?.().includes("does not exist");
    if (tableMissing) {
      console.log(
        "ℹ️ subscription_usage table missing; incognito_minutes_used will be created during sync."
      );
      return;
    }
    const columnExists =
      error?.original?.code === "42701" ||
      error?.message?.toLowerCase?.().includes("already exists");
    if (columnExists) {
      console.log(
        "ℹ️ incognito_minutes_used column already exists on subscription_usage (race condition)"
      );
      return;
    }
    console.error(
      "⚠️ Failed to add incognito_minutes_used column to subscription_usage:",
      error
    );
    // Don't throw - allow sync to continue
  }
};

const removeStoryReactionUniqueConstraint = async () => {
  try {
    // Check if the unique index exists and drop it
    const [results] = await sequelize.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'story_reactions' 
      AND indexdef LIKE '%UNIQUE%' 
      AND indexdef LIKE '%story_id%' 
      AND indexdef LIKE '%user_id%'
    `);

    if (results && results.length > 0) {
      const indexName = results[0].indexname;
      console.log(`🔧 Dropping unique constraint: ${indexName}`);
      await sequelize.query(`DROP INDEX IF EXISTS "${indexName}"`);
      console.log(`✅ Unique constraint ${indexName} dropped successfully`);
    } else {
      console.log(
        "ℹ️ No unique constraint found on story_reactions (story_id, user_id)"
      );
    }
  } catch (error) {
    const tableMissing =
      error?.original?.code === "42P01" ||
      error?.message?.toLowerCase?.().includes("does not exist");
    if (tableMissing) {
      console.log(
        "ℹ️ story_reactions table not found yet; skipping unique constraint removal."
      );
      return;
    }
    console.error(
      "⚠️ Failed to remove unique constraint from story_reactions:",
      error
    );
    // Don't throw - allow sync to continue
  }
};

// Helper function to retry sync operations
const retrySync = async (model, modelName, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await model.sync({ force: false, alter: false });
      // Small delay between syncs to avoid overwhelming the database
      await new Promise((resolve) => setTimeout(resolve, 50));
      return;
    } catch (error) {
      const isConnectionError =
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNREFUSED" ||
        error.name === "SequelizeConnectionError" ||
        error.name === "SequelizeConnectionRefusedError" ||
        error.name === "SequelizeHostNotFoundError" ||
        error.name === "SequelizeConnectionTimedOutError" ||
        error.original?.code === "ECONNRESET" ||
        error.parent?.code === "ECONNRESET";

      if (isConnectionError && attempt < maxRetries) {
        console.warn(
          `⚠️ Connection error syncing ${modelName} (attempt ${attempt}/${maxRetries}): ${error.message}. Retrying in ${delay}ms...`
        );
        // Verify connection is still alive before retrying
        try {
          await sequelize.authenticate();
        } catch (authError) {
          console.warn(
            `⚠️ Connection lost, re-authenticating... (${authError.message})`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
};

// Initialize models in correct order (parent tables first)
const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating tables...");
    console.log("📋 Syncing tables...");

    // Verify database connection before syncing
    try {
      await sequelize.authenticate();
      console.log("✅ Database connection verified");
    } catch (error) {
      console.error("❌ Database connection failed:", error.message);
      throw new Error(
        `Cannot connect to database: ${error.message}. Please ensure PostgreSQL is running and connection settings are correct.`
      );
    }

    await retrySync(AdminUser, "AdminUser");
    await retrySync(PublicUser, "PublicUser");
    await ensurePublicUserIncognitoColumn();

    await retrySync(PremiumVerification, "PremiumVerification");
    await retrySync(MarketItem, "MarketItem");

    await retrySync(TokenTransaction, "TokenTransaction");
    await retrySync(ChatUnlock, "ChatUnlock");
    await retrySync(LookingForPost, "LookingForPost");
    await retrySync(Favourite, "Favourite");
    await retrySync(Payment, "Payment");
    await retrySync(Subscription, "Subscription");
    await retrySync(SubscriptionUsage, "SubscriptionUsage");
    await ensureSubscriptionUsageIncognitoColumn();
    await retrySync(Notification, "Notification");
    await retrySync(ProfileView, "ProfileView");
    await retrySync(Report, "Report");
    await ensureProfileBoostTargetAreaColumn();
    await retrySync(ProfileBoost, "ProfileBoost");
    await retrySync(ProfileTag, "ProfileTag");
    await retrySync(AccountSuspension, "AccountSuspension");
    await retrySync(SuspensionMessage, "SuspensionMessage");
    await retrySync(StoryHighlight, "StoryHighlight");
    await retrySync(StoryCollection, "StoryCollection");
    await retrySync(StoryChallenge, "StoryChallenge");
    await retrySync(StoryMusic, "StoryMusic");
    await ensureStoryMusicIdColumn();
    await retrySync(Story, "Story");
    await retrySync(StoryView, "StoryView");
    await removeStoryReactionUniqueConstraint();
    await retrySync(StoryReaction, "StoryReaction");
    await retrySync(StoryComment, "StoryComment");
    await ensurePostShareCountColumn();
    await retrySync(Post, "Post");
    await retrySync(PostReaction, "PostReaction");
    await retrySync(PostComment, "PostComment");
    await retrySync(CommentReaction, "CommentReaction");

    console.log("✅ All models synced successfully");
  } catch (error) {
    console.error("❌ Error syncing models:", error);
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      code: error.code || error.original?.code || error.parent?.code,
      parent: error.parent?.message,
      original: error.original?.message,
      sql: error.sql,
    });

    // Provide helpful error messages for common issues
    if (
      error.code === "ECONNRESET" ||
      error.original?.code === "ECONNRESET" ||
      error.parent?.code === "ECONNRESET"
    ) {
      console.error("\n💡 Troubleshooting tips for ECONNRESET:");
      console.error("   1. Verify PostgreSQL server is running");
      console.error("   2. Check database connection settings in .env file");
      console.error("   3. Verify network connectivity to database host");
      console.error("   4. Check if database server is overloaded");
      console.error("   5. Verify firewall rules allow connections");
    }

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

    // PublicUser ↔ Subscription
    models.PublicUser.hasMany(models.Subscription, {
      foreignKey: "public_user_id",
      as: "subscriptions",
    });
    models.Subscription.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "subscriber",
    });

    // PublicUser ↔ SubscriptionUsage
    models.PublicUser.hasMany(models.SubscriptionUsage, {
      foreignKey: "public_user_id",
      as: "subscriptionUsages",
    });
    models.SubscriptionUsage.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "usageOwner",
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

    // PublicUser ↔ ProfileBoost
    models.PublicUser.hasMany(models.ProfileBoost, {
      foreignKey: "public_user_id",
      as: "profileBoosts",
    });
    models.ProfileBoost.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "owner",
    });

    // PublicUser ↔ ProfileTag (creator)
    models.PublicUser.hasMany(models.ProfileTag, {
      foreignKey: "public_user_id",
      as: "createdProfileTags",
    });
    models.ProfileTag.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "tagger",
    });

    // PublicUser ↔ ProfileTag (tagged user)
    models.PublicUser.hasMany(models.ProfileTag, {
      foreignKey: "tagged_user_id",
      as: "receivedProfileTags",
    });
    models.ProfileTag.belongsTo(models.PublicUser, {
      foreignKey: "tagged_user_id",
      as: "taggedUser",
    });

    // AccountSuspension associations
    models.AccountSuspension.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "publicUser",
    });
    models.PublicUser.hasMany(models.AccountSuspension, {
      foreignKey: "public_user_id",
      as: "suspensions",
    });
    models.AccountSuspension.belongsTo(models.AdminUser, {
      foreignKey: "admin_user_id",
      as: "admin",
    });
    models.AdminUser.hasMany(models.AccountSuspension, {
      foreignKey: "admin_user_id",
      as: "issuedSuspensions",
    });

    // SuspensionMessage associations
    models.AccountSuspension.hasMany(models.SuspensionMessage, {
      foreignKey: "suspension_id",
      as: "messages",
      onDelete: "CASCADE",
    });
    models.SuspensionMessage.belongsTo(models.AccountSuspension, {
      foreignKey: "suspension_id",
      as: "suspension",
    });

    // Story associations
    models.PublicUser.hasMany(models.Story, {
      foreignKey: "public_user_id",
      as: "stories",
    });
    models.Story.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "user",
    });

    // StoryView associations
    models.Story.hasMany(models.StoryView, {
      foreignKey: "story_id",
      as: "views",
      onDelete: "CASCADE",
    });
    models.StoryView.belongsTo(models.Story, {
      foreignKey: "story_id",
      as: "story",
    });
    models.StoryView.belongsTo(models.PublicUser, {
      foreignKey: "viewer_id",
      as: "viewer",
    });
    models.PublicUser.hasMany(models.StoryView, {
      foreignKey: "viewer_id",
      as: "storyViews",
    });

    // StoryReaction associations
    models.Story.hasMany(models.StoryReaction, {
      foreignKey: "story_id",
      as: "reactions",
      onDelete: "CASCADE",
    });
    models.StoryReaction.belongsTo(models.Story, {
      foreignKey: "story_id",
      as: "story",
    });
    models.StoryReaction.belongsTo(models.PublicUser, {
      foreignKey: "user_id",
      as: "user",
    });
    models.PublicUser.hasMany(models.StoryReaction, {
      foreignKey: "user_id",
      as: "storyReactions",
    });

    // StoryComment associations
    models.Story.hasMany(models.StoryComment, {
      foreignKey: "story_id",
      as: "comments",
      onDelete: "CASCADE",
    });
    models.StoryComment.belongsTo(models.Story, {
      foreignKey: "story_id",
      as: "story",
    });
    models.StoryComment.belongsTo(models.PublicUser, {
      foreignKey: "user_id",
      as: "user",
    });
    models.PublicUser.hasMany(models.StoryComment, {
      foreignKey: "user_id",
      as: "storyComments",
    });
    models.StoryComment.hasMany(models.StoryComment, {
      foreignKey: "parent_comment_id",
      as: "replies",
    });
    models.StoryComment.belongsTo(models.StoryComment, {
      foreignKey: "parent_comment_id",
      as: "parentComment",
    });

    // StoryHighlight associations
    models.PublicUser.hasMany(models.StoryHighlight, {
      foreignKey: "public_user_id",
      as: "storyHighlights",
    });
    models.StoryHighlight.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "user",
    });
    models.StoryHighlight.hasMany(models.Story, {
      foreignKey: "highlight_id",
      as: "stories",
    });
    models.Story.belongsTo(models.StoryHighlight, {
      foreignKey: "highlight_id",
      as: "highlight",
    });

    // StoryCollection associations
    models.StoryCollection.belongsTo(models.PublicUser, {
      foreignKey: "created_by",
      as: "creator",
    });
    models.PublicUser.hasMany(models.StoryCollection, {
      foreignKey: "created_by",
      as: "createdCollections",
    });
    models.StoryCollection.hasMany(models.Story, {
      foreignKey: "collection_id",
      as: "stories",
    });
    models.Story.belongsTo(models.StoryCollection, {
      foreignKey: "collection_id",
      as: "collection",
    });

    // StoryChallenge associations
    models.StoryChallenge.belongsTo(models.PublicUser, {
      foreignKey: "created_by",
      as: "creator",
    });
    models.PublicUser.hasMany(models.StoryChallenge, {
      foreignKey: "created_by",
      as: "createdChallenges",
    });
    models.StoryChallenge.hasMany(models.Story, {
      foreignKey: "challenge_id",
      as: "stories",
    });
    models.Story.belongsTo(models.StoryChallenge, {
      foreignKey: "challenge_id",
      as: "challenge",
    });

    // StoryMusic associations
    models.StoryMusic.hasMany(models.Story, {
      foreignKey: "music_id",
      as: "stories",
    });
    models.Story.belongsTo(models.StoryMusic, {
      foreignKey: "music_id",
      as: "music",
    });

    // Post associations
    models.PublicUser.hasMany(models.Post, {
      foreignKey: "public_user_id",
      as: "posts",
    });
    models.Post.belongsTo(models.PublicUser, {
      foreignKey: "public_user_id",
      as: "user",
    });

    // PostReaction associations
    models.Post.hasMany(models.PostReaction, {
      foreignKey: "post_id",
      as: "reactions",
      onDelete: "CASCADE",
    });
    models.PostReaction.belongsTo(models.Post, {
      foreignKey: "post_id",
      as: "post",
    });
    models.PostReaction.belongsTo(models.PublicUser, {
      foreignKey: "user_id",
      as: "user",
    });
    models.PublicUser.hasMany(models.PostReaction, {
      foreignKey: "user_id",
      as: "postReactions",
    });

    // PostComment associations
    models.Post.hasMany(models.PostComment, {
      foreignKey: "post_id",
      as: "comments",
      onDelete: "CASCADE",
    });
    models.PostComment.belongsTo(models.Post, {
      foreignKey: "post_id",
      as: "post",
    });
    models.PostComment.belongsTo(models.PublicUser, {
      foreignKey: "user_id",
      as: "user",
    });
    models.PublicUser.hasMany(models.PostComment, {
      foreignKey: "user_id",
      as: "postComments",
    });
    models.PostComment.hasMany(models.PostComment, {
      foreignKey: "parent_comment_id",
      as: "replies",
    });
    models.PostComment.belongsTo(models.PostComment, {
      foreignKey: "parent_comment_id",
      as: "parentComment",
    });

    // CommentReaction associations
    models.PostComment.hasMany(models.CommentReaction, {
      foreignKey: "comment_id",
      as: "reactions",
      onDelete: "CASCADE",
    });
    models.CommentReaction.belongsTo(models.PostComment, {
      foreignKey: "comment_id",
      as: "comment",
    });
    models.CommentReaction.belongsTo(models.PublicUser, {
      foreignKey: "user_id",
      as: "user",
    });
    models.PublicUser.hasMany(models.CommentReaction, {
      foreignKey: "user_id",
      as: "commentReactions",
    });

    console.log("✅ All associations set up successfully");
  } catch (error) {
    console.error("❌ Error during setupAssociations:", error);
  }
};

const syncAllModelsWithOptions = async (options = { force: false, alter: false }) => {
  const syncOrder = [
    "AdminUser",
    "PublicUser",
    "PremiumVerification",
    "MarketItem",
    "TokenTransaction",
    "ChatUnlock",
    "LookingForPost",
    "Favourite",
    "Payment",
    "Subscription",
    "SubscriptionUsage",
    "Notification",
    "ProfileView",
    "Report",
    "ProfileBoost",
    "ProfileTag",
    "AccountSuspension",
    "SuspensionMessage",
    "StoryHighlight",
    "StoryCollection",
    "StoryChallenge",
    "StoryMusic",
    "Story",
    "StoryView",
    "StoryReaction",
    "StoryComment",
    "Post",
    "PostReaction",
    "PostComment",
    "CommentReaction",
  ];

  for (const modelName of syncOrder) {
    const model = models[modelName];
    if (!model) continue;
    console.log(
      `🔁 Syncing ${modelName} with options force=${options.force} alter=${options.alter}`
    );
    await model.sync(options);
  }
};

// Export models object directly along with spread to ensure associations work
module.exports = {
  ...models,
  models, // Also export models object directly for association access
  initializeModels,
  setupAssociations,
  syncAllModelsWithOptions,
  sequelize,
};
