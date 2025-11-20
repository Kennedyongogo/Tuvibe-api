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

// Initialize models in correct order (parent tables first)
const initializeModels = async () => {
  try {
    console.log("🔄 Creating/updating tables...");
    console.log("📋 Syncing tables...");

    await AdminUser.sync({ force: false, alter: false });
    await PublicUser.sync({ force: false, alter: false });

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
    await ensureProfileBoostTargetAreaColumn();
    await ProfileBoost.sync({ force: false, alter: false });
    await ProfileTag.sync({ force: false, alter: false });
    await AccountSuspension.sync({ force: false, alter: false });
    await SuspensionMessage.sync({ force: false, alter: false });
    await StoryHighlight.sync({ force: false, alter: false });
    await StoryCollection.sync({ force: false, alter: false });
    await StoryChallenge.sync({ force: false, alter: false });
    await Story.sync({ force: false, alter: false });
    await StoryView.sync({ force: false, alter: false });
    await removeStoryReactionUniqueConstraint();
    await StoryReaction.sync({ force: false, alter: false });
    await StoryComment.sync({ force: false, alter: false });
    await Post.sync({ force: false, alter: false });
    await PostReaction.sync({ force: false, alter: false });
    await PostComment.sync({ force: false, alter: false });
    await CommentReaction.sync({ force: false, alter: false });

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

// Export models object directly along with spread to ensure associations work
module.exports = {
  ...models,
  models, // Also export models object directly for association access
  initializeModels,
  setupAssociations,
  sequelize,
};
